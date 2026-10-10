"""Execution engine: the only code path that moves money or files anything.

It never trusts agent output. Before executing it re-reads NPCI and core banking, recomputes the deadline
position with the policy engine, checks every action against the case type, and routes anything high-risk
or above the auto-approval limit to a human."""

from datetime import datetime

import config

from . import rules
from .parties import call
from .run import Run
from .tools import rs

OUTWARD_TAT = ("P2P_NOT_CREDITED", "P2M_NOT_CONFIRMED")
FRAUD_ACTIONS = ("REQUEST_LIEN", "FILE_NCRP_REPORT", "RAISE_FRAUD_REPORT", "BLOCK_PAYEE_VPA")
CREDITS = ("REVERSE_DEBIT", "PAY_TAT_COMPENSATION")
N = "executor"


async def validate(run: Run, plan: dict) -> dict:
    await run.node(N, "running", activity="Re-verifying evidence and monetary amounts", pause=0)
    f = run.facts["findings"]
    ct, utr = f["case_type"], f["disputed_utr"]
    inward = ct == "INWARD_NOT_CREDITED"
    await run.step(N, "think", "Execution engine: re-verify the facts before anything moves", pause=0.5)
    st = await call(run, N, "npci", "GET", f"/transactions/{utr}/status", title="Re-verify status with NPCI",
                    summarize=lambda d: (f"credit {d['credit_leg']}{' (TCC)' if d['tcc'] else ''} · reversal {d['reversal_leg']}", "ok"))
    if inward:
        led = await call(run, N, "cbs", "GET", f"/inward/{utr}", title="Re-verify suspense entry",
                         summarize=lambda d: (f"credit {d['credit_status']} · suspense {d['suspense']['status'] if d['suspense'] else '—'}", "ok"))
    else:
        led = await call(run, N, "cbs", "GET", f"/transactions/{utr}", title="Re-verify ledger in core banking",
                         summarize=lambda d: (f"{d['status']} · {len(d['related_postings'])} prior posting(s)", "ok"))
    pos = rules.tat_position(ct, st["initiated_at"], st.get("reversal_at"), datetime.now(rules.IST)) if rules.RULEBOOK.get(ct, {}).get("tat_days") else None
    run.facts.setdefault("tat", {})[utr] = pos or run.facts.get("tat", {}).get(utr)
    already = {p["type"] for p in led.get("related_postings", [])}
    complaints = {c["type"] for c in st["udir_complaints"]}

    approved, rejected = [], []
    for act in plan.get("actions", []):
        a = dict(act)
        typ, ok, note = a["type"], True, ""
        if typ == "REVERSE_DEBIT":
            ok = ct in OUTWARD_TAT and st["credit_leg"] != "SUCCESS" and not st["tcc"] and "REVERSAL" not in already
            note = "no credit confirmation, no prior reversal" if ok else "not eligible: credited, confirmed or already reversed"
            a["amount_paise"], a["utr"] = led.get("amount_paise", a["amount_paise"]), utr
        elif typ == "PAY_TAT_COMPENSATION":
            due = pos["compensation_paise"] if pos else 0
            ok = due > 0 and "TAT_COMPENSATION" not in already
            note = f"deadline missed: {rs(due)} owed" if ok else "not owed: still inside the deadline"
            a["amount_paise"], a["utr"] = due, utr
        elif typ == "RAISE_CHARGEBACK":
            ok = ct in OUTWARD_TAT and "CHARGEBACK" not in complaints
            a["amount_paise"], a["utr"] = led.get("amount_paise", a["amount_paise"]), utr
            note = f"recover {rs(a['amount_paise'])} from {st['beneficiary_bank']}" if ok else "not applicable or already raised"
        elif typ == "RETURN_TO_REMITTER":
            ok = inward and led["credit_status"] == "FAILED" and bool(led["suspense"]) and led["suspense"]["status"] == "OPEN" and not st["tcc"]
            a["amount_paise"], a["utr"] = led["amount_paise"] if inward else 0, utr
            note = f"return {rs(a['amount_paise'])} to {st['remitter_bank']}, clear {led['suspense']['id']}" if ok else "nothing to return"
        elif typ == "RAISE_DUPLICATE_REFUND":
            target = f.get("duplicate_utr") or a["utr"]
            acq = await call(run, N, "acquirer", "GET", "/orders", params={"utr": target}, title="Confirm UTR is not the payment of record",
                             summarize=lambda d: ("not the payment of record" if not d.get("utr_is_payment_of_record") else "is the payment of record", "ok"))
            tst = await call(run, N, "npci", "GET", f"/transactions/{target}/status", title="Confirm the duplicate reached the merchant",
                             summarize=lambda d: (f"credit {d['credit_leg']}{' with TCC' if d['tcc'] else ', no TCC'}", "ok" if d["tcc"] else "bad"))
            credited = tst.get("credit_leg") == "SUCCESS" and bool(tst.get("tcc"))
            ok = ct == "DUPLICATE_DEBIT" and acq.get("is_merchant_payment") and not acq.get("utr_is_payment_of_record") and credited
            a["utr"] = target
            note = (f"refund {rs(a['amount_paise'])} on {target}" if ok else
                    "merchant never received this debit (no TCC): reverse it, a duplicate refund cannot recover it" if not credited else
                    "target is the genuine payment: blocked")
        elif typ in FRAUD_ACTIONS:
            ok = ct == "AUTHORISED_FRAUD"
            a["utr"] = utr
            if typ == "REQUEST_LIEN":
                a["amount_paise"] = min(a["amount_paise"], led.get("amount_paise", a["amount_paise"]))
            note = "fraud case" if ok else "only allowed for fraud cases"
        elif typ == "SHARE_PROOF_OF_CREDIT":
            ok = st["credit_leg"] == "SUCCESS"
            note = "credit confirmed by NPCI and beneficiary bank" if ok else "credit not confirmed"
        elif typ == "MONITOR":
            note = "no money moves"
        else:
            ok, note = False, "unknown action type"
        await run.step(N, "guard", f"Guardrail · {typ.replace('_', ' ').lower()}", note, status="ok" if ok else "bad", pause=0.4)
        (approved if ok else rejected).append({**a, "note": note})

    payout = sum(a["amount_paise"] for a in approved if a["type"] in CREDITS)
    band = (run.facts.get("risk") or {}).get("band", "LOW")
    reasons = []
    if band == "HIGH":
        reasons.append("high fraud risk")
    if payout > config.AUTO_APPROVE_LIMIT_PAISE:
        reasons.append(f"payout {rs(payout)} above the {rs(config.AUTO_APPROVE_LIMIT_PAISE)} auto-limit")
    if any(a["type"] in FRAUD_ACTIONS for a in approved):
        reasons.append("freezing another bank's customer needs sign-off")
    needs_human = bool(reasons)
    await run.step(N, "decision", "Approval route",
                   ("Needs human sign-off — " + "; ".join(reasons)) if needs_human else
                   f"Auto-approved · risk {band}, payout {rs(payout)} within limits",
                   status="warn" if needs_human else "ok", pause=0.6)
    for a in approved:
        a["state"] = "proposed"
    return {"approved": approved, "rejected": rejected, "payout_paise": payout, "needs_human": needs_human,
            "human_reason": ("; ".join(reasons) or "").capitalize() or None}


