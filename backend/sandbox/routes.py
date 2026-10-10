"""HTTP APIs of the sandboxed parties. Agents only ever reach these over HTTP via engine/parties.py,
so pointing the adapter base URLs at a bank's real integration layer swaps the sandbox out."""

import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .db import ex, iso, now, q, q1, reset

router = APIRouter(prefix="/sandbox")


def _need(row, what):
    if not row:
        raise HTTPException(404, f"{what} not found")
    return row


# ───────────── Remitter bank: Sahyadri Bank core banking (CBS) ─────────────

@router.get("/cbs/customers/{customer_id}")
def cbs_customer(customer_id: str):
    c = _need(q1("SELECT * FROM cbs_customers WHERE id=?", customer_id), "Customer")
    blocks = [r["vpa"] for r in q("SELECT vpa FROM cbs_vpa_blocks WHERE customer_id=?", customer_id)]
    return {**c, "blocked_vpas": blocks}


@router.get("/cbs/transactions/{utr}")
def cbs_transaction(utr: str):
    t = _need(q1("SELECT * FROM cbs_transactions WHERE utr=?", utr), "Transaction")
    cust = q1("SELECT id, name FROM cbs_customers WHERE account_no=?", t["account_no"])
    postings = q("SELECT * FROM cbs_postings WHERE utr_ref=? ORDER BY posted_at", utr)
    return {**t, "customer_id": cust["id"], "customer_name": cust["name"], "related_postings": postings}


@router.get("/cbs/customers/{customer_id}/statement")
def cbs_statement(customer_id: str, around: str | None = None, window_minutes: int = 60 * 24 * 30):
    c = _need(q1("SELECT * FROM cbs_customers WHERE id=?", customer_id), "Customer")
    rows = q("SELECT * FROM cbs_transactions WHERE account_no=? ORDER BY initiated_at", c["account_no"])
    if around:
        pivot = _need(q1("SELECT initiated_at FROM cbs_transactions WHERE utr=?", around), "Pivot transaction")
        t0 = datetime.fromisoformat(pivot["initiated_at"])
        lo, hi = t0 - timedelta(minutes=window_minutes), t0 + timedelta(minutes=window_minutes)
        rows = [r for r in rows if lo <= datetime.fromisoformat(r["initiated_at"]) <= hi]
    credits = q("SELECT * FROM cbs_postings WHERE account_no=? ORDER BY posted_at", c["account_no"])
    return {"account_no": c["account_no"], "balance_paise": c["balance_paise"], "debits": rows, "credits": credits}


@router.get("/cbs/inward/{utr}")
def cbs_inward(utr: str):
    i = _need(q1("SELECT * FROM cbs_inward WHERE utr=?", utr), "Inward credit")
    cust = q1("SELECT id, name, status, status_since FROM cbs_customers WHERE account_no=?", i["account_no"])
    susp = q1("SELECT * FROM cbs_suspense WHERE id=?", i["suspense_id"]) if i["suspense_id"] else None
    return {**i, "beneficiary": cust, "suspense": susp}


@router.get("/cbs/ledger")
def cbs_ledger(date: str):
    """Switch/CBS view of a settlement date: our outward debits and inward credits."""
    outward = q("SELECT utr, amount_paise, status, 'OUTWARD' AS direction FROM cbs_transactions WHERE substr(initiated_at,1,10)=?", date)
    inward = q("SELECT utr, amount_paise, credit_status AS status, 'INWARD' AS direction, suspense_id FROM cbs_inward WHERE substr(received_at,1,10)=?", date)
    return {"date": date, "entries": outward + inward}


class Posting(BaseModel):
    account_no: str
    utr_ref: str
    type: str
    amount_paise: int
    narration: str
    idempotency_key: str


@router.post("/cbs/postings", status_code=201)
def cbs_post(p: Posting):
    existing = q1("SELECT * FROM cbs_postings WHERE idempotency_key=?", p.idempotency_key)
    if existing:
        return {**existing, "duplicate": True}
    _need(q1("SELECT 1 FROM cbs_customers WHERE account_no=?", p.account_no), "Account")
    if p.amount_paise <= 0:
        raise HTTPException(422, "Amount must be positive")
    pid = "PST" + uuid.uuid4().hex[:10].upper()
    ex("INSERT INTO cbs_postings VALUES (?,?,?,?,?,?,?,?)",
       (pid, p.account_no, p.utr_ref, p.type, p.amount_paise, p.narration, iso(now()), p.idempotency_key))
    ex("UPDATE cbs_customers SET balance_paise = balance_paise + ? WHERE account_no=?", p.amount_paise, p.account_no)
    if p.type == "REVERSAL":
        ex("UPDATE cbs_transactions SET status='REVERSED' WHERE utr=?", p.utr_ref)
        ex("UPDATE npci_transactions SET reversal_leg='SUCCESS', reversal_at=? WHERE utr=?", iso(now()), p.utr_ref)
    return {**q1("SELECT * FROM cbs_postings WHERE id=?", pid), "duplicate": False}


