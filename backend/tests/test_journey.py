"""Integration checks against isolated SQLite and in-process sandbox HTTP adapters."""
import asyncio
import json
import os
import tempfile
import unittest
import logging
from pathlib import Path

_tmp = tempfile.TemporaryDirectory(prefix="disputepro-journey-")
os.environ["SANDBOX_DB"] = str(Path(_tmp.name) / "sandbox.db")
os.environ["LEDGER_PATH"] = str(Path(_tmp.name) / "ledger.db")
os.environ["LLM_PROVIDER"] = "rules"
os.environ["NEATLOGS_API_KEY"] = ""

import httpx
import main
logging.getLogger("httpx").setLevel(logging.WARNING)
from desk import store, supervisor
from engine import parties
from engine.orchestrator import orchestrate, decide
from engine.run import Run
from sandbox import db

class JourneyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        db.reset()
        supervisor.RUNS.clear()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test")
        self.old_client = parties._client
        parties._client = self.client

    async def asyncTearDown(self):
        parties._client = self.old_client
        await self.client.aclose()

    async def drive(self, case):
        run = Run(supervisor._run_case(case), "rules", 0)
        supervisor.RUNS[run.id] = run
        store.update_case(case["id"], status="WORKING", run_id=run.id)
        await supervisor._drive(run, case["id"], orchestrate(run))
        return run, store.get_case(case["id"])

    def payment(self, customer, mode=None):
        sql = "SELECT t.* FROM cbs_transactions t JOIN cbs_customers c ON c.account_no=t.account_no WHERE c.id=?"
        return db.q1(sql + (" AND t.mode=?" if mode else ""), *([customer, mode] if mode else [customer]))

    async def test_refund_and_persistent_replay(self):
        t = db.q1("SELECT t.* FROM cbs_transactions t JOIN cbs_customers c ON c.account_no=t.account_no JOIN npci_transactions n ON n.utr=t.utr WHERE c.id=? AND n.overall='DEEMED' AND n.reversal_leg!='SUCCESS'", "rahul")
        response = await self.client.post("/channels/udir", json={"customer_id":"rahul", "utr":t["utr"], "text":"Recipient did not receive my payment"})
        self.assertEqual(response.status_code, 200)
        run, c = await self.drive(response.json())
        self.assertEqual(c["status"], "RESOLVED")
        self.assertGreater(c["outcome"]["refunded_paise"], 0)
        self.assertTrue(c["outcome"]["findings"]["evidence"])
        supervisor.RUNS.clear()  # simulate event lookup after a process restart
        response = await self.client.get(f"/api/runs/{run.id}/events")
        self.assertEqual(response.status_code, 200)
        events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]
        self.assertTrue(any(e["type"] == "run_finished" for e in events))
        self.assertTrue(store.messages_for_case(c["id"])[-1]["sender"] == "bank")
        # A repeated complaint must not credit the ledger twice.
        postings = db.q1("SELECT COUNT(*) AS n FROM cbs_postings WHERE utr_ref=? AND type='REVERSAL'", t["utr"])["n"]
        again = supervisor.customer_message("rahul", "Please check again", "UDIR", utr=t["utr"])
        _, repeated = await self.drive(again)
        self.assertEqual(repeated["outcome"]["case_type"], "ALREADY_RESOLVED")
        self.assertEqual(db.q1("SELECT COUNT(*) AS n FROM cbs_postings WHERE utr_ref=? AND type='REVERSAL'", t["utr"])["n"], postings)

    async def test_clarification_is_case_scoped(self):
        first = supervisor.customer_message("rahul", "Please help", "CHAT")
        _, c = await self.drive(first)
        self.assertEqual(c["status"], "NEEDS_INFO")
        other = supervisor.customer_message("rahul", "A separate issue", "CHAT")
        self.assertNotEqual(other["id"], c["id"])
        response = await self.client.post("/channels/chat", json={"customer_id":"rahul", "case_id":c["id"], "text":"The 5000 payment"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["id"], c["id"])
        self.assertEqual(response.json()["status"], "QUEUED")
        wrong = await self.client.post("/channels/chat", json={"customer_id":"neha", "case_id":c["id"], "text":"Reply"})
        self.assertEqual(wrong.status_code, 404)
        blank = await self.client.post("/channels/chat", json={"customer_id":"rahul", "text":"   "})
        self.assertEqual(blank.status_code, 422)

    async def test_approval_then_confirmed_execution(self):
        t = self.payment("sunita", "COLLECT")
        c = supervisor.customer_message("sunita", "I was tricked by a collect request, please help", "UDIR", utr=t["utr"])
        run, c = await self.drive(c)
        self.assertEqual(c["status"], "NEEDS_YOU")
        self.assertEqual(c["outcome"]["frozen_paise"], 0)
        self.assertNotIn("already asked", store.messages_for_case(c["id"])[-1]["text"])
        no_reason = await self.client.post(f"/api/runs/{run.id}/decision", json={"approve":False})
        self.assertEqual(no_reason.status_code, 422)
        run.closed = False
        await supervisor._drive(run, c["id"], decide(run, True, "Test reviewer"))
        done = store.get_case(c["id"])
        self.assertEqual(done["status"], "RESOLVED")
        self.assertGreater(done["outcome"]["frozen_paise"], 0)
        self.assertTrue(any(e["type"] == "resume" for e in run.history))
        duplicate = await self.client.post(f"/api/runs/{run.id}/decision", json={"approve":True})
        self.assertEqual(duplicate.status_code, 409)

    async def test_decline_preserves_reason(self):
        t = self.payment("sunita", "COLLECT")
        run,c = await self.drive(supervisor.customer_message("sunita", "Scam collect request", "UDIR", utr=t["utr"]))
        run.facts["review_reason"] = "Need additional counterparty evidence"
        run.closed = False
        await supervisor._drive(run,c["id"],decide(run,False,"Test reviewer"))
        self.assertEqual(store.get_case(c["id"])["status"], "ESCALATED")
        self.assertTrue(any("additional counterparty" in str(e) for e in run.history))
        self.assertEqual(db.q1("SELECT COUNT(*) AS n FROM bene_liens")["n"], 0)

    async def test_changed_approval_plan_is_not_executed(self):
        t = db.q1("SELECT t.* FROM cbs_transactions t JOIN cbs_customers c ON c.account_no=t.account_no JOIN npci_transactions n ON n.utr=t.utr WHERE c.id=? AND n.overall='DEEMED' AND n.reversal_leg!='SUCCESS'", "rahul")
        import config
        previous = config.AUTO_APPROVE_LIMIT_PAISE
        config.AUTO_APPROVE_LIMIT_PAISE = 1
        try:
            run,c = await self.drive(supervisor.customer_message("rahul", "Recipient not credited", "UDIR", utr=t["utr"]))
            self.assertEqual(c["status"], "NEEDS_YOU")
            db.ex("UPDATE npci_transactions SET credit_leg='SUCCESS', tcc='TEST-CONFIRMED' WHERE utr=?", t["utr"])
            run.closed = False
            await supervisor._drive(run,c["id"],decide(run,True,"Test reviewer"))
            self.assertEqual(db.q1("SELECT COUNT(*) AS n FROM cbs_postings WHERE utr_ref=? AND type='REVERSAL'",t["utr"])["n"],0)
            self.assertTrue(any("Approval paused" in str(e) for e in run.history))
        finally:
            config.AUTO_APPROVE_LIMIT_PAISE = previous

    async def test_customer_can_request_review(self):
        c = supervisor.customer_message("rahul", "A payment question", "CHAT")
        store.update_case(c["id"],status="RESOLVED")
        response = await self.client.post("/channels/chat",json={"customer_id":"rahul","case_id":c["id"],"text":"I have additional evidence","request_review":True})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()["status"],"ESCALATED")

    async def test_partial_execution_keeps_confirmed_actions(self):
        from unittest.mock import patch
        from engine import executor
        t = db.q1("SELECT t.* FROM cbs_transactions t JOIN cbs_customers c ON c.account_no=t.account_no JOIN npci_transactions n ON n.utr=t.utr WHERE c.id=? AND n.overall='DEEMED' AND n.reversal_leg!='SUCCESS'", "rahul")
        original = executor.execute
        async def interrupt(run, actions):
            await original(run, actions[:1])
            raise RuntimeError("Counterparty unavailable during the next action")
        with patch.object(executor, "execute", interrupt), self.assertLogs("desk", level="ERROR"):
            run,c = await self.drive(supervisor.customer_message("rahul", "Not credited", "UDIR", utr=t["utr"]))
        self.assertEqual(c["status"], "FAILED")
        self.assertTrue(any(a["state"] == "done" for a in c["outcome"]["actions"]))
        self.assertTrue(any(a["state"] == "failed" for a in c["outcome"]["actions"]))
        self.assertTrue(any(e["type"] == "run_failed" and e.get("outcome") for e in run.history))

    async def test_recon_waits_unless_autopilot(self):
        supervisor.STATE["autopilot"] = False
        await self.client.post("/api/desk/recon")
        loop = asyncio.create_task(supervisor.loop())
        await asyncio.sleep(.05)
        loop.cancel()
        try:
            await loop
        except asyncio.CancelledError:
            pass
        self.assertFalse(supervisor.RUNS)
        self.assertTrue(all(c["status"] == "QUEUED" for c in store.list_cases() if c["channel"] == "RECON"))

    async def test_recon_runs_on_autopilot(self):
        supervisor.STATE["autopilot"] = True
        response = await self.client.post("/api/desk/recon")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(any(c["channel"] == "RECON" for c in store.list_cases()))
        loop = asyncio.create_task(supervisor.loop())
        await asyncio.sleep(.05)
        loop.cancel()
        try:
            await loop
        except asyncio.CancelledError:
            pass
        self.assertTrue(supervisor.RUNS)
        for run in supervisor.RUNS.values():
            run.pace = 0
        await asyncio.gather(*list(supervisor._tasks))

if __name__ == "__main__":
    unittest.main()
