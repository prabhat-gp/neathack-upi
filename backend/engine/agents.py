"""The three specialist agents. Each has an LLM brain (Claude, tool-using) and a rules brain that
calls the same tools and returns the same structured output, used when no LLM credentials are set."""

import asyncio
import json

from . import rules, tools as T
from .llm import run_agent
from .run import Run
from .tools import rs

BANK = "Sahyadri Bank"

INVESTIGATOR_SYSTEM = f"""You are the Investigator agent on {BANK}'s UPI exceptions desk.
Goal: establish exactly what happened to a UPI transaction so it can be fixed before its RBI deadline.
You never move money and never decide liability.

How to work:
- Every fact must come from a tool. Call independent tools in parallel.
- Start with npci_check_status. If {BANK} is the BENEFICIARY bank, use get_inward_credit (did our core banking post it,
  is it in suspense?). If {BANK} is the REMITTER, use get_bank_transaction and beneficiary_credit_confirmation.
- Merchant payments: merchant_order_lookup. Possible repeat charges: get_statement_window.
- Collect requests, very new payees, or alleged fraud: beneficiary_account_profile and ncrp_lookup.
- The customer's words may be wrong, vague or in Hindi/Hinglish. Records win. If the complaint describes a different payment
  than the UTR (amount, payee, date), list recent transactions with get_statement_window and say which one they mean.
- Outside intelligence (Crustdata): for suspected fraud call scam_intel_search once with the scam pattern; for merchant
  payments call verify_merchant once with the merchant's name. Quote what you found in the summary.
- Counterparties fail. Tools already retry once. If a party is still unreachable, try it at most once more, then decide on
  the evidence you have: NPCI is the system of record for whether the credit leg completed (TCC). Never wait out a deadline
  for a broken API; state what was unreachable in the evidence.

Case types:
P2P_NOT_CREDITED — we are remitter; person-to-person; credit not confirmed (DEEMED/TIMEOUT/FAILED, no TCC); not reversed.
INWARD_NOT_CREDITED — we are beneficiary; our core banking could not post the credit; funds sit in suspense; not yet returned.
P2M_NOT_CONFIRMED — we are remitter; merchant payment; merchant never got confirmation (no TCC); not reversed.
DUPLICATE_DEBIT — two debits that BOTH reached the merchant (NPCI credit SUCCESS with TCC on both) for one order;
  duplicate_utr = the one NOT the payment of record. If the extra debit has no TCC, the merchant never got it: that is
  P2M_NOT_CONFIRMED (we reverse it ourselves), not a duplicate.
AUTHORISED_FRAUD — customer authorised (PIN) a payment to a fraudster: collect request / social engineering + payee risk signals.
CREDIT_CONFIRMED — beneficiary bank confirms credit and nothing suggests fraud or duplication.
ALREADY_RESOLVED — reversal, return or refund already done.
UNCLEAR — records conflict.

Think briefly out loud before each batch of tool calls. Finish with submit_findings exactly once."""

POLICY_SYSTEM = f"""You are the Policy agent on {BANK}'s UPI exceptions desk.
Given the Investigator's findings, decide what the rules require and by when, so {BANK} acts before any penalty accrues.
- Always call lookup_rbi_rule for the case type.
- For P2P_NOT_CREDITED, INWARD_NOT_CREDITED and P2M_NOT_CONFIRMED call compute_tat_position to get the deadline and time left.
- Take every amount from tool output; never do your own arithmetic. Compensation is owed only if the deadline has passed.
- reversal_due_paise = the debited amount for outward cases that must be refunded; 0 for inward cases (we return instead).
State the deadline and time left in your reasoning, then call submit_ruling."""

RESOLVER_SYSTEM = f"""You are the Resolver agent on {BANK}'s UPI exceptions desk.
Given findings and the ruling, score fraud risk and propose the minimal set of actions that closes the case before its deadline.
- Call compute_risk_score first.
- P2P_NOT_CREDITED / P2M_NOT_CONFIRMED: REVERSE_DEBIT (full amount) and RAISE_CHARGEBACK (recover from the other bank).
  Add PAY_TAT_COMPENSATION only if the ruling says the deadline was already missed.
- INWARD_NOT_CREDITED: RETURN_TO_REMITTER.
- DUPLICATE_DEBIT: RAISE_DUPLICATE_REFUND on the duplicate UTR.
- AUTHORISED_FRAUD: REQUEST_LIEN (full amount), FILE_NCRP_REPORT, RAISE_FRAUD_REPORT, BLOCK_PAYEE_VPA.
- CREDIT_CONFIRMED: SHARE_PROOF_OF_CREDIT.
Message: plain language, under 60 words, with amounts and references, written in the same language and script the customer used. Address the customer, or for inward returns write an
ops note. If human approval may be needed, say the case is being reviewed. Call submit_resolution_plan once.
A guardrailed execution engine validates and executes your plan; you cannot bypass it."""


