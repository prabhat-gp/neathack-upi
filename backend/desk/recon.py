"""Nightly reconciliation channel: match NPCI settlement data against our ledger and open a case per exception.

Same matching rules as the agents' reconciliation_sweep tool, run over the last few settlement dates. No model is
involved in finding exceptions; the agents work the cases it opens.
"""

from datetime import timedelta

from sandbox import db

from . import store

BANK = "Sahyadri Bank"


def exceptions(days: int = 3) -> list[dict]:
    since = (db.now() - timedelta(days=days)).date().isoformat()
    rows = db.q("SELECT * FROM npci_transactions WHERE substr(initiated_at,1,10) >= ? AND (remitter_bank=? OR beneficiary_bank=?)",
                since, BANK, BANK)
    out = []
    for r in rows:
        if r["beneficiary_bank"] == BANK:
            i = db.q1("SELECT * FROM cbs_inward WHERE utr=?", r["utr"])
            s = db.q1("SELECT status FROM cbs_suspense WHERE utr=?", r["utr"])
            if i and i["credit_status"] == "FAILED" and s and s["status"] == "OPEN":
                cust = db.q1("SELECT id FROM cbs_customers WHERE account_no=?", i["account_no"])
                out.append({"utr": r["utr"], "customer_id": cust["id"], "what": "Inward credit failed, funds in suspense"})
        elif r["overall"] == "DEEMED" and not r["tcc"] and r["reversal_leg"] != "SUCCESS":
            t = db.q1("SELECT account_no FROM cbs_transactions WHERE utr=?", r["utr"])
            cust = db.q1("SELECT id FROM cbs_customers WHERE account_no=?", t["account_no"]) if t else None
            if cust:
                out.append({"utr": r["utr"], "customer_id": cust["id"], "what": "Outward deemed, no credit confirmation or return"})
    return out


def run_sweep() -> dict:
    found, opened = exceptions(), []
    for x in found:
        if db.q1("SELECT 1 FROM desk_cases WHERE utr=? AND status NOT IN ('FAILED')", x["utr"]):
            continue
        c = store.create_case("RECON", x["customer_id"], x["what"], utr=x["utr"])
        opened.append(c["id"])
    return {"exceptions": len(found), "opened": opened}
