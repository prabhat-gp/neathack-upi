"""Tools the agents can call. Investigator and Resolver tools hit the parties over HTTP; Policy tools wrap the
deterministic rulebook. Each tool returns compact JSON that is fed back to the LLM as the tool result."""

from dataclasses import dataclass
from datetime import datetime
from typing import Awaitable, Callable

from . import rules
from .parties import call
from .run import Run


def rs(paise: int | None) -> str:
    if paise is None:
        return "—"
    return f"₹{paise / 100:,.0f}" if paise % 100 == 0 else f"₹{paise / 100:,.2f}"


@dataclass
class Tool:
    name: str
    description: str
    schema: dict
    fn: Callable[[Run, str, dict], Awaitable[dict]] | None = None

    def spec(self) -> dict:
        return {"name": self.name, "description": self.description, "input_schema": self.schema}


def _obj(props: dict, required: list[str]) -> dict:
    return {"type": "object", "properties": props, "required": required}


UTR = {"type": "string", "description": "12-digit UPI transaction reference"}
CUST = {"type": "string", "description": "Bank customer id"}
VPA = {"type": "string", "description": "UPI virtual payment address"}
CASE_TYPES = list(rules.RULEBOOK)


def _ev(run: Run) -> dict:
    return run.facts.setdefault("evidence", {})


# ─────────────────────────── Investigator ───────────────────────────

async def get_bank_transaction(run, node, a):
    d = await call(run, node, "cbs", "GET", f"/transactions/{a['utr']}", title="Fetch debit from core banking",
                   summarize=lambda d: (f"{rs(d['amount_paise'])} {d['direction'].lower()} · {d['kind']} {d['mode'].lower()} to "
                                        f"{d['counterparty_vpa']} · {d['status']} · {len(d['related_postings'])} related posting(s)",
                                        "ok"))
    _ev(run).setdefault("cbs_txn", {})[a["utr"]] = d
    return d


async def get_customer_profile(run, node, a):
    d = await call(run, node, "cbs", "GET", f"/customers/{a['customer_id']}", title="Fetch customer profile",
                   summarize=lambda d: (f"{d['name']} · account {d['account_no']} · {d['disputes_90d']} disputes in 90d", "ok"))
    _ev(run)["customer"] = d
    return {k: v for k, v in d.items() if k != "balance_paise"}


async def get_statement_window(run, node, a):
    mins = int(a.get("window_minutes", 15))
    params = {"around": a["around_utr"], "window_minutes": mins} if a.get("around_utr") else {}
    d = await call(run, node, "cbs", "GET", f"/customers/{a['customer_id']}/statement", title="Scan customer statement",
                   params=params or None,
                   summarize=lambda d: (f"{len(d['debits'])} debit(s)" + (f" within ±{mins} min of {a['around_utr']}" if params else " on statement"),
                                        "warn" if params and len(d["debits"]) > 1 else "ok"))
    _ev(run)["statement"] = d
    return {"debits": [{k: t[k] for k in ("utr", "amount_paise", "counterparty_vpa", "counterparty_name", "narration", "initiated_at", "status")}
                       for t in d["debits"]]}


async def npci_check_status(run, node, a):
    def s(d):
        tone = "ok" if d["credit_leg"] == "SUCCESS" else "warn"
        role = "we are beneficiary" if d["beneficiary_bank"] == "Sahyadri Bank" else f"to {d['beneficiary_bank']}"
        return (f"{role} · credit {d['credit_leg']}{' (TCC)' if d['tcc'] else ''} · reversal {d['reversal_leg']} · {d['overall']}", tone)

    d = await call(run, node, "npci", "GET", f"/transactions/{a['utr']}/status", title="UDIR check transaction status", summarize=s)
    _ev(run).setdefault("npci", {})[a["utr"]] = d
    return d


async def beneficiary_credit_confirmation(run, node, a):
    def s(d):
        if d["status"] == "CREDITED":
            return (f"{d['bank']} confirms credit to {d['holder_name']} at {d['credited_at'][11:16]} · ref {d['credit_ref']}", "ok")
        return (f"{d['bank']}: amount NOT credited to {d['holder_name']}", "warn")

    d = await call(run, node, "bene", "GET", f"/credits/{a['utr']}", title="Ask beneficiary bank for credit confirmation", summarize=s)
    _ev(run).setdefault("bene_credit", {})[a["utr"]] = d
    return d


