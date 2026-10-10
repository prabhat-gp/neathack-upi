"""HTTP surface of the desk: customer channels (the UPI app and chat) and the ops console's queue."""

import asyncio
import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import config
from sandbox import db

from . import autopilot, recon, store, supervisor

router = APIRouter()

_RUNS_BY_IP: dict[str, list[float]] = {}


def admit(request: Request) -> None:
    """Every message a visitor sends costs real model usage on our ChatGPT plan: cap it per visitor."""
    if config.brain() == "rules":
        return
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0].strip()
    now = asyncio.get_running_loop().time()
    recent = [t for t in _RUNS_BY_IP.get(ip, []) if now - t < 3600]
    if len(recent) >= config.RUNS_PER_VISITOR_PER_HOUR:
        raise HTTPException(429, "You've sent several complaints this hour. Each one is worked by real AI agents; please try again later.")
    _RUNS_BY_IP[ip] = recent + [now]


# ── Customer side: the bank's UPI app and its chat ────────────────────────────────────────────────

APP_STATUS = {"SUCCESS": "Paid", "DEEMED": "Pending", "FAILED": "Failed"}


@router.get("/api/app/customers")
def app_customers():
    rows = db.q("SELECT c.id, c.name, c.vpa, c.phone FROM cbs_customers c WHERE c.status='ACTIVE' ORDER BY c.name")
    issues = {r["account_no"] for r in db.q("SELECT t.account_no FROM cbs_transactions t JOIN npci_transactions n ON n.utr=t.utr "
                                              "WHERE n.overall!='SUCCESS' OR t.mode='COLLECT'")}
    accts = {r["id"]: r["account_no"] for r in db.q("SELECT id, account_no FROM cbs_customers")}
    return [{**r, "has_issue": accts[r["id"]] in issues} for r in rows]


@router.get("/api/app/{customer_id}")
def app_home(customer_id: str):
    c = db.q1("SELECT id, name, vpa, phone, account_no, balance_paise FROM cbs_customers WHERE id=?", customer_id)
    if not c:
        raise HTTPException(404, "Unknown customer")
    out = db.q("SELECT t.utr, t.amount_paise, t.counterparty_name AS name, t.counterparty_vpa AS vpa, t.kind, t.mode, t.initiated_at AS at, "
               "t.narration, n.overall, n.reversal_leg FROM cbs_transactions t JOIN npci_transactions n ON n.utr=t.utr WHERE t.account_no=?",
               c["account_no"])
    for t in out:
        t["direction"] = "OUT"
        t["app_status"] = "Refunded" if t["reversal_leg"] == "SUCCESS" else APP_STATUS.get(t["overall"], t["overall"])
    inward = db.q("SELECT utr, amount_paise, remitter_name AS name, remitter_vpa AS vpa, received_at AS at, credit_status FROM cbs_inward "
                  "WHERE account_no=?", c["account_no"])
    for t in inward:
        t["direction"] = "IN"
        t["app_status"] = "Received" if t["credit_status"] == "CREDITED" else "Pending"
    refunds = db.q("SELECT utr_ref AS utr, amount_paise, type, posted_at AS at FROM cbs_postings WHERE account_no=? AND type!='REVERSAL'",
                   c["account_no"])
    for t in refunds:
        t.update(direction="IN", name="Refund from Sahyadri Bank", app_status="Received", vpa="", refund=True)
    txns = sorted(out + inward + refunds, key=lambda t: t["at"], reverse=True)
    return {"customer": {k: c[k] for k in ("id", "name", "vpa", "phone", "balance_paise")}, "transactions": txns,
            "cases": [x for x in store.list_cases() if x["customer_id"] == customer_id]}


class UdirComplaint(BaseModel):
    customer_id: str
    utr: str
    text: str


class ChatMessage(BaseModel):
    customer_id: str
    text: str


@router.post("/channels/udir")
def channel_udir(body: UdirComplaint, request: Request):
    """'Raise a complaint' on a payment in the UPI app. Reaches the bank through NPCI UDIR with the UTR attached."""
    t = db.q1("SELECT t.utr FROM cbs_transactions t JOIN cbs_customers c ON c.account_no=t.account_no WHERE t.utr=? AND c.id=?",
              body.utr, body.customer_id)
    if not t:
        raise HTTPException(404, "That payment isn't on this customer's account")
    admit(request)
    return supervisor.customer_message(body.customer_id, body.text.strip(), "UDIR", utr=body.utr)


@router.post("/channels/chat")
def channel_chat(body: ChatMessage, request: Request):
    """Free-text chat with the bank. No UTR: the Intake agent works out which payment the customer means."""
    if not db.q1("SELECT 1 FROM cbs_customers WHERE id=?", body.customer_id):
        raise HTTPException(404, "Unknown customer")
    admit(request)
    return supervisor.customer_message(body.customer_id, body.text.strip(), "CHAT")


@router.get("/channels/thread/{customer_id}")
def channel_thread(customer_id: str):
    return store.thread(customer_id)


# ── Ops side: the queue the agents work ────────────────────────────────────────────────────────────

@router.get("/api/desk/cases")
def desk_cases():
    return store.list_cases()


@router.get("/api/desk/cases/{case_id}")
def desk_case(case_id: str):
    c = store.get_case(case_id)
    if not c:
        raise HTTPException(404, "Unknown case")
    return {**c, "messages": store.messages_for_case(case_id)}


@router.post("/api/desk/cases/{case_id}/start")
async def desk_start(case_id: str, request: Request):
    c = store.get_case(case_id)
    if not c:
        raise HTTPException(404, "Unknown case")
    if c["status"] != "QUEUED":
        raise HTTPException(409, f"Case is {c['status']}")
    if supervisor.active_runs() >= config.MAX_CONCURRENT_LLM_RUNS:
        raise HTTPException(429, "The agents are busy with other cases. This one stays queued and starts as soon as they're free.")
    admit(request)
    run = supervisor.start(case_id)
    return {"run_id": run.id}


@router.get("/api/runs/{run_id}/events")
async def run_events(run_id: str):
    """Server-sent events for one run: everything so far, then live until the run goes idle."""
    run = supervisor.RUNS.get(run_id)
    if not run:
        raise HTTPException(404, "Run not found (the server may have restarted)")
    q = run.subscribe()

    async def body():
        try:
            while True:
                ev = await q.get()
                if ev is None:
                    yield "data: {\"type\": \"idle\"}\n\n"
                    break
                yield f"data: {json.dumps(ev, default=str)}\n\n"
        finally:
            run.subscribers.discard(q)

    return StreamingResponse(body(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


class Decision(BaseModel):
    approve: bool
    reviewer: str = "Ops reviewer"


@router.post("/api/runs/{run_id}/decision")
async def run_decision(run_id: str, body: Decision):
    run = supervisor.RUNS.get(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    if run.status != "AWAITING_APPROVAL":
        raise HTTPException(409, f"Run is {run.status}, not awaiting approval")
    run.status = "DECIDING"
    supervisor.decide_case(run, body.approve, body.reviewer)
    return {"ok": True}


@router.post("/api/desk/recon")
def desk_recon():
    return recon.run_sweep()


class Toggle(BaseModel):
    on: bool


@router.get("/api/desk/autopilot")
def autopilot_status():
    return {**autopilot.status(), "active_runs": supervisor.active_runs()}


@router.post("/api/desk/autopilot")
async def autopilot_toggle(body: Toggle):
    return autopilot.set_on(body.on)
