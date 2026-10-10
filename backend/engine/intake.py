"""Intake agent: turns a customer's free-text message into a case on a specific UPI transaction.

Complaints from chat, email or a branch rarely carry a UTR. Intake reads the message (any language), looks at the
customer's recent statement and NPCI status, and picks the transaction the customer means. If it cannot tell, it
asks the customer one short question instead of guessing.
"""

import re

from . import tools as T
from .llm import run_agent
from .run import Run
from .tools import Tool, _obj, rs

BANK = "Sahyadri Bank"

INTAKE_SYSTEM = f"""You are the Intake agent on {BANK}'s UPI complaints desk.
A customer wrote to the bank in their own words (any language: English, Hindi, Hinglish, Marathi...). Find the one UPI
transaction they are talking about, so the specialist agents can work it.

How to work:
- Call get_statement_window with only customer_id to see their recent debits (payee name, amount, note, time, status).
- Match on what they said: amount, payee name or nickname, merchant, day ("kal" = yesterday), purpose.
- If two or more debits could fit, check them with npci_check_status: the one that did not complete is usually it.
- Never invent a UTR. If nothing fits or it is genuinely ambiguous, submit with utr "" and a short, polite question
  in the customer's language asking for the missing detail (amount, payee, or date).
Finish by calling submit_intake exactly once."""

SUBMIT = Tool("submit_intake", "Record which transaction the customer means, or the question to ask them.", _obj({
    "utr": {"type": "string", "description": "UTR of the transaction the customer means, or empty string if unclear"},
    "summary": {"type": "string", "description": "One line: what the customer says happened, in English"},
    "language": {"type": "string", "description": "Language the customer wrote in"},
    "question_for_customer": {"type": "string", "description": "If utr is empty: the question to send back, in their language"},
}, ["utr", "summary", "language"]))

TOOLS = [T.INVESTIGATOR_TOOLS[2], T.INVESTIGATOR_TOOLS[3], SUBMIT]  # get_statement_window, npci_check_status


def _brief(run: Run) -> str:
    c = run.case
    return f"Customer id: {c['customer_id']} ({c['customer_name']}). Channel: {c['channel']}.\nTheir message: \"{c['complaint']}\""


async def intake(run: Run) -> dict:
    await run.node("intake", "running", activity="Reading the customer's message", pause=0.2)
    if run.brain != "rules":
        known = set()

        def check(inp):
            u = inp.get("utr", "")
            if u and u not in known:
                return f"UTR {u} is not on this customer's statement. Pick one from get_statement_window or leave utr empty."
            return None

        async def statement(r, n, a):  # remember which UTRs the agent actually saw
            out = await T.get_statement_window(r, n, a)
            known.update(d["utr"] for d in out["debits"])
            return out

        tools = [Tool(TOOLS[0].name, TOOLS[0].description, TOOLS[0].schema, statement), TOOLS[1], SUBMIT]
        out = await run_agent(run, "intake", INTAKE_SYSTEM, tools, _brief(run), "submit_intake", validate=check)
    else:
        out = await _intake_rules(run)
    found = bool(out.get("utr"))
    await run.step("intake", "finding", "Transaction identified" if found else "Needs one more detail",
                   (f"UTR {out['utr']} · {out['summary']}" if found else out.get("question_for_customer") or out["summary"]),
                   status="ok" if found else "warn", pause=0.5)
    await run.node("intake", "done", activity=f"Found UTR …{out['utr'][-4:]}" if found else "Asked the customer for a detail", pause=0.2)
    return out


async def _intake_rules(run: Run) -> dict:
    c, n = run.case, "intake"
    text = c["complaint"].lower()
    st = await T.get_statement_window(run, n, {"customer_id": c["customer_id"]})
    debits = sorted(st["debits"], key=lambda d: d["initiated_at"], reverse=True)
    nums = {int(x.replace(",", "")) * 100 for x in re.findall(r"(?<![\d.])(\d[\d,]{1,8})(?![\d.])", text) if 1 <= int(x.replace(",", "")) <= 500000}
    cands = [d for d in debits if d["amount_paise"] in nums] or [d for d in debits if (d["counterparty_name"] or "").split()[0].lower() in text]
    if not cands:
        await run.step(n, "think", "No clear match", "The message has no amount or payee I can match. Ask the customer.", pause=0.4)
        return {"utr": "", "summary": c["complaint"][:120], "language": "unknown",
                "question_for_customer": "Sorry for the trouble. Which payment is this about? Please share the amount and who you paid."}
    for d in cands[:3]:
        s = await T.npci_check_status(run, n, {"utr": d["utr"]})
        if s["overall"] != "SUCCESS" or not s["tcc"]:
            pick = d
            break
    else:
        pick = cands[0]
    await run.step(n, "think", "Matched the message to a payment",
                   f"{rs(pick['amount_paise'])} to {pick['counterparty_name']} on {pick['initiated_at'][:16].replace('T', ' ')}.", pause=0.4)
    return {"utr": pick["utr"], "summary": f"Customer disputes {rs(pick['amount_paise'])} to {pick['counterparty_name']}", "language": "unknown"}