async def beneficiary_account_profile(run, node, a):
    def s(d):
        flags = []
        if d["account_age_days"] < 7:
            flags.append(f"opened {d['account_age_days']}d ago")
        if d["kyc"] != "FULL_KYC":
            flags.append(d["kyc"])
        if d["inward_remitters_48h"] >= 10:
            flags.append(f"{d['inward_remitters_48h']} remitters in 48h")
        return (f"{d['holder_name']} @ {d['bank']} · " + (", ".join(flags) if flags else f"{d['account_age_days']}d old, full KYC"),
                "bad" if flags else "ok")

    d = await call(run, node, "bene", "GET", f"/accounts/{a['vpa']}", title="Payee account risk profile", summarize=s)
    _ev(run)["payee_account"] = d
    return {k: v for k, v in d.items() if k not in ("available_paise", "lien_paise")}


async def merchant_order_lookup(run, node, a):
    def s(d):
        if not d["is_merchant_payment"]:
            return ("Not a merchant payment", "info")
        o = d["order"]
        if not o:
            return (f"{d['merchant']['name']}: no order linked to this UTR", "warn")
        rec = "payment of record" if d["utr_is_payment_of_record"] else f"order paid by another UTR ({o['paid_utr']})"
        return (f"{d['merchant']['name']} order {o['order_id']} {o['status']} · {rec}", "ok" if d["utr_is_payment_of_record"] else "warn")

    d = await call(run, node, "acquirer", "GET", "/orders", params={"utr": a["utr"]}, title="Check merchant order at acquirer", summarize=s)
    _ev(run).setdefault("acquirer", {})[a["utr"]] = d
    return d


async def ncrp_lookup(run, node, a):
    d = await call(run, node, "ncrp", "GET", "/reports", params={"vpa": a["vpa"]}, title="Check cybercrime reports on payee",
                   summarize=lambda d: (f"{d['report_count']} prior report(s) on {d['vpa']}" +
                                        (f" totalling {rs(d['total_reported_paise'])}" if d["report_count"] else ""),
                                        "bad" if d["report_count"] >= 3 else "ok"))
    _ev(run)["ncrp"] = d
    return {"report_count": d["report_count"], "total_reported_paise": d["total_reported_paise"]}


async def get_inward_credit(run, node, a):
    def s(d):
        b = d["beneficiary"]
        susp = d["suspense"]
        if d["credit_status"] == "FAILED":
            return (f"Credit to {b['name']} FAILED ({d['failure_reason']}, {b['status'].lower()} since {b['status_since'][:10]}) · "
                    f"{rs(d['amount_paise'])} parked in suspense {susp['id']} ({susp['status']})", "bad")
        return (f"Inward credit {d['credit_status']}", "ok")

    d = await call(run, node, "cbs", "GET", f"/inward/{a['utr']}", title="Check inward credit in our core banking", summarize=s)
    _ev(run).setdefault("inward", {})[a["utr"]] = d
    return d


async def reconciliation_sweep(run, node, a):
    date = a["settlement_date"]
    raw = await call(run, node, "npci", "GET", "/raw-data", params={"settlement_date": date, "bank": "Sahyadri Bank"},
                     title="Download NPCI settlement raw data",
                     summarize=lambda d: (f"{len(d['rows'])} UPI rows for Sahyadri Bank on {date} · "
                                          f"{sum(1 for r in d['rows'] if r['overall'] == 'DEEMED')} deemed", "ok"))
    led = await call(run, node, "cbs", "GET", "/ledger", params={"date": date}, title="Pull switch & core banking ledger",
                     summarize=lambda d: (f"{len(d['entries'])} ledger entries on {date}", "ok"))
    ledger = {e["utr"]: e for e in led["entries"]}
    exceptions = []
    for r in raw["rows"]:
        e = ledger.get(r["utr"])
        if r["beneficiary_bank"] == "Sahyadri Bank" and e and e["status"] == "FAILED":
            exceptions.append({"utr": r["utr"], "type": "Inward credit failed, funds in suspense", "amount_paise": r["amount_paise"]})
        elif r["remitter_bank"] == "Sahyadri Bank" and r["overall"] == "DEEMED" and not r["tcc"] and r["reversal_leg"] != "SUCCESS":
            exceptions.append({"utr": r["utr"], "type": "Outward deemed, no credit confirmation or return", "amount_paise": r["amount_paise"]})
    matched = len(raw["rows"]) - len(exceptions)
    await run.step(node, "finding", f"Reconciliation: {matched} matched · {len(exceptions)} exception(s)",
                   "\n".join(f"{x['utr']} · {rs(x['amount_paise'])} · {x['type']}" for x in exceptions) or "No exceptions",
                   status="warn" if exceptions else "ok", pause=0.8)
    run.facts["sweep"] = {"date": date, "rows": len(raw["rows"]), "exceptions": exceptions}
    return {"rows": len(raw["rows"]), "exceptions": exceptions}


SWEEP_TOOL = Tool("reconciliation_sweep", "Match NPCI settlement raw data against our switch/CBS ledger for a date and list exceptions.",
                  _obj({"settlement_date": {"type": "string", "description": "YYYY-MM-DD"}}, ["settlement_date"]), reconciliation_sweep)


