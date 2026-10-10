"""DisputePro API. /api runs the agents (SSE); /sandbox hosts the simulated counterparties."""

import asyncio
import contextlib
import json
from datetime import datetime, time, timedelta

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import agent_mcp
import config
import ledger
import mcp_server
from engine.cases import build_cases, by_id
from engine.orchestrator import decide, orchestrate
from engine.parties import PARTIES
from engine.rules import IST
from engine.run import Run
from sandbox import db
from sandbox.routes import router as sandbox_router

_mcp_app = mcp_server.http_app()


@contextlib.asynccontextmanager
async def lifespan(_app):
    async with mcp_server.server.session_manager.run():
        yield


app = FastAPI(title="DisputePro", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(sandbox_router)
app.include_router(agent_mcp.router)  # per-agent tool endpoints the Codex agents connect to
app.mount("/mcp", _mcp_app)  # DisputePro MCP server (cfo.ai, Claude Code)

PACES = {"slow": 1.0, "normal": 0.5, "fast": 0.18, "instant": 0.0}
RUNS: dict[str, Run] = {}


def _sse(run: Run, work):
    async def body():
        task = asyncio.create_task(work())
        while True:
            getter = asyncio.create_task(run.queue.get())
            done, _ = await asyncio.wait({getter, task}, return_when=asyncio.FIRST_COMPLETED)
            if getter in done:
                ev = getter.result()
                if ev["type"] == "run_finished":
                    ledger.record(run, ev["outcome"], config.model_name())
                yield f"data: {json.dumps(ev, default=str)}\n\n"
                continue
            getter.cancel()
            while not run.queue.empty():
                yield f"data: {json.dumps(run.queue.get_nowait(), default=str)}\n\n"
            if task.exception():
                yield f"data: {json.dumps({'type': 'run_failed', 'error': str(task.exception())})}\n\n"
            break

    return StreamingResponse(body(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/metrics")
def metrics():
    """Same numbers as the MCP desk_metrics tool, as plain JSON (for cfo.ai's API connector)."""
    return {**ledger.summary(), "agent_model": config.model_name(), "recent_runs": ledger.runs(10)}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/meta")
def meta():
    return {"brain": config.brain(), "brain_label": config.brain_label(), "model": config.model_name(), "parties": PARTIES,
            "auto_approve_limit_paise": config.AUTO_APPROVE_LIMIT_PAISE, "neatlogs": bool(config.NEATLOGS_API_KEY)}


def _with_deadline(c: dict) -> dict:
    t = db.q1("SELECT initiated_at FROM npci_transactions WHERE utr=?", c["utr"])
    deadline = None
    if t and c.get("tat_days"):
        d = datetime.fromisoformat(t["initiated_at"]).date() + timedelta(days=c["tat_days"])
        deadline = datetime.combine(d, time(23, 59, 59), IST).isoformat(timespec="seconds")
    n = db.q1("SELECT reversal_leg, tcc FROM npci_transactions WHERE utr=?", c["utr"]) or {}
    resolved = None
    if n.get("reversal_leg") == "SUCCESS":
        resolved = "₹0 penalty · resolved in time"
    elif db.q1("SELECT 1 FROM bene_liens WHERE utr=?", c["utr"]):
        resolved = "Funds frozen"
    return {**c, "initiated_at": t["initiated_at"] if t else None, "deadline_at": deadline, "resolved": resolved}


@app.get("/api/cases")
def cases():
    return [_with_deadline(c) for c in build_cases()]


@app.get("/api/customers")
def customers():
    return db.q("SELECT id, name, vpa FROM cbs_customers ORDER BY name")


@app.get("/api/customers/{customer_id}/transactions")
def customer_transactions(customer_id: str):
    c = db.q1("SELECT account_no FROM cbs_customers WHERE id=?", customer_id)
    if not c:
        raise HTTPException(404, "Unknown customer")
    out = db.q("SELECT utr, amount_paise, counterparty_vpa, counterparty_name, kind, mode, initiated_at, status, 'OUT' AS direction "
               "FROM cbs_transactions WHERE account_no=?", c["account_no"])
    inward = db.q("SELECT utr, amount_paise, remitter_vpa AS counterparty_vpa, remitter_name AS counterparty_name, 'P2P' AS kind, "
                  "'PUSH' AS mode, received_at AS initiated_at, credit_status AS status, 'IN' AS direction FROM cbs_inward WHERE account_no=?", c["account_no"])
    return sorted(out + inward, key=lambda t: t["initiated_at"], reverse=True)


class RunRequest(BaseModel):
    case_id: str | None = None
    customer_id: str | None = None
    utr: str | None = None
    complaint: str | None = None
    pace: str = "normal"


@app.post("/api/runs")
async def start_run(req: RunRequest):
    if req.case_id:
        found = by_id(req.case_id)
        if not found:
            raise HTTPException(404, "Unknown case")
        case = {**found}
        if req.complaint:
            case["complaint"] = req.complaint
    else:
        if not (req.customer_id and req.utr and req.complaint):
            raise HTTPException(422, "customer_id, utr and complaint are required")
        cust = db.q1("SELECT name, account_no FROM cbs_customers WHERE id=?", req.customer_id)
        acct = cust["account_no"] if cust else ""
        txn = (db.q1("SELECT amount_paise FROM cbs_transactions WHERE utr=? AND account_no=?", req.utr, acct)
               or db.q1("SELECT amount_paise FROM cbs_inward WHERE utr=? AND account_no=?", req.utr, acct))
        if not cust or not txn:
            raise HTTPException(404, "UTR does not belong to this customer")
        case = {"id": "custom", "title": "New complaint", "subtitle": "", "trigger": "complaint", "role": "Remitter bank", "rule": "",
                "customer_id": req.customer_id, "customer_name": cust["name"], "utr": req.utr,
                "amount_paise": txn["amount_paise"], "complaint": req.complaint}
    pace = PACES.get(req.pace, PACES["normal"]) if config.brain() == "rules" else 0.05  # real model latency, no fake delays
    run = Run(case, config.brain(), pace)
    RUNS[run.id] = run
    return _sse(run, lambda: orchestrate(run))


class Decision(BaseModel):
    approve: bool
    reviewer: str = "Ops reviewer"


@app.post("/api/runs/{run_id}/decision")
async def run_decision(run_id: str, body: Decision):
    run = RUNS.get(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    if run.status != "AWAITING_APPROVAL":
        raise HTTPException(409, f"Run is {run.status}, not awaiting approval")
    run.status = "DECIDING"
    return _sse(run, lambda: decide(run, body.approve, body.reviewer))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=config.PORT)
