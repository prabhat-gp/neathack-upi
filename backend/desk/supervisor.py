"""Supervisor: works the case queue without anyone pressing a button.

Customer complaints (UPI app / chat) start as soon as they arrive. Reconciliation exceptions wait for autopilot or a
person to start them. Each case runs the full agent pipeline as one Run; when it ends, the outcome is written back to
the case and the customer gets a reply on the channel they used.
"""

import asyncio
import logging

import config
import ledger
from engine.caseinfo import case_fields
from engine.orchestrator import decide, orchestrate
from engine.run import Run
from sandbox import db

from . import store

log = logging.getLogger("desk")
RUNS: dict[str, Run] = {}
STATE = {"autopilot": False}
_tasks: set[asyncio.Task] = set()


def active_runs() -> int:
    return sum(1 for r in RUNS.values() if not r.closed)


def _run_case(c: dict) -> dict:
    """The case as the agents see it."""
    cust = db.q1("SELECT name FROM cbs_customers WHERE id=?", c["customer_id"])
    sweep = c["channel"] == "RECON"
    base = {"id": c["id"], "channel": store.CHANNEL_LABEL.get(c["channel"], c["channel"]), "trigger": "sweep" if sweep else "complaint",
            "customer_id": c["customer_id"], "customer_name": cust["name"] if cust else c["customer_id"],
            "complaint": "" if sweep else c["message"], "title": c.get("headline") or c["message"][:80], "utr": c["utr"]}
    if c["utr"]:
        base.update(case_fields(c["utr"]))
        if sweep:
            base["settlement_date"] = (base.get("initiated_at") or db.iso(db.now()))[:10]
    return base


def start(case_id: str) -> Run:
    c = store.get_case(case_id)
    run = Run(_run_case(c), config.brain(), 0.05 if config.brain() != "rules" else 0.25)
    RUNS[run.id] = run
    store.update_case(case_id, status="WORKING", run_id=run.id)
    _spawn(_drive(run, case_id, orchestrate(run)))
    return run


def decide_case(run: Run, approve: bool, reviewer: str) -> None:
    run.closed = False
    case_id = run.case["id"]
    store.update_case(case_id, status="WORKING")
    _spawn(_drive(run, case_id, decide(run, approve, reviewer)))


def _spawn(coro) -> None:
    t = asyncio.create_task(coro)
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)


async def _drive(run: Run, case_id: str, work) -> None:
    try:
        await work
        o = run.facts.get("outcome") or {}
        _apply(run, case_id, o)
    except Exception as e:  # never leave a case stuck in WORKING
        log.exception("case %s failed", case_id)
        await run.emit("run_failed", error=str(e))
        store.update_case(case_id, status="FAILED", headline=f"Agent run failed: {str(e)[:120]}")
    finally:
        run.close()


def _apply(run: Run, case_id: str, o: dict) -> None:
    c = store.get_case(case_id)
    status = {"AWAITING_APPROVAL": "NEEDS_YOU", "NEEDS_INFO": "NEEDS_INFO", "ESCALATED": "ESCALATED"}.get(o.get("status"), "RESOLVED")
    store.update_case(case_id, status=status, headline=o.get("headline"), outcome={k: v for k, v in o.items() if k not in ("after", "findings")},
                      utr=run.case.get("utr") or c["utr"])
    if status != "NEEDS_INFO":
        ledger.record(run, o, config.model_name())
    ch = "SMS" if c["channel"] == "RECON" else c["channel"]
    msg = (o.get("customer_message") or "").strip()
    if status == "NEEDS_YOU":
        msg = (f"We've received your complaint ({case_id}) and our fraud team is reviewing it right now. "
               "We have already asked the receiving bank to hold the money. You'll hear from us shortly.")
    elif status == "ESCALATED":
        msg = f"Your case {case_id} has been passed to a specialist, who will contact you within 24 hours."
    if msg and not msg.startswith("Ops note"):
        store.add_message(c["customer_id"], "bank", ch, msg, case_id)


def customer_message(customer_id: str, text: str, channel: str, utr: str | None = None) -> dict:
    """A customer wrote in. Continue a case that is waiting on them, or open a new one."""
    waiting = store.open_case_for(customer_id, status="NEEDS_INFO")
    if waiting and not utr:
        store.add_message(customer_id, "customer", channel, text, waiting["id"])
        store.update_case(waiting["id"], message=f"{waiting['message']}\nCustomer adds: {text}", status="QUEUED", run_id=None)
        return store.get_case(waiting["id"])
    existing = store.open_case_for(customer_id, utr=utr) if utr else None
    if existing:
        store.add_message(customer_id, "customer", channel, text, existing["id"])
        return existing
    c = store.create_case(channel, customer_id, text, utr=utr)
    store.add_message(customer_id, "customer", channel, text, c["id"])
    store.add_message(customer_id, "bank", channel, f"Thanks, we've logged this as {c['id']}. Our agents are looking into it now.", c["id"])
    return c


async def loop() -> None:
    """Start queued cases, most urgent first, within the concurrency budget."""
    while True:
        try:
            free = config.MAX_CONCURRENT_LLM_RUNS - active_runs()
            if free > 0:
                kinds = ("UDIR", "CHAT", "RECON") if STATE["autopilot"] else ("UDIR", "CHAT")
                queued = [c for c in store.list_cases() if c["status"] == "QUEUED" and c["channel"] in kinds]
                queued.sort(key=lambda c: (c["channel"] == "RECON", c.get("deadline_at") or "9999", c["created_at"]))
                for c in queued[:free]:
                    start(c["id"])
        except Exception:
            log.exception("supervisor tick failed")
        await asyncio.sleep(2)