INVESTIGATOR_TOOLS = [
    Tool("get_bank_transaction", "Fetch the debit from our core banking system (amount, payee, mode, any reversal/refund postings).",
         _obj({"utr": UTR}, ["utr"]), get_bank_transaction),
    Tool("get_customer_profile", "Fetch the customer's profile from core banking (device binding time, dispute history).",
         _obj({"customer_id": CUST}, ["customer_id"]), get_customer_profile),
    Tool("get_statement_window", "List the customer's debits: around a UTR (±window_minutes) to detect duplicates, or the whole recent statement "
         "if around_utr is omitted (use when the complaint seems to describe a different payment).",
         _obj({"customer_id": CUST, "around_utr": UTR, "window_minutes": {"type": "integer", "default": 15}}, ["customer_id"]),
         get_statement_window),
    Tool("npci_check_status", "NPCI UDIR 'check transaction status': remitter/beneficiary bank, debit, credit (with TCC), reversal legs.",
         _obj({"utr": UTR}, ["utr"]), npci_check_status),
    Tool("get_inward_credit", "When OUR bank is the beneficiary: did our core banking post the credit, and is it parked in UPI suspense?",
         _obj({"utr": UTR}, ["utr"]), get_inward_credit),
    Tool("beneficiary_credit_confirmation", "Ask the beneficiary bank whether the amount was credited, with timestamp and credit reference.",
         _obj({"utr": UTR}, ["utr"]), beneficiary_credit_confirmation),
    Tool("beneficiary_account_profile", "Beneficiary bank's risk view of the payee account: age, KYC level, inward-remitter fan-in.",
         _obj({"vpa": VPA}, ["vpa"]), beneficiary_account_profile),
    Tool("merchant_order_lookup", "Ask the merchant acquirer which order (if any) this UTR paid for, and whether it is the payment of record.",
         _obj({"utr": UTR}, ["utr"]), merchant_order_lookup),
    Tool("ncrp_lookup", "Count prior National Cybercrime Reporting Portal reports against a payee VPA.",
         _obj({"vpa": VPA}, ["vpa"]), ncrp_lookup),
    Tool("submit_findings", "Submit your investigation result. Call exactly once, when the evidence is complete.",
         _obj({
             "case_type": {"type": "string", "enum": CASE_TYPES},
             "disputed_utr": UTR,
             "duplicate_utr": {"type": "string", "description": "For DUPLICATE_DEBIT: the UTR that is NOT the payment of record"},
             "summary": {"type": "string", "description": "2-3 sentences: what actually happened, citing evidence"},
             "evidence": {"type": "array", "items": _obj({"source": {"type": "string", "description": "The system the fact came from, in plain words: "
                                                                             "'Core banking', 'NPCI', the other bank's name, 'Acquirer' or 'NCRP'"},
                                                          "fact": {"type": "string"}}, ["source", "fact"])},
             "claim_matches_evidence": {"type": "boolean"},
         }, ["case_type", "disputed_utr", "summary", "evidence", "claim_matches_evidence"])),
]


# ─────────────────────────── Policy ───────────────────────────

async def lookup_rbi_rule(run, node, a):
    rule = rules.RULEBOOK.get(a["case_type"])
    if not rule:
        return {"error": f"No rule for {a['case_type']}"}
    await run.step(node, "rule", rule["name"], f"{rule['text']}\n— {rule['source']}", pause=1.0)
    return rule


async def compute_tat_position(run, node, a):
    st = _ev(run).get("npci", {}).get(a["utr"]) or await npci_check_status(run, node, {"utr": a["utr"]})
    pos = rules.tat_position(a["case_type"], st["initiated_at"], st.get("reversal_at"), datetime.now(rules.IST))
    if pos["applies"] and not pos["breached"]:
        detail = (f"T = {pos['T']} · {pos['tat']} deadline {pos['deadline_at'][:10]} 23:59 · {rules.human_left(pos['seconds_left'])}. "
                  f"Resolve now → ₹0 compensation. Every day past the deadline costs ₹100.")
        tone = "ok"
    elif pos["applies"]:
        detail = f"Deadline {pos['deadline_at'][:10]} already missed by {pos['days_late']} day(s) → {rs(pos['compensation_paise'])} owed suo moto"
        tone = "bad"
    else:
        detail, tone = pos["reason"], "info"
    await run.step(node, "calc", "Deadline position (policy engine)", detail, status=tone, pause=1.0)
    run.facts.setdefault("tat", {})[a["utr"]] = pos
    return pos