def _case_brief(run: Run) -> str:
    c = run.case
    src = "Raised by the reconciliation sweep (no customer complaint yet)." if c["trigger"] == "sweep" else f"Customer complaint: \"{c['complaint']}\""
    return f"Customer id: {c['customer_id']}\nUTR: {c['utr']}\n{src}"


# ─────────────────────────── Investigator ───────────────────────────

async def investigator(run: Run, instructions: str) -> dict:
    if run.brain != "rules":
        task = f"{_case_brief(run)}\n\nOrchestrator's instruction: {instructions}"
        out = await run_agent(run, "investigator", INVESTIGATOR_SYSTEM, T.INVESTIGATOR_TOOLS, task, "submit_findings")
    else:
        out = await _investigator_rules(run)
    run.facts["findings"] = out
    await run.step("investigator", "finding", rules.RULEBOOK.get(out["case_type"], {}).get("name", out["case_type"].replace("_", " ").title()),
                   out["summary"], status="info" if out["case_type"] in ("CREDIT_CONFIRMED", "ALREADY_RESOLVED") else "warn", pause=0.8)
    return out


async def _investigator_rules(run: Run) -> dict:
    c, n = run.case, "investigator"
    utr, cid = c["utr"], c["customer_id"]
    await run.step(n, "think", "Plan", "Ask NPCI for the true leg status first, then go to whichever side holds the money.", pause=0.6)
    st = await T.npci_check_status(run, n, {"utr": utr})

    if st["beneficiary_bank"] == BANK:
        await run.step(n, "think", "We are the beneficiary bank", "Check whether our core banking posted the credit and where the money sits.", pause=0.5)
        inw = await T.get_inward_credit(run, n, {"utr": utr})
        ev = [{"source": "NPCI", "fact": f"{rs(st['amount_paise'])} from {st['payer_vpa']} ({st['remitter_bank']}), credit {st['credit_leg']}, no TCC"},
              {"source": "Core banking", "fact": f"credit {inw['credit_status']}: {inw['failure_reason']}"}]
        if inw["suspense"]:
            ev.append({"source": "Suspense ledger", "fact": f"{inw['suspense']['id']} {inw['suspense']['status']} · {rs(inw['suspense']['amount_paise'])}"})
        if inw["credit_status"] == "RETURNED" or st["reversal_leg"] == "SUCCESS":
            return {"case_type": "ALREADY_RESOLVED", "disputed_utr": utr, "evidence": ev, "claim_matches_evidence": True,
                    "summary": "The credit has already been returned to the remitter bank."}
        return {"case_type": "INWARD_NOT_CREDITED", "disputed_utr": utr, "evidence": ev, "claim_matches_evidence": True,
                "summary": f"{rs(inw['amount_paise'])} from {inw['remitter_name']} ({inw['remitter_bank']}) could not be credited: "
                           f"{inw['beneficiary']['name']}'s account is {inw['beneficiary']['status'].lower()}. The money sits in our UPI suspense "
                           f"({inw['suspense']['id']}) and NPCI still shows it as deemed. Nobody has returned it."}

    txn, cr, _ = await asyncio.gather(T.get_bank_transaction(run, n, {"utr": utr}), T.beneficiary_credit_confirmation(run, n, {"utr": utr}),
                                      T.get_customer_profile(run, n, {"customer_id": cid}), return_exceptions=True)
    if isinstance(txn, Exception):
        raise txn
    payee = txn["counterparty_vpa"]
    ev = [{"source": "Core banking", "fact": f"{rs(txn['amount_paise'])} debited to {payee} ({txn['kind']}, {txn['mode'].lower()}) at {txn['initiated_at'][:16].replace('T', ' ')}"},
          {"source": "NPCI", "fact": f"credit {st['credit_leg']}{' with TCC' if st['tcc'] else ', no TCC'}, reversal {st['reversal_leg']}"}]
    if isinstance(cr, Exception):
        await run.step(n, "think", "Beneficiary bank unreachable",
                       f"{st['beneficiary_bank']} failed twice ({cr}). NPCI is the system of record for the credit leg: "
                       f"{st['credit_leg']}, no TCC. The deadline does not wait for their API, so I decide on NPCI evidence "
                       "and the chargeback will recover the money from them.", status="warn", pause=0.6)
        ev.append({"source": st["beneficiary_bank"], "fact": "unreachable after retry; decided on NPCI evidence"})
    else:
        ev.append({"source": cr["bank"], "fact": f"credited at {cr['credited_at'][11:19]} · ref {cr['credit_ref']}" if cr["status"] == "CREDITED" else "amount not credited"})
    if {p["type"] for p in txn["related_postings"]} & {"REVERSAL", "MERCHANT_REFUND"}:
        return {"case_type": "ALREADY_RESOLVED", "disputed_utr": utr, "evidence": ev, "claim_matches_evidence": False,
                "summary": "The customer has already been refunded for this UTR. Nothing outstanding."}

    credited = st["credit_leg"] == "SUCCESS" or bool(st["tcc"])
    if txn["kind"] == "P2M":
        await run.step(n, "think", "Merchant payment", "Ask the acquirer which order this UTR paid, and scan for a second attempt.", pause=0.5)
        acq, stmt = await asyncio.gather(T.merchant_order_lookup(run, n, {"utr": utr}),
                                         T.get_statement_window(run, n, {"customer_id": cid, "around_utr": utr, "window_minutes": 15}))
        o = acq.get("order")
        if o:
            ev.append({"source": "Acquirer", "fact": f"order {o['order_id']} {o['status']}, paid by UTR {o['paid_utr']}"})
        twins = [d for d in stmt["debits"] if d["utr"] != utr and d["counterparty_vpa"] == payee and d["amount_paise"] == txn["amount_paise"]]
        if not credited:
            again = (f" She paid again at {twins[0]['initiated_at'][11:16]} (UTR {twins[0]['utr']}), which completed the order."
                     if twins and o and o["paid_utr"] != utr else "")
            return {"case_type": "P2M_NOT_CONFIRMED", "disputed_utr": utr, "evidence": ev, "claim_matches_evidence": True,
                    "summary": f"{rs(txn['amount_paise'])} left the customer's account but {txn['counterparty_name']} never got a credit "
                               f"confirmation (NPCI {st['credit_leg']}, no TCC).{again} The first debit is stuck and must be refunded."}
        if twins and not acq["utr_is_payment_of_record"]:
            return {"case_type": "DUPLICATE_DEBIT", "disputed_utr": utr, "duplicate_utr": utr, "evidence": ev, "claim_matches_evidence": True,
                    "summary": f"Two successful {rs(txn['amount_paise'])} debits to {payee}; this one is not the payment of record."}

    if not credited:
        return {"case_type": "P2P_NOT_CREDITED", "disputed_utr": utr, "evidence": ev, "claim_matches_evidence": True,
                "summary": f"{rs(txn['amount_paise'])} left the customer's account at {txn['initiated_at'][11:16]}. "
                           + (f"{st['beneficiary_bank']}'s API was down, so this rests on NPCI: " if isinstance(cr, Exception)
                              else f"{cr['bank']} never credited {cr['holder_name']}: NPCI shows ")
                           + "the payment deemed after a timeout, with no credit confirmation and no return."}

    await run.step(n, "think", "Money was delivered", "Credit is confirmed. Before closing, rule out fraud on the payee.", pause=0.5)
    acct, ncrp = await asyncio.gather(T.beneficiary_account_profile(run, n, {"vpa": payee}), T.ncrp_lookup(run, n, {"vpa": payee}))
    if (txn["mode"] == "COLLECT" and (ncrp["report_count"] >= 3 or acct["account_age_days"] < 7)) or ncrp["report_count"] >= 5:
        ev += [{"source": cr["bank"], "fact": f"payee account {acct['account_age_days']} days old, {acct['kyc']}, {acct['inward_remitters_48h']} remitters in 48h"},
               {"source": "NCRP", "fact": f"{ncrp['report_count']} prior cybercrime reports on {payee}"}]
        return {"case_type": "AUTHORISED_FRAUD", "disputed_utr": utr, "evidence": ev, "claim_matches_evidence": True,
                "summary": f"Customer approved a collect request for {rs(txn['amount_paise'])} to {payee}, a {acct['account_age_days']}-day-old account "
                           f"with {ncrp['report_count']} cybercrime reports. The money is likely still in this mule account."}
    return {"case_type": "CREDIT_CONFIRMED", "disputed_utr": utr, "evidence": ev, "claim_matches_evidence": False,
            "summary": f"{cr['bank']} confirms {rs(txn['amount_paise'])} reached {cr['holder_name']} at {cr['credited_at'][11:16]} on "
                       f"{cr['credited_at'][:10]} (ref {cr['credit_ref']}). The payment did not fail; the payee is clean."}


