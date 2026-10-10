"""The rest of Sahyadri Bank: ~35 more customers and a week of ordinary UPI traffic around the six story customers.

Most payments simply succeed. A few fail the way real ones do (deemed with no credit confirmation, auto-reversed,
inward credit to a closed account, a collect-request mule), so the reconciliation sweep and customer complaints
find exceptions in the data instead of in a hand-written list. Seeded RNG: every reset produces the same bank,
with timestamps relative to now.
"""

import random
import sqlite3
from datetime import datetime, timedelta

FIRST = ["Aarav", "Diya", "Kabir", "Meera", "Rohan", "Isha", "Arjun", "Pooja", "Siddharth", "Kavya", "Nikhil", "Sneha", "Aditya",
         "Ritu", "Manish", "Tanvi", "Harsh", "Divya", "Karan", "Anjali", "Varun", "Nisha", "Rajesh", "Lakshmi", "Faisal", "Zoya",
         "Gaurav", "Shreya", "Vivek", "Bhavna", "Suresh", "Asha", "Deepak", "Farah", "Omkar"]
LAST = ["Sharma", "Patil", "Nair", "Reddy", "Gupta", "Joshi", "Menon", "Kulkarni", "Das", "Bose", "Khan", "Pillai", "Verma",
        "Deshmukh", "Chopra", "Shetty", "Iyer", "Banerjee", "Malhotra", "Rao"]
PAYEES = ["Ramesh Yadav", "Sunil Pawar", "Anita Desai", "Mohit Jain", "Priyanka Roy", "Ajay Thakur", "Rekha Naidu", "Sameer Ali",
          "Kiran More", "Neeta Saxena", "Arvind Kumar", "Geeta Bhatt", "Pradeep Sinha", "Usha Kamath", "Vijay Hegde", "Swati Mishra"]
MERCHANTS = [("udupi.grand@narmada", "Udupi Grand Restaurant", "5812"), ("medplus.kothrud@narmada", "Metro Pharmacy Kothrud", "5912"),
             ("msedcl.bill@narmada", "City Electricity Board", "4900"), ("quickmart.baner@narmada", "QuickMart Baner", "5411"),
             ("fuelpoint.aundh@narmada", "FuelPoint Aundh", "5541"), ("bookstreet@narmada", "Book Street", "5942"),
             ("cafe.mocha@narmada", "Cafe Mocha", "5814"), ("airtel.recharge@narmada", "Mobile Recharge", "4814")]
NOTES = ["Rent share", "Dinner", "Groceries", "Movie", "Trip", "Gift", "Loan return", "Cab", "Lunch", "Tuition", "Maid salary", "Gym"]


