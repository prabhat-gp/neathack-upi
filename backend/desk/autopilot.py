"""Autopilot: makes the sandbox bank behave like a live one.

When on, it runs tonight's reconciliation sweep (opening a case per exception) and then, every few minutes, has a
real customer write in about one of their own payments: usually one that genuinely failed, sometimes one that went
through fine (the agents must prove it). Messages vary in language and wording; the agents get only the text.
A hard cap keeps it from spending more than a few cases' worth of model usage per session.
"""

import asyncio
import random
from datetime import datetime

import config
from sandbox import db

from . import recon, store, supervisor

STATE = {"on": False, "sent": 0, "next_at": None, "sweep": None}
_task: asyncio.Task | None = None

TEMPLATES = {
    "failed": [
        "Sent ₹{amt} to {first} {when}. Money got debited from my account but {first} says it never came. Please check.",
        "Bhai maine {first} ko ₹{amt} bheje the {when_hi}, account se paise kat gaye par unko mile hi nahi. Jaldi refund karo.",
        "मैंने {when_hi} {first} को ₹{amt} भेजे थे, मेरे खाते से पैसे कट गए लेकिन उन्हें नहीं मिले। कृपया देखें।",
        "My UPI payment of Rs {amt} is showing pending since {when}. {first} hasn't received it. What is happening?",
    ],
    "merchant": [
        "Paid ₹{amt} at {first} {when}, the app shows pending and the shop says they didn't get it. Money is gone from my account.",
        "{first} ka ₹{amt} ka bill pay kiya {when_hi}, paisa cut gaya lekin payment pending dikha raha hai.",
    ],
    "reversed": [
        "₹{amt} payment to {first} failed {when}. Where is my money?? It's not back in my account!",
        "{first} ko ₹{amt} bheje {when_hi}, failed dikha raha hai. Mera paisa kab wapas aayega?",
    ],
    "fine": [
        "I paid {first} ₹{amt} {when} but they keep saying they never got it. Can you check and refund?",
        "{first} bol raha hai ₹{amt} nahi aaye, maine {when_hi} bheje the. Please check karo.",
    ],
}


def _when(iso: str) -> tuple[str, str]:
    days = (db.now().date() - datetime.fromisoformat(iso).date()).days
    if days <= 0:
        return "this morning" if datetime.fromisoformat(iso).hour < 12 else "today", "aaj"
    if days == 1:
        return "yesterday", "kal"
    return f"{days} days ago", f"{days} din pehle"


def _candidate() -> tuple[dict, str] | None:
    taken = {r["utr"] for r in db.q("SELECT utr FROM desk_cases WHERE utr IS NOT NULL")}
    rows = db.q("SELECT t.utr, t.amount_paise, t.counterparty_name, t.kind, t.initiated_at, c.id AS customer_id, n.overall, n.reversal_leg "
                "FROM cbs_transactions t JOIN cbs_customers c ON c.account_no=t.account_no JOIN npci_transactions n ON n.utr=t.utr "
                "WHERE c.status='ACTIVE' AND t.mode='PUSH' ORDER BY t.initiated_at DESC")
    rows = [r for r in rows if r["utr"] not in taken]
    broken = [r for r in rows if r["overall"] != "SUCCESS"]
    if broken and (random.random() < 0.8 or len(rows) == len(broken)):
        r = random.choice(broken)
        kind = "reversed" if r["reversal_leg"] == "SUCCESS" else "merchant" if r["kind"] == "P2M" else "failed"
        return r, kind
    p2p = [r for r in rows if r["kind"] == "P2P"]
    return (random.choice(p2p), "fine") if p2p else None


def complaint_now() -> dict | None:
    pick = _candidate()
    if not pick:
        return None
    r, kind = pick
    en, hi = _when(r["initiated_at"])
    first = r["counterparty_name"] if kind == "merchant" else r["counterparty_name"].split()[0]
    text = random.choice(TEMPLATES[kind]).format(amt=f"{r['amount_paise'] // 100:,}", first=first, when=en, when_hi=hi)
    channel = "UDIR" if random.random() < 0.4 else "CHAT"
    return supervisor.customer_message(r["customer_id"], text, channel, utr=r["utr"] if channel == "UDIR" else None)


async def _run() -> None:
    STATE["sweep"] = recon.run_sweep()
    while STATE["on"] and STATE["sent"] < config.AUTOPILOT_MAX_COMPLAINTS:
        STATE["next_at"] = db.iso(db.now())
        await asyncio.sleep(config.AUTOPILOT_INTERVAL_SEC)
        if not STATE["on"]:
            break
        if complaint_now():
            STATE["sent"] += 1
    STATE["on"] = supervisor.STATE["autopilot"] = False


def set_on(on: bool) -> dict:
    global _task
    STATE["on"] = supervisor.STATE["autopilot"] = on
    if on and (_task is None or _task.done()):
        STATE["sent"] = 0
        _task = asyncio.create_task(_run())
    return status()


def status() -> dict:
    return {"on": STATE["on"], "sent": STATE["sent"], "max": config.AUTOPILOT_MAX_COMPLAINTS,
            "interval_sec": config.AUTOPILOT_INTERVAL_SEC, "sweep": STATE["sweep"]}