class VpaBlock(BaseModel):
    customer_id: str
    vpa: str


@router.post("/cbs/vpa-blocks", status_code=201)
def cbs_block(b: VpaBlock):
    ex("INSERT OR IGNORE INTO cbs_vpa_blocks VALUES (?,?,?)", b.customer_id, b.vpa, iso(now()))
    return {"customer_id": b.customer_id, "vpa": b.vpa, "status": "BLOCKED"}


# ───────────── NPCI UPI switch + UDIR (dispute & issue resolution) ─────────────

@router.get("/npci/transactions/{utr}/status")
def npci_status(utr: str):
    t = _need(q1("SELECT * FROM npci_transactions WHERE utr=?", utr), "UTR")
    complaints = q("SELECT id, type, status, created_at FROM npci_complaints WHERE utr=?", utr)
    return {**t, "udir_complaints": complaints}


@router.get("/npci/raw-data")
def npci_raw_data(settlement_date: str, bank: str = "Sahyadri Bank"):
    rows = q("SELECT utr, payer_vpa, payee_vpa, amount_paise, remitter_bank, beneficiary_bank, credit_leg, tcc, reversal_leg, overall "
             "FROM npci_transactions WHERE substr(initiated_at,1,10)=? AND (remitter_bank=? OR beneficiary_bank=?)",
             settlement_date, bank, bank)
    return {"settlement_date": settlement_date, "bank": bank, "rows": rows}


class Return(BaseModel):
    utr: str
    reason: str
    raised_by: str = "Sahyadri Bank"


@router.post("/npci/returns", status_code=201)
def npci_return(r: Return):
    t = _need(q1("SELECT * FROM npci_transactions WHERE utr=?", r.utr), "UTR")
    if t["beneficiary_bank"] != r.raised_by:
        raise HTTPException(409, "Only the beneficiary bank can return a credit")
    done = q1("SELECT * FROM npci_complaints WHERE utr=? AND type='RETURN'", r.utr)
    if done:
        return {**done, "duplicate": True}
    if t["tcc"]:
        raise HTTPException(409, "Credit already confirmed (TCC); cannot return")
    rid = "RET" + uuid.uuid4().hex[:10].upper()
    at = iso(now())
    ex("INSERT INTO npci_complaints VALUES (?,?,?,?,?,?,?,?,?)",
       rid, r.utr, "RETURN", t["amount_paise"], r.reason, r.raised_by, "RET_SUCCESS",
       f"Funds returned to {t['remitter_bank']} in next settlement cycle", at)
    ex("UPDATE npci_transactions SET reversal_leg='SUCCESS', reversal_at=?, overall='RETURNED' WHERE utr=?", at, r.utr)
    ex("UPDATE cbs_inward SET credit_status='RETURNED' WHERE utr=?", r.utr)
    ex("UPDATE cbs_suspense SET status='CLEARED', cleared_at=? WHERE utr=?", at, r.utr)
    ex("UPDATE bene_accounts SET available_paise = available_paise + ? WHERE vpa=?", t["amount_paise"], t["payer_vpa"])
    return {**q1("SELECT * FROM npci_complaints WHERE id=?", rid), "duplicate": False}


class Complaint(BaseModel):
    utr: str
    type: str  # CHARGEBACK | DUPLICATE_REFUND | FRAUD_REPORT
    amount_paise: int
    remarks: str
    raised_by: str = "Sahyadri Bank"


