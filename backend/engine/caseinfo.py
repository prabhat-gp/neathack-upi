"""What the desk knows about a case once its UTR is known: amount, our role, the RBI turnaround and its deadline."""

from datetime import datetime, time, timedelta

from sandbox import db

from .rules import IST

BANK = "Sahyadri Bank"


def case_fields(utr: str) -> dict:
    t = db.q1("SELECT * FROM npci_transactions WHERE utr=?", utr)
    if not t:
        return {"utr": utr}
    inward = t["beneficiary_bank"] == BANK
    clean = t["overall"] == "SUCCESS" or t["reversal_leg"] == "SUCCESS"
    tat = None if clean else (5 if t["txn_type"] == "P2M" else 1)
    deadline = None
    if tat:
        d = datetime.fromisoformat(t["initiated_at"]).date() + timedelta(days=tat)
        deadline = datetime.combine(d, time(23, 59, 59), IST).isoformat(timespec="seconds")
    return {
        "utr": utr, "amount_paise": t["amount_paise"], "initiated_at": t["initiated_at"],
        "role": "Beneficiary bank" if inward else "Remitter bank", "tat_days": tat, "deadline_at": deadline,
        "rule": f"RBI 4({'b' if tat == 5 else 'a'}) · T+{tat}" if tat else ("Fraud · NCRP" if t.get("txn_type") and t["overall"] == "SUCCESS" else ""),
    }
