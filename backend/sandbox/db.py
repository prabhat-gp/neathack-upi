"""SQLite state for the sandboxed counterparties of a UPI dispute.

Table prefixes are parties: cbs_ (Sahyadri Bank core banking, incl. UPI suspense), npci_ (UPI switch, UDIR,
settlement raw data), bene_ (other banks), acq_ (merchant acquirer), ncrp_ (cybercrime portal).
Seed timestamps are relative to "now" at reset, so every scene opens with its RBI deadline still ahead.
"""

import os
import sqlite3
import threading

from .population import populate
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
OUR_BANK = "Sahyadri Bank"
DB_PATH = os.environ.get("SANDBOX_DB", os.path.join(os.path.dirname(__file__), "..", "sandbox.db"))

_lock = threading.RLock()
_conn: sqlite3.Connection | None = None

SCHEMA = """
CREATE TABLE cbs_customers (
  id TEXT PRIMARY KEY, name TEXT, account_no TEXT UNIQUE, vpa TEXT UNIQUE, balance_paise INTEGER, status TEXT,
  status_since TEXT, account_opened TEXT, device_bound_at TEXT, disputes_90d INTEGER, phone TEXT
);
CREATE TABLE cbs_transactions (
  utr TEXT PRIMARY KEY, account_no TEXT, direction TEXT, amount_paise INTEGER, counterparty_vpa TEXT,
  counterparty_name TEXT, kind TEXT, mode TEXT, initiated_at TEXT, status TEXT, narration TEXT
);
CREATE TABLE cbs_inward (
  utr TEXT PRIMARY KEY, account_no TEXT, amount_paise INTEGER, remitter_vpa TEXT, remitter_name TEXT, remitter_bank TEXT,
  received_at TEXT, credit_status TEXT, failure_reason TEXT, suspense_id TEXT
);
CREATE TABLE cbs_suspense (
  id TEXT PRIMARY KEY, utr TEXT, amount_paise INTEGER, reason TEXT, status TEXT, opened_at TEXT, cleared_at TEXT
);
CREATE TABLE cbs_postings (
  id TEXT PRIMARY KEY, account_no TEXT, utr_ref TEXT, type TEXT, amount_paise INTEGER, narration TEXT,
  posted_at TEXT, idempotency_key TEXT UNIQUE
);
CREATE TABLE cbs_vpa_blocks (customer_id TEXT, vpa TEXT, created_at TEXT, PRIMARY KEY (customer_id, vpa));

CREATE TABLE npci_transactions (
  utr TEXT PRIMARY KEY, rrn TEXT, payer_vpa TEXT, payee_vpa TEXT, amount_paise INTEGER, initiated_at TEXT,
  txn_type TEXT, remitter_bank TEXT, beneficiary_bank TEXT,
  debit_leg TEXT, credit_leg TEXT, credit_leg_reason TEXT, tcc TEXT, reversal_leg TEXT, reversal_at TEXT, overall TEXT
);
CREATE TABLE npci_complaints (
  id TEXT PRIMARY KEY, utr TEXT, type TEXT, amount_paise INTEGER, remarks TEXT, raised_by TEXT, status TEXT,
  resolution TEXT, created_at TEXT
);

CREATE TABLE bene_accounts (
  vpa TEXT PRIMARY KEY, bank TEXT, holder_name TEXT, account_type TEXT, opened_at TEXT, kyc TEXT,
  available_paise INTEGER, lien_paise INTEGER, inward_remitters_48h INTEGER
);
CREATE TABLE bene_credits (
  utr TEXT PRIMARY KEY, vpa TEXT, amount_paise INTEGER, status TEXT, credited_at TEXT, credit_ref TEXT
);
CREATE TABLE bene_liens (id TEXT PRIMARY KEY, vpa TEXT, utr TEXT, requested_paise INTEGER, marked_paise INTEGER, created_at TEXT);

CREATE TABLE acq_merchants (vpa TEXT PRIMARY KEY, name TEXT, acquirer TEXT, mcc TEXT);
CREATE TABLE acq_orders (
  order_id TEXT PRIMARY KEY, merchant_vpa TEXT, amount_paise INTEGER, status TEXT, paid_utr TEXT,
  attempted_utrs TEXT, created_at TEXT
);
CREATE TABLE acq_refunds (id TEXT PRIMARY KEY, utr TEXT, amount_paise INTEGER, status TEXT, created_at TEXT);

CREATE TABLE ncrp_reports (ack_no TEXT PRIMARY KEY, vpa TEXT, utr TEXT, amount_paise INTEGER, reported_by TEXT, created_at TEXT);
-- Live incidents on a counterparty: the next `remaining` calls for this key fail with `status`.
CREATE TABLE sandbox_faults (party TEXT, key TEXT, remaining INTEGER, status INTEGER, message TEXT, PRIMARY KEY (party, key));

-- DisputePro's own state: the case queue fed by channels, and the conversation with each customer.
CREATE TABLE desk_cases (
  id TEXT PRIMARY KEY, channel TEXT, customer_id TEXT, utr TEXT, message TEXT, status TEXT, created_at TEXT, updated_at TEXT,
  run_id TEXT, headline TEXT, outcome TEXT
);
CREATE TABLE desk_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id TEXT, case_id TEXT, sender TEXT, channel TEXT, text TEXT, created_at TEXT
);
"""


def conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None)
        _conn.row_factory = sqlite3.Row
        ok = _conn.execute("SELECT name FROM sqlite_master WHERE name='cbs_suspense'").fetchone()
        if not ok:
            reset()
    return _conn


def q(sql: str, *args) -> list[dict]:
    with _lock:
        return [dict(r) for r in conn().execute(sql, args).fetchall()]


def q1(sql: str, *args) -> dict | None:
    rows = q(sql, *args)
    return rows[0] if rows else None


def ex(sql: str, *args) -> None:
    if len(args) == 1 and isinstance(args[0], tuple):
        args = args[0]
    with _lock:
        conn().execute(sql, args)


def now() -> datetime:
    return datetime.now(IST)


def iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


def reset() -> None:
    global _conn
    with _lock:
        if _conn is None:
            _conn = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None)
            _conn.row_factory = sqlite3.Row
        c = _conn
        for (name,) in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall():
            c.execute(f"DROP TABLE {name}")
        c.executescript(SCHEMA)
        _seed(c, now())


def _at(base: datetime, days: float, hh: int, mm: int, ss: int = 0) -> datetime:
    return (base - timedelta(days=days)).replace(hour=hh, minute=mm, second=ss, microsecond=0)


def _seed(c: sqlite3.Connection, n: datetime) -> None:
    customers = [
        # id, name, account, vpa, balance, status, opened_days_ago, device_days_ago, disputes_90d
        ("rahul", "Rahul Mehta", "SAHY00012345", "rahul.mehta@sahyadri", 4823000, "ACTIVE", 1600, 900, 0, "+91 98201 44518"),
        ("imran", "Imran Shaikh", "SAHY00067890", "imran.s@sahyadri", 0, "CLOSED", 1200, 600, 0, "+91 99670 21983"),
        ("ananya", "Ananya Iyer", "SAHY00023456", "ananya.iyer@sahyadri", 1265000, "ACTIVE", 2200, 400, 0, "+91 98450 77310"),
        ("vikram", "Vikram Singh", "SAHY00056789", "vikram.singh@sahyadri", 6710000, "ACTIVE", 1300, 1100, 0, "+91 98111 20402"),
        ("sunita", "Sunita Rao", "SAHY00045678", "sunita.rao@sahyadri", 15240000, "ACTIVE", 5100, 700, 0, "+91 94480 15872"),
        ("neha", "Neha Kapoor", "SAHY00078901", "neha.kapoor@sahyadri", 2210000, "ACTIVE", 900, 300, 0, "+91 98330 25530"),
    ]
    for cid, name, acct, vpa, bal, status, opened, device, disputes, phone in customers:
        since = iso(n - timedelta(days=12)) if status == "CLOSED" else iso(n - timedelta(days=opened))
        c.execute("INSERT INTO cbs_customers VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                  (cid, name, acct, vpa, bal, status, since, iso(n - timedelta(days=opened)), iso(n - timedelta(days=device)), disputes, phone))

    bene = [
        ("amit.k@kaveri", "Kaveri Bank", "Amit Kulkarni", "SAVINGS", 2300, "FULL_KYC", 1834000, 3),
        ("priya.m@kaveri", "Kaveri Bank", "Priya Mehta", "SAVINGS", 1900, "FULL_KYC", 912000, 2),
        ("meera.joshi@kaveri", "Kaveri Bank", "Meera Joshi", "SAVINGS", 2700, "FULL_KYC", 3410000, 1),
        ("sharma.rentals@kaveri", "Kaveri Bank", "R. K. Sharma", "SAVINGS", 4100, "FULL_KYC", 22410000, 4),
        ("kyc.update.help@kaveri", "Kaveri Bank", "Rakesh Kumar", "SAVINGS", 2, "MIN_KYC", 3120000, 14),
        ("annapurna.mart@narmada", "Narmada Bank", "Annapurna Supermart", "CURRENT", 3000, "FULL_KYC", 50000000, 0),
        ("chai.point@narmada", "Narmada Bank", "Chai Point Andheri", "CURRENT", 2600, "FULL_KYC", 4300000, 0),
        ("metro.recharge@narmada", "Narmada Bank", "Mumbai Metro Card", "CURRENT", 3600, "FULL_KYC", 99000000, 0),
    ]
    for vpa, bank, holder, typ, age, kyc, avail, inward in bene:
        c.execute("INSERT INTO bene_accounts VALUES (?,?,?,?,?,?,?,?,?)",
                  (vpa, bank, holder, typ, iso(n - timedelta(days=age)), kyc, avail, 0, inward))
    for vpa, name, mcc in [("annapurna.mart@narmada", "Annapurna Supermart", "5411"), ("chai.point@narmada", "Chai Point Andheri", "5814"),
                           ("metro.recharge@narmada", "Mumbai Metro Card", "4111")]:
        c.execute("INSERT INTO acq_merchants VALUES (?,?,?,?)", (vpa, name, "Narmada Bank", mcc))

    acct = {cid: a for cid, _, a, *_ in customers}
    vpa_of = {cid: v for cid, _, _, v, *_ in customers}
    names = {v: h for v, _, h, *_ in bene}
    merchants = {"annapurna.mart@narmada", "chai.point@narmada", "metro.recharge@narmada"}

    def outward(cid, utr, amount, payee, when, mode="PUSH", credit="SUCCESS", reason=None, overall="SUCCESS", narration=""):
        kind = "P2M" if payee in merchants else "P2P"
        bank = "Narmada Bank" if payee.endswith("@narmada") else "Kaveri Bank"
        credited = credit == "SUCCESS"
        c.execute("INSERT INTO cbs_transactions VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                  (utr, acct[cid], "DEBIT", amount, payee, names[payee], kind, mode, iso(when), "POSTED", narration))
        c.execute("INSERT INTO npci_transactions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                  (utr, "RRN" + utr[-9:], vpa_of[cid], payee, amount, iso(when), kind, OUR_BANK, bank,
                   "SUCCESS", credit, reason, "TCC" if credited else None, "NOT_INITIATED", None, overall))
        c.execute("INSERT INTO bene_credits VALUES (?,?,?,?,?,?)",
                  (utr, payee, amount, "CREDITED" if credited else "NOT_CREDITED",
                   iso(when + timedelta(seconds=3)) if credited else None, ("CR" + utr[-8:]) if credited else None))

    # Routine history.
    outward("rahul", "610045210011", 18000, "chai.point@narmada", _at(n, 6, 8, 40), narration="Chai Point")
    outward("rahul", "610045210019", 150000, "priya.m@kaveri", _at(n, 4, 21, 5), narration="Dinner split")
    outward("ananya", "610045211020", 50000, "metro.recharge@narmada", _at(n, 7, 9, 2), narration="Metro card")
    outward("sunita", "610045213042", 320000, "annapurna.mart@narmada", _at(n, 6, 11, 15), narration="Groceries")
    outward("vikram", "610045214053", 60000, "metro.recharge@narmada", _at(n, 9, 8, 12), narration="Metro card")

    # Scene 1 · outward P2P deemed: Kaveri Bank timed out, no credit confirmation, no return. T+1 = today 23:59.
    outward("rahul", "610045218871", 500000, "amit.k@kaveri", _at(n, 1, 19, 42), credit="DEEMED",
            reason="Kaveri Bank did not respond within switch timeout; marked deemed approved", overall="DEEMED", narration="To Amit")

    # Scene 2 · inward credit to our CLOSED account: response timed out, money parked in our UPI suspense. We owe the return by T+1.
    t2 = _at(n, 1, 21, 15)
    c.execute("INSERT INTO npci_transactions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
              ("610045224416", "RRN045224416", "meera.joshi@kaveri", "imran.s@sahyadri", 800000, iso(t2), "P2P", "Kaveri Bank", OUR_BANK,
               "SUCCESS", "DEEMED", "Sahyadri Bank response timeout; marked deemed approved", None, "NOT_INITIATED", None, "DEEMED"))
    c.execute("INSERT INTO cbs_suspense VALUES (?,?,?,?,?,?,?)",
              ("SUSP-UPI-88213", "610045224416", 800000, "Inward UPI credit failed: beneficiary account closed", "OPEN", iso(t2 + timedelta(seconds=2)), None))
    c.execute("INSERT INTO cbs_inward VALUES (?,?,?,?,?,?,?,?,?,?)",
              ("610045224416", acct["imran"], 800000, "meera.joshi@kaveri", "Meera Joshi", "Kaveri Bank", iso(t2),
               "FAILED", "Account closed", "SUSP-UPI-88213"))

    # Scene 3 · P2M deemed: shop never got confirmation, customer paid again 3 min later. T+5 still days away.
    p1, p2 = _at(n, 2, 18, 10, 12), _at(n, 2, 18, 13, 40)
    outward("ananya", "610045219904", 234000, "annapurna.mart@narmada", p1, credit="DEEMED",
            reason="Credit response not received from Narmada Bank; marked deemed approved", overall="DEEMED", narration="Annapurna Supermart")
    outward("ananya", "610045219911", 234000, "annapurna.mart@narmada", p2, narration="Annapurna Supermart")
    c.execute("INSERT INTO acq_orders VALUES (?,?,?,?,?,?,?)",
              ("ANP-77310", "annapurna.mart@narmada", 234000, "PAID", "610045219911", "610045219904,610045219911", iso(p1)))

    # Scene 4 · "landlord says not received": credited in 3 seconds.
    outward("vikram", "610045222040", 1200000, "sharma.rentals@kaveri", _at(n, 3, 10, 5), narration="October rent")

    # Scene 5 · authorised push-payment fraud: collect request approved 5 hours ago, payee is a 2-day-old mule.
    outward("sunita", "610045221587", 4999900, "kyc.update.help@kaveri", n - timedelta(hours=5), mode="COLLECT", narration="KYC update")
    for i in range(9):
        c.execute("INSERT INTO ncrp_reports VALUES (?,?,?,?,?,?)",
                  (f"NCRP-31{i:05d}", "kyc.update.help@kaveri", None, 1500000 + i * 230000, "other victim",
                   iso(n - timedelta(hours=40 - i * 4))))

    # Scene 6 · outage: ₹3,500 deemed last night AND Kaveri Bank's credit-confirmation API is down (gateway timeouts).
    outward("neha", "610045225530", 350000, "priya.m@kaveri", _at(n, 1, 22, 5), credit="DEEMED",
            reason="Kaveri Bank did not respond within switch timeout; marked deemed approved", overall="DEEMED", narration="To Priya")
    c.execute("INSERT INTO sandbox_faults VALUES (?,?,?,?,?)",
              ("bene", "610045225530", 3, 504, "Kaveri Bank CBS gateway timeout (upstream did not respond in 15s)"))

    populate(c, n, iso, OUR_BANK)
    customers = [(r[0], None, r[1]) for r in c.execute("SELECT id, account_no FROM cbs_customers").fetchall()]
    for cid, _, a, *_ in customers:
        spent = c.execute("SELECT COALESCE(SUM(amount_paise),0) FROM cbs_transactions WHERE account_no=?", (a,)).fetchone()[0]
        c.execute("UPDATE cbs_customers SET balance_paise = MAX(0, balance_paise - ?) WHERE id=?", (spent, cid))
