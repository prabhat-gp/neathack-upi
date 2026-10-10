"""Finance API for cfo.ai (OpenAPI connector, bearer token).

Read-only numbers cfo.ai's agent uses to build DisputePro's business plan: unit economics measured from real
agent runs (time, model tokens, party calls, human touches, deadlines met, penalty paid) plus the sourced
market facts and RBI penalty rule the pricing is based on. Nothing here is estimated by us.
"""

import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import config
import ledger

router = APIRouter(prefix="/api/finance")
_bearer = HTTPBearer(auto_error=False)

MARKET = {
    "upi_transactions_per_month": {"value": 24_070_000_000, "period": "Sep 2026",
                                   "source": "https://startuptalky.com/upi-transactions-september-2026/"},
    "rbi_ombudsman_complaints_fy25": {"value": 1_334_000, "growth_pct": 13.55,
                                      "source": "https://website.rbi.org.in/web/rbi/-/publications/annual-report-of-ombudsman-scheme-2024-25"},
    "penalty_rule": {"inr_per_day_after_deadline": 100, "p2p_deadline": "T+1", "p2m_deadline": "T+5",
                     "source": "https://rbi.org.in/commonman/English/scripts/Notification.aspx?Id=3074"},
    "late_chargeback_rule": {"effect": "chargebacks auto-accepted against banks that miss the return deadline",
                             "source": "https://npci.org.in/PDF/npci/upi/circular/2025/UPI-OC-No-213-FY-2024-25-Auto-Acceptance-Rejection-of-Chargeback.pdf"},
}


def _auth(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> None:
    if not config.FINANCE_API_TOKEN:
        raise HTTPException(503, "Finance API is not configured")
    if not creds or not secrets.compare_digest(creds.credentials, config.FINANCE_API_TOKEN):
        raise HTTPException(401, "Invalid bearer token")


@router.get("/unit-economics", dependencies=[Depends(_auth)], operation_id="getUnitEconomics",
            summary="Measured unit economics of the AI exception desk")
def unit_economics():
    """Per-case averages and totals across all recorded runs. `ai_*` fields cover runs made by the AI agents only.
    Model usage is billed through a flat ChatGPT subscription, so tokens are reported instead of a per-token cost."""
    s = ledger.summary()
    return {
        "measured": s,
        "ai_runtime": {"model": config.model_name(), "runtime": config.brain_label(),
                       "billing": "flat ChatGPT plan subscription (tokens reported, no per-token charge)"},
        "market": MARKET,
    }


@router.get("/runs", dependencies=[Depends(_auth)], operation_id="listRuns", summary="Recent agent runs")
def runs(limit: int = Query(50, ge=1, le=500)):
    """One row per resolved case: type, outcome, seconds, tokens, party calls, human touches, deadline and penalty."""
    return {"runs": ledger.runs(limit)}


@router.get("/market", dependencies=[Depends(_auth)], operation_id="getMarket", summary="Sourced market facts")
def market():
    return MARKET


@router.get("/openapi.json", include_in_schema=False)
def spec(request: Request):
    """OpenAPI spec for just these endpoints, with this server's public URL, for cfo.ai's 'Add API' form."""
    from fastapi.openapi.utils import get_openapi

    base = config.PUBLIC_BASE_URL or str(request.base_url).rstrip("/")
    doc = get_openapi(title="DisputePro Finance API", version="1.0.0", routes=router.routes,
                      description="Measured unit economics of DisputePro's AI UPI exception desk, for business planning.")
    doc["servers"] = [{"url": base}]
    doc["components"] = {**doc.get("components", {}), "securitySchemes": {"bearer": {"type": "http", "scheme": "bearer"}}}
    doc["security"] = [{"bearer": []}]
    return doc
