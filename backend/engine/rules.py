"""Deterministic policy engine and risk scorer. LLM agents call these as tools; the executor
re-runs them independently, so money amounts never depend on model output."""

from datetime import datetime, time, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))

TAT_CIRCULAR = "RBI/2019-20/67 · DPSS.CO.PD No.629/02.01.014/2019-20 (20 Sep 2019), Annex"
COMPENSATION_PER_DAY_PAISE = 100_00

RULEBOOK = {
    "P2P_NOT_CREDITED": {
        "name": "UPI fund transfer — account debited, beneficiary not credited",
        "source": f"{TAT_CIRCULAR}, row 4(a)",
        "text": "If unable to credit the beneficiary account, auto reversal (R) by the Beneficiary bank latest on T + 1 day. "
                "₹100/- per day if delay is beyond T + 1 day. Compensation is credited suo moto, without waiting for a claim.",
        "tat_days": 1,
        "remedy": "Refund the customer before T+1 so no compensation accrues; recover from the beneficiary bank via UDIR chargeback.",
    },
    "INWARD_NOT_CREDITED": {
        "name": "Inward UPI credit we could not post — we are the beneficiary bank",
        "source": f"{TAT_CIRCULAR}, row 4(a) · NPCI OC-213 (chargebacks auto-accepted against late returns)",
        "text": "If unable to credit the beneficiary account, auto reversal (R) by the Beneficiary bank latest on T + 1 day. "
                "₹100/- per day if delay is beyond T + 1 day. If the remitter bank's chargeback lands before our return, "
                "it is closed on deemed acceptance against us.",
        "tat_days": 1,
        "remedy": "Return (RET) the credit to the remitter bank via NPCI before T+1 and clear the suspense entry.",
    },
    "P2M_NOT_CONFIRMED": {
        "name": "UPI merchant payment — account debited, confirmation not received at merchant",
        "source": f"{TAT_CIRCULAR}, row 4(b)",
        "text": "Auto-reversal within T + 5 days. ₹100/- per day if delay is beyond T + 5 days. "
                "Compensation is credited suo moto, without waiting for a claim.",
        "tat_days": 5,
        "remedy": "Refund the stuck debit well before T+5 so no compensation accrues; recover via UDIR chargeback.",
    },
    "DUPLICATE_DEBIT": {
        "name": "Duplicate debit — same merchant charged twice for one order",
        "source": "NPCI UDIR dispute handling (not a failed transaction under the TAT annex)",
        "text": "Both payments succeeded, so TAT compensation does not apply. The remitter bank raises a refund request on the "
                "payment that is not the payment of record; the acquirer refunds it to the customer.",
        "tat_days": None,
        "remedy": "Raise UDIR duplicate-refund request on the unmatched UTR.",
    },
    "AUTHORISED_FRAUD": {
        "name": "Authorised push-payment fraud (collect-request / social-engineering scam)",
        "source": "Bank fraud-response procedure · National Cybercrime Reporting Portal (cybercrime.gov.in, helpline 1930)",
        "text": "The customer authorised the payment with their UPI PIN, so it is not a system failure and no TAT compensation applies. "
                "The bank must act immediately: request a lien on the beneficiary account to stop the money moving on, "
                "report to the National Cybercrime Reporting Portal, and block the payee for the customer.",
        "tat_days": None,
        "remedy": "Lien on beneficiary funds, NCRP report, UDIR fraud report, block payee VPA. Human sign-off required.",
    },
    "CREDIT_CONFIRMED": {
        "name": "Payment succeeded — beneficiary bank confirms credit",
        "source": "NPCI transaction status + beneficiary bank credit confirmation",
        "text": "No failure occurred. Share the beneficiary bank's credit reference and timestamp with the customer.",
        "tat_days": None,
        "remedy": "Close with proof of credit.",
    },
}


def tat_position(case_type: str, initiated_at: str, reversal_at: str | None, now: datetime) -> dict:
    """Where this case stands against its RBI deadline: time left, or days late and compensation owed."""
    rule = RULEBOOK[case_type]
    if rule["tat_days"] is None:
        return {"applies": False, "reason": f"{rule['name']}: not covered by the TAT annex", "compensation_paise": 0, "days_late": 0}
    t = datetime.fromisoformat(initiated_at).astimezone(IST)
    deadline = datetime.combine(t.date() + timedelta(days=rule["tat_days"]), time(23, 59, 59), IST)
    end = datetime.fromisoformat(reversal_at).astimezone(IST) if reversal_at else now
    days_late = max(0, (end.date() - deadline.date()).days)
    return {
        "applies": True,
        "T": t.date().isoformat(),
        "tat": f"T+{rule['tat_days']}",
        "deadline_at": deadline.isoformat(timespec="seconds"),
        "seconds_left": int((deadline - now).total_seconds()),
        "reversed": bool(reversal_at),
        "days_late": days_late,
        "compensation_paise": days_late * COMPENSATION_PER_DAY_PAISE,
        "breached": days_late > 0,
    }


def human_left(seconds: int) -> str:
    if seconds <= 0:
        return "deadline passed"
    d, rem = divmod(seconds, 86400)
    h, rem = divmod(rem, 3600)
    m = rem // 60
    return (f"{d}d {h}h" if d else f"{h}h {m}m") + " left"


RISK_FACTORS = [
    ("payee_ncrp_reports", "Payee reported on NCRP ≥3 times", 35, lambda s: s["payee_ncrp_reports"] >= 3),
    ("payee_new_account", "Payee account under 7 days old", 20, lambda s: s["payee_account_age_days"] < 7),
    ("payee_min_kyc", "Payee on minimum KYC", 10, lambda s: s["payee_kyc"] != "FULL_KYC"),
    ("payee_fan_in", "Payee received from ≥10 remitters in 48h", 15, lambda s: s["payee_inward_remitters_48h"] >= 10),
    ("collect_request", "Collect (pull) request approved by customer", 10, lambda s: s["mode"] == "COLLECT"),
    ("new_device", "Customer device bound <24h before payment", 10, lambda s: s["device_age_hours"] < 24),
    ("repeat_disputer", "Customer raised ≥3 disputes in 90 days", 10, lambda s: s["disputes_90d"] >= 3),
]


def risk_score(signals: dict) -> dict:
    factors = [{"id": fid, "label": label, "points": pts, "hit": bool(test(signals))} for fid, label, pts, test in RISK_FACTORS]
    score = min(100, sum(f["points"] for f in factors if f["hit"]))
    band = "HIGH" if score >= 60 else "MEDIUM" if score >= 30 else "LOW"
    return {"score": score, "band": band, "factors": factors}
