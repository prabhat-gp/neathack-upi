"""Case queue and customer conversations (tables desk_cases, desk_messages in the sandbox database)."""

import json
import random

from engine.caseinfo import case_fields
from sandbox import db

# QUEUED → WORKING → RESOLVED | NEEDS_YOU (approval) | NEEDS_INFO (waiting on the customer) | ESCALATED | FAILED
OPEN = ("QUEUED", "WORKING", "NEEDS_YOU", "NEEDS_INFO")
CHANNEL_LABEL = {"UDIR": "UPI app complaint (UDIR)", "CHAT": "Chat", "RECON": "Reconciliation sweep"}


def _id() -> str:
    while True:
        cid = f"DP-{random.randint(1000, 9999)}"
        if not db.q1("SELECT 1 FROM desk_cases WHERE id=?", cid):
            return cid


def create_case(channel: str, customer_id: str, message: str, utr: str | None = None) -> dict:
    cid, t = _id(), db.iso(db.now())
    db.ex("INSERT INTO desk_cases (id, channel, customer_id, utr, message, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
          cid, channel, customer_id, utr, message, "QUEUED", t, t)
    return get_case(cid)


def update_case(cid: str, **fields) -> None:
    fields["updated_at"] = db.iso(db.now())
    sets = ", ".join(f"{k}=?" for k in fields)
    db.ex(f"UPDATE desk_cases SET {sets} WHERE id=?", *[json.dumps(v, default=str) if isinstance(v, dict) else v for v in fields.values()], cid)


def _enrich(r: dict) -> dict:
    cust = db.q1("SELECT name, vpa, phone FROM cbs_customers WHERE id=?", r["customer_id"]) or {}
    info = case_fields(r["utr"]) if r["utr"] else {}
    outcome = json.loads(r["outcome"]) if r.get("outcome") else None
    if outcome and outcome.get("deadline"):  # keep the deadline the case was resolved against
        info.update(deadline_at=outcome["deadline"]["deadline_at"], tat_days=int(outcome["deadline"]["tat"][-1]))
    return {**r, "outcome": outcome, "customer_name": cust.get("name"),
            "customer_vpa": cust.get("vpa"), "channel_label": CHANNEL_LABEL.get(r["channel"], r["channel"]), **info}


def get_case(cid: str) -> dict | None:
    r = db.q1("SELECT * FROM desk_cases WHERE id=?", cid)
    return _enrich(r) if r else None


def list_cases() -> list[dict]:
    return [_enrich(r) for r in db.q("SELECT * FROM desk_cases ORDER BY created_at DESC")]


def open_case_for(customer_id: str, utr: str | None = None, status: str | None = None) -> dict | None:
    sql = "SELECT id FROM desk_cases WHERE customer_id=? AND status IN ({})".format(",".join("?" * len(OPEN)))
    args: list = [customer_id, *OPEN]
    if utr:
        sql += " AND utr=?"
        args.append(utr)
    if status:
        sql += " AND status=?"
        args.append(status)
    r = db.q1(sql + " ORDER BY created_at DESC", *args)
    return get_case(r["id"]) if r else None


def add_message(customer_id: str, sender: str, channel: str, text: str, case_id: str | None = None) -> None:
    db.ex("INSERT INTO desk_messages (customer_id, case_id, sender, channel, text, created_at) VALUES (?,?,?,?,?,?)",
          customer_id, case_id, sender, channel, text, db.iso(db.now()))


def thread(customer_id: str) -> list[dict]:
    return db.q("SELECT * FROM desk_messages WHERE customer_id=? ORDER BY id", customer_id)


def messages_for_case(case_id: str) -> list[dict]:
    return db.q("SELECT * FROM desk_messages WHERE case_id=? ORDER BY id", case_id)
