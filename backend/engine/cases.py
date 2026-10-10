"""The exceptions queue: five situations where banks lose money or pay penalties, each tied to sandbox records."""

from datetime import datetime, timedelta

from .rules import IST


def build_cases() -> list[dict]:
    yesterday = (datetime.now(IST) - timedelta(days=1)).date().isoformat()
    return [
        {
            "id": "deemed-outward", "tat_days": 1,
            "title": "Deemed payment, no credit confirmation",
            "subtitle": "₹5,000 to Kaveri Bank timed out last night",
            "trigger": "sweep", "settlement_date": yesterday,
            "role": "Remitter bank", "rule": "RBI 4(a) · T+1",
            "customer_id": "rahul", "customer_name": "Rahul Mehta", "utr": "610045218871", "amount_paise": 500000,
            "complaint": "",
        },
        {
            "id": "inward-suspense", "tat_days": 1,
            "title": "Inward credit stuck in our suspense",
            "subtitle": "₹8,000 arrived for an account we closed",
            "trigger": "sweep", "settlement_date": yesterday,
            "role": "Beneficiary bank", "rule": "RBI 4(a) · T+1",
            "customer_id": "imran", "customer_name": "Imran Shaikh", "utr": "610045224416", "amount_paise": 800000,
            "complaint": "",
        },
        {
            "id": "merchant-deemed", "tat_days": 5,
            "title": "Shop never got confirmation",
            "subtitle": "Customer paid ₹2,340 twice at the till",
            "trigger": "complaint",
            "role": "Remitter bank", "rule": "RBI 4(b) · T+5",
            "customer_id": "ananya", "customer_name": "Ananya Iyer", "utr": "610045219904", "amount_paise": 234000,
            "complaint": "Paid ₹2,340 at Annapurna Supermart. The machine said failed so I paid again. Now ₹4,680 is gone from my account.",
        },
        {
            "id": "not-received", "tat_days": None,
            "title": "“Recipient says not received”",
            "subtitle": "₹12,000 rent, landlord disputes it",
            "trigger": "complaint",
            "role": "Remitter bank", "rule": "Proof of credit",
            "customer_id": "vikram", "customer_name": "Vikram Singh", "utr": "610045222040", "amount_paise": 1200000,
            "complaint": "Paid ₹12,000 rent to my landlord 3 days ago. He says he hasn't received it. Please refund or check.",
        },
        {
            "id": "collect-fraud", "tat_days": None,
            "title": "Collect-request scam",
            "subtitle": "₹49,999 approved to a fake ‘KYC’ desk",
            "trigger": "complaint",
            "role": "Remitter bank", "rule": "Fraud · NCRP",
            "customer_id": "sunita", "customer_name": "Sunita Rao", "utr": "610045221587", "amount_paise": 4999900,
            "complaint": "A man said he was from the bank's KYC team and my account would be blocked. I approved a request and entered my PIN. ₹49,999 is gone.",
        },
        {
            "id": "bene-outage", "tat_days": 1,
            "title": "Other bank's API is down",
            "subtitle": "₹3,500 stuck, Kaveri Bank not answering",
            "trigger": "complaint",
            "role": "Remitter bank", "rule": "RBI 4(a) · T+1",
            "customer_id": "neha", "customer_name": "Neha Kapoor", "utr": "610045225530", "amount_paise": 350000,
            "complaint": "Sent ₹3,500 to Priya last night for the trip. App says pending, money is cut from my account, she got nothing.",
        },
    ]


def by_id(case_id: str) -> dict | None:
    return next((c for c in build_cases() if c["id"] == case_id), None)