async def execute(run: Run, actions: list[dict], node: str = N) -> list[dict]:
    await run.node(N, "running", activity="Executing validated actions", pause=0)
    f = run.facts["findings"]
    ev = run.facts["evidence"]
    utr0 = f["disputed_utr"]
    txn = ev.get("cbs_txn", {}).get(utr0)
    cust = run.case["customer_id"]
    for a in actions:
        typ, utr, amt = a["type"], a["utr"], a["amount_paise"]
        if typ in CREDITS:
            ptype = "REVERSAL" if typ == "REVERSE_DEBIT" else "TAT_COMPENSATION"
            res = await call(run, node, "cbs", "POST", "/postings", title=f"Credit {'refund' if ptype == 'REVERSAL' else 'compensation'} to customer",
                             body={"account_no": txn["account_no"], "utr_ref": utr, "type": ptype, "amount_paise": amt,
                                   "narration": f"UPI {ptype.replace('_', ' ').title()} {utr}", "idempotency_key": f"{ptype}:{utr}"},
                             summarize=lambda d: (f"{rs(d['amount_paise'])} credited · posting {d['id']}" + (" (already posted)" if d["duplicate"] else ""), "ok"))
            a["ref"] = res["id"]
        elif typ == "RETURN_TO_REMITTER":
            res = await call(run, node, "npci", "POST", "/returns", title="Return credit to remitter bank (RET)",
                             body={"utr": utr, "reason": "Beneficiary account closed"},
                             summarize=lambda d: (f"{d['id']} · {d['status']} — {d['resolution']}", "ok"))
            a["ref"] = res["id"]
        elif typ in ("RAISE_CHARGEBACK", "RAISE_DUPLICATE_REFUND", "RAISE_FRAUD_REPORT"):
            ctype = {"RAISE_CHARGEBACK": "CHARGEBACK", "RAISE_DUPLICATE_REFUND": "DUPLICATE_REFUND", "RAISE_FRAUD_REPORT": "FRAUD_REPORT"}[typ]
            res = await call(run, node, "npci", "POST", "/udir/complaints", title=f"Raise UDIR {ctype.replace('_', ' ').lower()}",
                             body={"utr": utr, "type": ctype, "amount_paise": amt, "remarks": a.get("reason", "")[:200]},
                             summarize=lambda d: (f"{d['id']} · {d['status']}", "ok" if d["status"] != "REJECTED" else "bad"))
            a["ref"] = res["id"]
        elif typ == "REQUEST_LIEN":
            res = await call(run, node, "bene", "POST", "/liens", title="Request lien on beneficiary funds",
                             body={"vpa": txn["counterparty_vpa"], "utr": utr, "amount_paise": amt, "reason": "Reported APP fraud"},
                             summarize=lambda d: (f"{d['status']} lien {rs(d['marked_paise'])} of {rs(d['requested_paise'])} · {d['id']}",
                                                  "ok" if d["status"] == "FULL" else "warn"))
            a["ref"], a["note"] = res["id"], f"{res['status'].lower()} lien · {rs(res['marked_paise'])} frozen"
            a["frozen_paise"] = res["marked_paise"]
        elif typ == "FILE_NCRP_REPORT":
            res = await call(run, node, "ncrp", "POST", "/reports", title="File cybercrime report",
                             body={"vpa": txn["counterparty_vpa"], "utr": utr, "amount_paise": amt or txn["amount_paise"]},
                             summarize=lambda d: (f"Acknowledgement {d['ack_no']}", "ok"))
            a["ref"] = res["ack_no"]
        elif typ == "BLOCK_PAYEE_VPA":
            await call(run, node, "cbs", "POST", "/vpa-blocks", title="Block payee for this customer",
                       body={"customer_id": cust, "vpa": txn["counterparty_vpa"]}, summarize=lambda d: (f"{d['vpa']} {d['status']}", "ok"))
            a["ref"] = "BLOCKED"
        a["state"] = "scheduled" if typ == "MONITOR" else "done"
    await run.node(N, "done", activity="Action responses recorded", pause=0)
    return actions