# ─────────────────────────── Policy ───────────────────────────

async def policy(run: Run, instructions: str) -> dict:
    f = run.facts["findings"]
    if run.brain != "rules":
        task = f"{_case_brief(run)}\n\nInvestigator findings:\n{json.dumps(f, indent=1)}\n\nOrchestrator's instruction: {instructions}"

        def check(inp):
            pos = run.facts.get("tat", {}).get(f["disputed_utr"])
            if rules.RULEBOOK.get(inp["case_type"], {}).get("tat_days") and not pos:
                return "Call compute_tat_position before ruling on a deadline case."
            if pos and inp["compensation_due_paise"] != pos["compensation_paise"]:
                return f"compensation_due_paise must equal the policy engine's {pos['compensation_paise']}."
            return None

        out = await run_agent(run, "policy", POLICY_SYSTEM, T.POLICY_TOOLS, task, "submit_ruling", validate=check)
    else:
        out = await _policy_rules(run, f)
    run.facts["ruling"] = out
    await run.step("policy", "decision", "Ruling", out["reasoning"], status="ok" if not out["compensation_due_paise"] else "bad", pause=0.8)
    return out


async def _policy_rules(run: Run, f: dict) -> dict:
    n, ct, utr = "policy", f["case_type"], f["disputed_utr"]
    rule = await T.lookup_rbi_rule(run, n, {"case_type": ct})
    ev = run.facts["evidence"]
    amount = (ev.get("cbs_txn", {}).get(utr) or ev.get("inward", {}).get(utr) or {}).get("amount_paise", 0)
    if rule["tat_days"]:
        pos = await T.compute_tat_position(run, n, {"utr": utr, "case_type": ct})
        left = rules.human_left(pos["seconds_left"])
        if ct == "INWARD_NOT_CREDITED":
            reasoning = (f"As beneficiary bank we must return {rs(amount)} by {pos['tat']} ({pos['deadline_at'][:10]} 23:59, {left}). "
                         "Return now: no compensation, and no chargeback lands against us.")
            liability, due_rev = "Sahyadri Bank, as beneficiary bank", 0
        else:
            reasoning = (f"Refund {rs(amount)} before {pos['tat']} ({pos['deadline_at'][:10]} 23:59, {left}) and nothing is owed. "
                         "Recover the money from the other bank by chargeback.")
            liability, due_rev = "Beneficiary side (recovered by chargeback); we refund the customer first", amount
            if pos["breached"]:
                reasoning = f"Deadline missed by {pos['days_late']} day(s): refund {rs(amount)} and pay {rs(pos['compensation_paise'])} suo moto."
        return {"case_type": ct, "reversal_due_paise": due_rev, "compensation_due_paise": pos["compensation_paise"],
                "liability": liability, "citation": rule["source"], "reasoning": reasoning}
    reasoning = {"DUPLICATE_DEBIT": "Both payments succeeded: no deadline penalty applies. Refund the duplicate through the merchant's bank.",
                 "AUTHORISED_FRAUD": "No RBI penalty applies to a customer-authorised payment. What matters is speed: freeze the funds before they move.",
                 "CREDIT_CONFIRMED": "No failure, so nothing is owed. Close with proof before it turns into a chargeback."}.get(ct, rule["remedy"])
    liability = {"DUPLICATE_DEBIT": "Merchant (refund via acquirer)", "AUTHORISED_FRAUD": "Recovery from the mule account",
                 "CREDIT_CONFIRMED": "None"}.get(ct, "To be determined")
    return {"case_type": ct, "reversal_due_paise": 0, "compensation_due_paise": 0, "liability": liability,
            "citation": rule["source"], "reasoning": reasoning}


