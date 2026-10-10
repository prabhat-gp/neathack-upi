"""Run ledger: one row per finished agent run. Survives sandbox resets; feeds the DisputePro MCP server."""

import json
import os
import sqlite3
from datetime import datetime

from engine.rules import IST

PATH = os.environ.get("LEDGER_PATH") or os.path.join(os.path.dirname(__file__), "ledger.db")

SCHEMA = """CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY, finished_at TEXT, case_id TEXT, case_type TEXT, status TEXT, headline TEXT,
  brain TEXT, model TEXT, seconds REAL, input_tokens INTEGER, output_tokens INTEGER, llm_calls INTEGER, cost_usd REAL,
  api_calls INTEGER, parties TEXT, human_touches INTEGER, amount_paise INTEGER, penalty_paid_paise INTEGER,
  refunded_paise INTEGER, frozen_paise INTEGER, deadline_met INTEGER, seconds_to_spare INTEGER)"""


def _db():
    con = sqlite3.connect(PATH)
    con.row_factory = sqlite3.Row
    con.execute(SCHEMA)
    return con


def record(run, outcome: dict, model: str | None) -> None:
    usage = list(run.usage.values())
    ops = outcome.get("ops") or {}
    dl = outcome.get("deadline") or {}
    row = {
        "run_id": run.id, "finished_at": datetime.now(IST).isoformat(timespec="seconds"),
        "case_id": run.case.get("id"), "case_type": (run.facts.get("findings") or {}).get("case_type"),
        "status": outcome.get("status"), "headline": outcome.get("headline"), "brain": run.brain, "model": model,
        "seconds": round(run.ms() / 1000, 1),
        "input_tokens": sum(u["input_tokens"] for u in usage), "output_tokens": sum(u["output_tokens"] for u in usage),
        "llm_calls": sum(u["llm_calls"] for u in usage), "cost_usd": round(run.cost_usd, 5),
        "api_calls": len(run.calls), "parties": json.dumps(sorted(set(run.calls))), "human_touches": ops.get("human_touches", 0),
        "amount_paise": run.case.get("amount_paise", 0), "penalty_paid_paise": outcome.get("penalty_paid_paise", 0),
        "refunded_paise": outcome.get("refunded_paise", 0), "frozen_paise": outcome.get("frozen_paise", 0),
        "deadline_met": int(bool(dl.get("met"))) if dl else None, "seconds_to_spare": dl.get("seconds_left") if dl else None,
    }
    with _db() as con:
        con.execute(f"INSERT OR REPLACE INTO runs ({','.join(row)}) VALUES ({','.join('?' * len(row))})", list(row.values()))


def runs(limit: int = 50, brain: str | None = None) -> list[dict]:
    sql = "SELECT * FROM runs" + (" WHERE brain=?" if brain else "") + " ORDER BY finished_at DESC LIMIT ?"
    with _db() as con:
        return [dict(r) for r in con.execute(sql, ([brain] if brain else []) + [limit])]


def summary(brain: str | None = None) -> dict:
    rows = runs(10_000, brain)
    llm = [r for r in rows if r["brain"] != "rules"]
    with_deadline = [r for r in rows if r["deadline_met"] is not None]
    n = len(rows)
    return {
        "runs": n,
        "llm_runs": len(llm),
        "resolved_or_actioned": sum(r["status"] in ("RESOLVED", "ACTIONED", "CLOSED") for r in rows),
        "held_for_approval": sum(r["status"] == "AWAITING_APPROVAL" for r in rows),
        "escalated": sum(r["status"] == "ESCALATED" for r in rows),
        "deadline_cases": len(with_deadline),
        "deadlines_met": sum(r["deadline_met"] for r in with_deadline),
        "penalty_paid_inr": sum(r["penalty_paid_paise"] for r in rows) / 100,
        "refunded_inr": sum(r["refunded_paise"] for r in rows) / 100,
        "frozen_for_fraud_victims_inr": sum(r["frozen_paise"] for r in rows) / 100,
        "avg_seconds_per_case": round(sum(r["seconds"] for r in rows) / n, 1) if n else None,
        "avg_party_calls_per_case": round(sum(r["api_calls"] for r in rows) / n, 1) if n else None,
        "llm_cost_usd_total": round(sum(r["cost_usd"] or 0 for r in llm), 4),
        "llm_cost_usd_per_case": round(sum(r["cost_usd"] or 0 for r in llm) / len(llm), 4) if llm else None,
        "tokens_per_case": round(sum(r["input_tokens"] + r["output_tokens"] for r in llm) / len(llm)) if llm else None,
        "human_touches_per_case": round(sum(r["human_touches"] for r in rows) / n, 2) if n else None,
    }