def populate(c: sqlite3.Connection, n: datetime, iso, our_bank: str) -> None:
    rng = random.Random(20261010)
    seq = iter(range(10000, 99999))

    def utr() -> str:
        return f"61004{next(seq):05d}{rng.randint(10, 99)}"

    def bank_of(vpa: str) -> str:
        return "Narmada Bank" if vpa.endswith("@narmada") else "Kaveri Bank"

    def ago(hours: float) -> datetime:
        return (n - timedelta(hours=hours)).replace(microsecond=0)

    # Counterparties at other banks
    people = []
    for i, name in enumerate(PAYEES):
        vpa = f"{name.split()[0].lower()}.{name.split()[1][0].lower()}{i}@{'kaveri' if i % 3 else 'narmada'}"
        people.append((vpa, name))
        c.execute("INSERT INTO bene_accounts VALUES (?,?,?,?,?,?,?,?,?)",
                  (vpa, bank_of(vpa), name, "SAVINGS", iso(n - timedelta(days=rng.randint(400, 4000))), "FULL_KYC",
                   rng.randint(2, 90) * 10000_00 // 10, 0, rng.randint(0, 4)))
    for vpa, name, mcc in MERCHANTS:
        c.execute("INSERT INTO bene_accounts VALUES (?,?,?,?,?,?,?,?,?)",
                  (vpa, "Narmada Bank", name, "CURRENT", iso(n - timedelta(days=rng.randint(900, 3000))), "FULL_KYC", 50_000_000, 0, 0))
        c.execute("INSERT INTO acq_merchants VALUES (?,?,?,?)", (vpa, name, "Narmada Bank", mcc))
    # A second mule: opened yesterday, already reported by other victims
    mule = ("refund.desk.support@kaveri", "Sanjay Verma")
    c.execute("INSERT INTO bene_accounts VALUES (?,?,?,?,?,?,?,?,?)",
              (mule[0], "Kaveri Bank", mule[1], "SAVINGS", iso(n - timedelta(days=1)), "MIN_KYC", 1_840_000, 0, 11))
    for i in range(5):
        c.execute("INSERT INTO ncrp_reports VALUES (?,?,?,?,?,?)",
                  (f"NCRP-42{i:05d}", mule[0], None, 900_000 + i * 150_000, "other victim", iso(ago(20 - i * 3))))

    # Our customers
    customers = []
    names = set()
    while len(customers) < 34:
        name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
        if name in names:
            continue
        names.add(name)
        k = len(customers)
        cid = name.split()[0].lower() + str(k)
        acct = f"SAHY{20000 + k * 37:08d}"
        vpa = f"{name.split()[0].lower()}.{name.split()[1].lower()}@sahyadri"
        status = "CLOSED" if k == 7 else "ACTIVE"
        opened = rng.randint(200, 4000)
        c.execute("INSERT INTO cbs_customers VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                  (cid, name, acct, vpa, rng.randint(8_000, 300_000) * 100, status,
                   iso(n - timedelta(days=9 if status == "CLOSED" else opened)), iso(n - timedelta(days=opened)),
                   iso(n - timedelta(days=rng.randint(30, 900))), rng.choice([0, 0, 0, 1]), f"+91 9{rng.randint(100000000, 999999999)}"))
        customers.append((cid, name, acct, vpa, status))

    def outward(cust, to_vpa, to_name, amount, when, credit="SUCCESS", reason=None, overall="SUCCESS", mode="PUSH",
                narration="", reversal="NOT_INITIATED", reversal_at=None):
        cid, _, acct, vpa, _ = cust
        u = utr()
        kind = "P2M" if any(m[0] == to_vpa for m in MERCHANTS) else "P2P"
        credited = credit == "SUCCESS"
        c.execute("INSERT INTO cbs_transactions VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                  (u, acct, "DEBIT", amount, to_vpa, to_name, kind, mode, iso(when), "REVERSED" if reversal == "SUCCESS" else "POSTED", narration))
        c.execute("INSERT INTO npci_transactions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                  (u, "RRN" + u[-9:], vpa, to_vpa, amount, iso(when), kind, our_bank, bank_of(to_vpa),
                   "SUCCESS", credit, reason, "TCC" if credited else None, reversal, reversal_at, overall))
        c.execute("INSERT INTO bene_credits VALUES (?,?,?,?,?,?)",
                  (u, to_vpa, amount, "CREDITED" if credited else "NOT_CREDITED",
                   iso(when + timedelta(seconds=rng.randint(2, 6))) if credited else None, ("CR" + u[-8:]) if credited else None))
        if reversal == "SUCCESS":
            c.execute("INSERT INTO cbs_postings VALUES (?,?,?,?,?,?,?,?)",
                      (f"PST-AR{u[-6:]}", acct, u, "REVERSAL", amount, "UPI auto-reversal (NPCI)", reversal_at, f"auto-rev-{u}"))
        return u

    def inward(cust, from_vpa, from_name, amount, when, failed=False):
        _, _, acct, vpa, _ = cust
        u = utr()
        susp = f"SUSP-UPI-{u[-5:]}" if failed else None
        c.execute("INSERT INTO npci_transactions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                  (u, "RRN" + u[-9:], from_vpa, vpa, amount, iso(when), "P2P", bank_of(from_vpa), our_bank, "SUCCESS",
                   "DEEMED" if failed else "SUCCESS", f"{our_bank} response timeout; marked deemed approved" if failed else None,
                   None if failed else "TCC", "NOT_INITIATED", None, "DEEMED" if failed else "SUCCESS"))
        c.execute("INSERT INTO cbs_inward VALUES (?,?,?,?,?,?,?,?,?,?)",
                  (u, acct, amount, from_vpa, from_name, bank_of(from_vpa), iso(when), "FAILED" if failed else "CREDITED",
                   "Account closed" if failed else None, susp))
        if failed:
            c.execute("INSERT INTO cbs_suspense VALUES (?,?,?,?,?,?,?)",
                      (susp, u, amount, "Inward UPI credit failed: beneficiary account closed", "OPEN", iso(when + timedelta(seconds=2)), None))
        return u

    # A normal week: transfers, shop payments, bills and incoming money
    for cust in customers:
        if cust[4] == "CLOSED":
            continue
        for _ in range(rng.randint(6, 14)):
            when = ago(rng.uniform(2, 24 * 7))
            if rng.random() < 0.45:
                m = rng.choice(MERCHANTS)
                outward(cust, m[0], m[1], rng.choice([120, 180, 249, 320, 450, 640, 899, 1240, 2100]) * 100, when, narration=m[1])
            else:
                p = rng.choice(people)
                outward(cust, p[0], p[1], rng.choice([200, 500, 750, 1000, 1500, 2000, 3000, 5000]) * 100, when, narration=rng.choice(NOTES))
        for _ in range(rng.randint(1, 3)):
            p = rng.choice(people)
            inward(cust, p[0], p[1], rng.choice([500, 1000, 2500, 4000, 12000]) * 100, ago(rng.uniform(4, 24 * 7)))

    live = [x for x in customers if x[4] == "ACTIVE"]
    by = {x[0]: x for x in customers}
    pick = live[:12]

    # Exceptions hidden in the traffic (found by the recon sweep or by the customer complaining)
    yday = lambda hh, mm: (n - timedelta(days=1)).replace(hour=hh, minute=mm, second=0, microsecond=0)  # noqa: E731
    deemed = "{b} did not respond within switch timeout; marked deemed approved"
    p = people[2]
    outward(pick[0], p[0], p[1], 200_000, yday(20, 14), credit="DEEMED", reason=deemed.format(b=bank_of(p[0])), overall="DEEMED", narration="Rent share")
    p = people[5]
    outward(pick[1], p[0], p[1], 75_000, yday(13, 2), credit="DEEMED", reason=deemed.format(b=bank_of(p[0])), overall="DEEMED", narration="Cab")
    m = MERCHANTS[2]
    outward(pick[2], m[0], m[1], 184_000, n - timedelta(days=3, hours=2), credit="DEEMED", reason=deemed.format(b="Narmada Bank"),
            overall="DEEMED", narration="Electricity bill")
    # Failed, then auto-reversed by NPCI within the hour: the customer may still complain
    p = people[8]
    outward(pick[3], p[0], p[1], 300_000, yday(11, 40), credit="FAILED", reason="Beneficiary bank declined: account frozen",
            overall="FAILED", narration="Loan return", reversal="SUCCESS", reversal_at=iso(yday(12, 10)))
    # Collect-request scam to the second mule, 3 hours ago
    outward(pick[4], mule[0], mule[1], 2_500_000, ago(3), mode="COLLECT", narration="Refund processing")
    # Inward credit to the closed account, parked in suspense
    p = people[11]
    inward(by[customers[7][0]], p[0], p[1], 450_000, yday(18, 30), failed=True)