POLICY_TOOLS = [
    Tool("lookup_rbi_rule", "Fetch the exact rule text and citation that governs a case type.",
         _obj({"case_type": {"type": "string", "enum": list(rules.RULEBOOK)}}, ["case_type"]), lookup_rbi_rule),
    Tool("compute_tat_position", "Policy engine: compute T, the TAT deadline, days late and ₹100/day compensation from NPCI timestamps.",
         _obj({"utr": UTR, "case_type": {"type": "string", "enum": list(rules.RULEBOOK)}}, ["utr", "case_type"]), compute_tat_position),
    Tool("submit_ruling", "Submit the policy ruling. Amounts must come from compute_tat_position, never from your own arithmetic.",
         _obj({
             "case_type": {"type": "string", "enum": list(rules.RULEBOOK)},
             "reversal_due_paise": {"type": "integer"},
             "compensation_due_paise": {"type": "integer"},
             "liability": {"type": "string", "description": "Who bears the loss / must act"},
             "citation": {"type": "string"},
             "reasoning": {"type": "string"},
         }, ["case_type", "reversal_due_paise", "compensation_due_paise", "liability", "citation", "reasoning"])),
]


# ─────────────────────────── Resolver ───────────────────────────

async def compute_risk_score(run, node, a):
    ev = _ev(run)
    if run.facts.get("findings", {}).get("case_type") == "INWARD_NOT_CREDITED":
        inward = ev.get("inward", {}).get(a["utr"])
        if not inward:
            inward = await get_inward_credit(run, node, {"utr": a["utr"]})
        valid = inward["credit_status"] == "FAILED" and (inward.get("suspense") or {}).get("status") == "OPEN"
        result = {"score": 0 if valid else 100, "band": "LOW" if valid else "HIGH", "factors": [],
                  "scope": "Return of bank-held suspense to the original remitter; fresh execution checks still required"}
        run.facts["risk"] = result
        await run.step(node, "check", "Inward return risk", result["scope"], status="ok" if valid else "warn", pause=0)
        return result
    if a["utr"] not in ev.get("cbs_txn", {}):
        await get_bank_transaction(run, node, {"utr": a["utr"]})
    txn = ev["cbs_txn"][a["utr"]]
    if "customer" not in ev:
        await get_customer_profile(run, node, {"customer_id": a["customer_id"]})
    if "payee_account" not in ev:
        await beneficiary_account_profile(run, node, {"vpa": txn["counterparty_vpa"]})
    if "ncrp" not in ev:
        await ncrp_lookup(run, node, {"vpa": txn["counterparty_vpa"]})
    cust, payee, ncrp = ev["customer"], ev["payee_account"], ev["ncrp"]
    device_age_h = (datetime.fromisoformat(txn["initiated_at"]) - datetime.fromisoformat(cust["device_bound_at"])).total_seconds() / 3600
    signals = {
        "payee_ncrp_reports": ncrp["report_count"], "payee_account_age_days": payee["account_age_days"], "payee_kyc": payee["kyc"],
        "payee_inward_remitters_48h": payee["inward_remitters_48h"], "mode": txn["mode"], "device_age_hours": device_age_h,
        "disputes_90d": cust["disputes_90d"],
    }
    result = rules.risk_score(signals)
    for f in result["factors"]:
        await run.step(node, "check", f["label"], f"+{f['points']}" if f["hit"] else "no", status="bad" if f["hit"] else "ok", pause=0.35)
    await run.step(node, "decision", f"Risk score {result['score']}/100 · {result['band']}",
                   status={"HIGH": "bad", "MEDIUM": "warn", "LOW": "ok"}[result["band"]], pause=0.8)
    run.facts["risk"] = result
    return result


ACTION_TYPES = ["REVERSE_DEBIT", "RAISE_CHARGEBACK", "RETURN_TO_REMITTER", "PAY_TAT_COMPENSATION", "RAISE_DUPLICATE_REFUND",
                "REQUEST_LIEN", "FILE_NCRP_REPORT", "RAISE_FRAUD_REPORT", "BLOCK_PAYEE_VPA", "SHARE_PROOF_OF_CREDIT", "MONITOR"]

RESOLVER_TOOLS = [
    Tool("compute_risk_score", "Fraud-risk scorer over customer, payee and NCRP signals. Call before proposing any action.",
         _obj({"utr": UTR, "customer_id": CUST}, ["utr", "customer_id"]), compute_risk_score),
    Tool("submit_resolution_plan", "Submit the actions to execute and the reply to the customer. The execution engine validates "
         "every action against the policy ruling and approval limits before anything moves.",
         _obj({
             "actions": {"type": "array", "items": _obj({
                 "type": {"type": "string", "enum": ACTION_TYPES},
                 "utr": UTR,
                 "amount_paise": {"type": "integer"},
                 "reason": {"type": "string"},
             }, ["type", "utr", "amount_paise", "reason"])},
             "customer_message": {"type": "string", "description": "Plain-language reply to the customer, under 70 words"},
             "rationale": {"type": "string"},
         }, ["actions", "customer_message", "rationale"])),
]