# ─────────────────────────── Resolver ───────────────────────────

async def resolver(run: Run, instructions: str) -> dict:
    f, r = run.facts["findings"], run.facts.get("ruling")
    if run.brain != "rules":
        task = (f"{_case_brief(run)}\n\nInvestigator findings:\n{json.dumps(f, indent=1)}\n\n"
                f"Policy ruling:\n{json.dumps(r, indent=1)}\n\nOrchestrator's instruction: {instructions}")

        def check(inp):
            return None if "risk" in run.facts else "Call compute_risk_score before submitting a plan."

        plan = await run_agent(run, "resolver", RESOLVER_SYSTEM, T.RESOLVER_TOOLS, task, "submit_resolution_plan", validate=check)
    else:
        plan = await _resolver_rules(run, f, r)
    await run.step("resolver", "plan", "Plan", " · ".join(
        a["type"].replace("_", " ").lower() + (f" {rs(a['amount_paise'])}" if a["amount_paise"] else "") for a in plan["actions"]), pause=0.7)
    await run.step("resolver", "draft", "Message", plan["customer_message"], pause=0.7)
    run.facts["plan"] = plan
    return plan


async def _resolver_rules(run: Run, f: dict, r: dict | None) -> dict:
    n, ct, utr = "resolver", f["case_type"], f["disputed_utr"]
    if ct != "INWARD_NOT_CREDITED":
        await T.compute_risk_score(run, n, {"utr": utr, "customer_id": run.case["customer_id"]})
    else:
        run.facts["risk"] = {"score": 0, "band": "LOW", "factors": []}
        await run.step(n, "think", "No customer money at risk", "This returns funds we hold in suspense; no fraud scoring needed.", pause=0.5)
    ev = run.facts["evidence"]
    txn = ev.get("cbs_txn", {}).get(utr)
    name = run.case["customer_name"].split()[0]
    acts: list[dict] = []
    if ct in ("P2P_NOT_CREDITED", "P2M_NOT_CONFIRMED"):
        amt = txn["amount_paise"]
        acts.append({"type": "REVERSE_DEBIT", "utr": utr, "amount_paise": amt, "reason": "Credit never confirmed; refund before deadline"})
        if r and r["compensation_due_paise"]:
            acts.append({"type": "PAY_TAT_COMPENSATION", "utr": utr, "amount_paise": r["compensation_due_paise"], "reason": "Deadline missed"})
        acts.append({"type": "RAISE_CHARGEBACK", "utr": utr, "amount_paise": amt, "reason": "Recover from the beneficiary side"})
        msg = (f"Hi {name}, your {rs(amt)} payment to {txn['counterparty_name']} (UTR {utr}) didn't go through. "
               f"We've refunded {rs(amt)} to your account. No action needed from you.")
    elif ct == "INWARD_NOT_CREDITED":
        inw = ev["inward"][utr]
        acts.append({"type": "RETURN_TO_REMITTER", "utr": utr, "amount_paise": inw["amount_paise"], "reason": "Beneficiary account closed"})
        msg = (f"Ops note: {rs(inw['amount_paise'])} from {inw['remitter_name']} ({inw['remitter_bank']}) returned via NPCI before T+1; "
               f"suspense {inw['suspense_id']} cleared. {inw['remitter_bank']} credits the sender in the next cycle.")
    elif ct == "DUPLICATE_DEBIT":
        dup = f.get("duplicate_utr") or utr
        acts.append({"type": "RAISE_DUPLICATE_REFUND", "utr": dup, "amount_paise": txn["amount_paise"], "reason": "Second debit for one order"})
        msg = f"Hi {name}, you were charged twice for one order. We've raised a refund for the extra {rs(txn['amount_paise'])} (UTR {dup})."
    elif ct == "AUTHORISED_FRAUD":
        amt = txn["amount_paise"]
        acts += [{"type": "REQUEST_LIEN", "utr": utr, "amount_paise": amt, "reason": "Stop funds leaving the mule account"},
                 {"type": "FILE_NCRP_REPORT", "utr": utr, "amount_paise": amt, "reason": "Mandatory cybercrime report"},
                 {"type": "RAISE_FRAUD_REPORT", "utr": utr, "amount_paise": amt, "reason": "Flag payee in UPI network"},
                 {"type": "BLOCK_PAYEE_VPA", "utr": utr, "amount_paise": 0, "reason": "Prevent repeat payments"}]
        msg = (f"Hi {name}, we're sorry this happened. We're asking the receiving bank to freeze the {rs(amt)} and reporting it to the "
               "cybercrime portal. A specialist is reviewing your case now. Never approve a 'collect' request to receive money.")
    else:
        cr = ev["bene_credit"][utr]
        acts.append({"type": "SHARE_PROOF_OF_CREDIT", "utr": utr, "amount_paise": 0, "reason": "Credit confirmed"})
        msg = (f"Hi {name}, your {rs(txn['amount_paise'])} reached {cr['holder_name']} at {cr['credited_at'][11:16]} on "
               f"{cr['credited_at'][:10]} (bank ref {cr['credit_ref']}). Please share this reference with them.")
    return {"actions": acts, "customer_message": msg, "rationale": f"Standard remedy for {ct}"}