@router.post("/npci/udir/complaints", status_code=201)
def npci_raise(cmp: Complaint):
    t = _need(q1("SELECT * FROM npci_transactions WHERE utr=?", cmp.utr), "UTR")
    open_ = q1("SELECT * FROM npci_complaints WHERE utr=? AND type=?", cmp.utr, cmp.type)
    if open_:
        return {**open_, "duplicate": True}
    if cmp.type not in ("CHARGEBACK", "DUPLICATE_REFUND", "FRAUD_REPORT"):
        raise HTTPException(422, f"Unsupported complaint type {cmp.type}")
    cid = "UDIR" + uuid.uuid4().hex[:10].upper()
    status, resolution = "RAISED", None
    if cmp.type == "CHARGEBACK":
        status = "CHARGEBACK_RAISED"
        resolution = f"{t['beneficiary_bank']} must return or confirm credit by next cycle, else auto-accepted (NPCI OC-213)"
    elif cmp.type == "DUPLICATE_REFUND":
        order = q1("SELECT * FROM acq_orders WHERE paid_utr=?", cmp.utr)
        if order:
            status, resolution = "REJECTED", f"UTR is the payment of record for order {order['order_id']}"
        else:
            rid = "RFD" + uuid.uuid4().hex[:10].upper()
            ex("INSERT INTO acq_refunds VALUES (?,?,?,?,?)", rid, cmp.utr, cmp.amount_paise, "PROCESSED", iso(now()))
            acct = q1("SELECT account_no FROM cbs_transactions WHERE utr=?", cmp.utr)["account_no"]
            ex("INSERT INTO cbs_postings VALUES (?,?,?,?,?,?,?,?)",
               ("PST" + uuid.uuid4().hex[:10].upper(), acct, cmp.utr, "MERCHANT_REFUND", cmp.amount_paise,
                f"Refund {rid} from {t['payee_vpa']}", iso(now()), "refund:" + cmp.utr))
            ex("UPDATE cbs_customers SET balance_paise = balance_paise + ? WHERE account_no=?", cmp.amount_paise, acct)
            status, resolution = "REFUNDED", f"Acquirer refund {rid} credited to remitter"
    ex("INSERT INTO npci_complaints VALUES (?,?,?,?,?,?,?,?,?)",
       cid, cmp.utr, cmp.type, cmp.amount_paise, cmp.remarks, cmp.raised_by, status, resolution, iso(now()))
    return {**q1("SELECT * FROM npci_complaints WHERE id=?", cid), "duplicate": False}


# ───────────── Beneficiary banks ─────────────

def _fault(party: str, key: str) -> None:
    f = q1("SELECT * FROM sandbox_faults WHERE party=? AND key=? AND remaining>0", party, key)
    if f:
        ex("UPDATE sandbox_faults SET remaining=remaining-1 WHERE party=? AND key=?", (party, key))
        raise HTTPException(f["status"], f["message"])


@router.get("/bene/credits/{utr}")
def bene_credit(utr: str):
    _fault("bene", utr)
    c = _need(q1("SELECT * FROM bene_credits WHERE utr=?", utr), "Credit record")
    acct = q1("SELECT bank, holder_name FROM bene_accounts WHERE vpa=?", c["vpa"])
    return {**c, **acct}


@router.get("/bene/accounts/{vpa}")
def bene_account(vpa: str):
    a = _need(q1("SELECT * FROM bene_accounts WHERE vpa=?", vpa), "Account")
    age = (now() - datetime.fromisoformat(a["opened_at"])).days
    return {**a, "account_age_days": age}


class Lien(BaseModel):
    vpa: str
    utr: str
    amount_paise: int
    reason: str


@router.post("/bene/liens", status_code=201)
def bene_lien(l: Lien):
    a = _need(q1("SELECT * FROM bene_accounts WHERE vpa=?", l.vpa), "Account")
    existing = q1("SELECT * FROM bene_liens WHERE utr=?", l.utr)
    if existing:
        return {**existing, "duplicate": True}
    marked = min(l.amount_paise, a["available_paise"])
    lid = "LIEN" + uuid.uuid4().hex[:8].upper()
    ex("INSERT INTO bene_liens VALUES (?,?,?,?,?,?)", lid, l.vpa, l.utr, l.amount_paise, marked, iso(now()))
    ex("UPDATE bene_accounts SET available_paise = available_paise - ?, lien_paise = lien_paise + ? WHERE vpa=?",
       marked, marked, l.vpa)
    return {**q1("SELECT * FROM bene_liens WHERE id=?", lid), "bank": a["bank"], "duplicate": False,
            "status": "FULL" if marked == l.amount_paise else "PARTIAL"}


# ───────────── Merchant acquirer ─────────────

@router.get("/acquirer/orders")
def acq_lookup(utr: str):
    merchant_vpa = (q1("SELECT payee_vpa FROM npci_transactions WHERE utr=?", utr) or {}).get("payee_vpa")
    m = q1("SELECT * FROM acq_merchants WHERE vpa=?", merchant_vpa) if merchant_vpa else None
    if not m:
        return {"utr": utr, "is_merchant_payment": False}
    order = next((o for o in q("SELECT * FROM acq_orders WHERE merchant_vpa=?", m["vpa"]) if utr in o["attempted_utrs"].split(",")), None)
    refunds = q("SELECT * FROM acq_refunds WHERE utr=?", utr)
    return {"utr": utr, "is_merchant_payment": True, "merchant": m, "order": order,
            "utr_is_payment_of_record": bool(order and order["paid_utr"] == utr), "refunds": refunds}


# ───────────── National Cybercrime Reporting Portal ─────────────

@router.get("/ncrp/reports")
def ncrp_lookup(vpa: str):
    rows = q("SELECT * FROM ncrp_reports WHERE vpa=? ORDER BY created_at", vpa)
    return {"vpa": vpa, "report_count": len(rows), "total_reported_paise": sum(r["amount_paise"] for r in rows),
            "latest": rows[-3:]}


class Report(BaseModel):
    vpa: str
    utr: str
    amount_paise: int
    reported_by: str = "Sahyadri Bank"


@router.post("/ncrp/reports", status_code=201)
def ncrp_file(r: Report):
    existing = q1("SELECT * FROM ncrp_reports WHERE utr=?", r.utr)
    if existing:
        return {**existing, "duplicate": True}
    ack = "NCRP-" + uuid.uuid4().hex[:8].upper()
    ex("INSERT INTO ncrp_reports VALUES (?,?,?,?,?,?)", ack, r.vpa, r.utr, r.amount_paise, r.reported_by, iso(now()))
    return {**q1("SELECT * FROM ncrp_reports WHERE ack_no=?", ack), "duplicate": False}


# ───────────── Admin ─────────────

@router.post("/reset")
def sandbox_reset():
    reset()
    return {"status": "reset", "at": iso(now())}


@router.get("/snapshot")
def snapshot(customer_id: str, utr: str):
    c = q1("SELECT name, account_no, balance_paise, status FROM cbs_customers WHERE id=?", customer_id)
    t = q1("SELECT * FROM npci_transactions WHERE utr=?", utr)
    if not c or not t:
        raise HTTPException(404, "Unknown customer or UTR")
    inward = t["beneficiary_bank"] == "Sahyadri Bank"
    counterparty_vpa = t["payer_vpa"] if inward else t["payee_vpa"]
    return {
        "role": "BENEFICIARY" if inward else "REMITTER",
        "cbs": {**c, "postings": q("SELECT type, amount_paise, utr_ref, posted_at, id FROM cbs_postings WHERE account_no=? ORDER BY posted_at", c["account_no"]),
                "blocked_vpas": [r["vpa"] for r in q("SELECT vpa FROM cbs_vpa_blocks WHERE customer_id=?", customer_id)],
                "suspense": q("SELECT id, amount_paise, status FROM cbs_suspense WHERE utr=?", utr)},
        "npci": {"overall": t["overall"], "credit_leg": t["credit_leg"], "tcc": t["tcc"], "reversal_leg": t["reversal_leg"],
                 "complaints": q("SELECT id, type, status, resolution FROM npci_complaints WHERE utr IN "
                                 "(SELECT utr FROM cbs_transactions WHERE account_no=? UNION SELECT ?)", c["account_no"], utr)},
        "bene": {**(q1("SELECT bank, holder_name, vpa, available_paise, lien_paise FROM bene_accounts WHERE vpa=?", counterparty_vpa) or {}),
                 "credit": q1("SELECT status, credited_at, credit_ref FROM bene_credits WHERE utr=?", utr)},
        "acquirer": {"refunds": q("SELECT * FROM acq_refunds WHERE utr IN (SELECT utr FROM cbs_transactions WHERE account_no=?)", c["account_no"])},
        "ncrp": {"reports_on_payee": len(q("SELECT 1 FROM ncrp_reports WHERE vpa=?", counterparty_vpa)),
                 "our_reports": q("SELECT ack_no, utr, amount_paise FROM ncrp_reports WHERE reported_by='Sahyadri Bank' AND vpa=?", counterparty_vpa)},
    }
