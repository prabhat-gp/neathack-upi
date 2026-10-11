"""DisputePro MCP server (Streamable HTTP at /mcp).

Lets cfo.ai, Claude Code or any MCP client read live desk numbers: open exceptions, run history and
unit economics measured from real agent runs (tokens, provider-reported cost, time, deadlines met).
"""

import secrets

from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings

import config
import ledger
from desk import store

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


server = MCPServer(
    name="disputepro",
    instructions="DisputePro clears UPI payment exceptions before RBI deadlines. All numbers come from recorded agent runs.",
)


@server.tool()
def desk_metrics() -> dict:
    """Unit economics and outcomes across recorded runs: runs, deadlines met, penalty paid (INR), refunds,
    amounts frozen for fraud victims, average seconds and party calls per case, LLM cost and tokens per case
    (llm_* fields cover runs made by the Claude agents only)."""
    return {**ledger.summary(), "agent_model": config.model_name()}


@server.tool()
def recent_runs(limit: int = 20) -> list[dict]:
    """Most recent agent runs with case type, outcome, seconds, tokens, cost and deadline position."""
    return ledger.runs(min(max(limit, 1), 200))


@server.tool()
def market_facts() -> dict:
    """Sourced market facts and the RBI/NPCI penalty rules DisputePro prices against (each with its source URL)."""
    return MARKET


@server.tool()
def open_exceptions() -> list[dict]:
    """Cases on the desk right now: channel, status, amount in INR, RBI turnaround and deadline."""
    return [{"id": c["id"], "channel": c["channel"], "status": c["status"], "utr": c["utr"], "tat_days": c.get("tat_days"),
             "deadline_at": c.get("deadline_at"), "amount_inr": (c.get("amount_paise") or 0) / 100, "headline": c.get("headline")}
            for c in store.list_cases()]


def http_app():
    """The MCP app, behind a bearer token (MCP_API_TOKEN) so only cfo.ai / our own clients can read desk numbers."""
    inner = server.streamable_http_app(
        streamable_http_path="/", stateless_http=True, json_response=True,
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    )

    async def app(scope, receive, send):
        if scope["type"] == "http":
            auth = dict(scope.get("headers") or []).get(b"authorization", b"").decode()
            if not config.MCP_API_TOKEN or not secrets.compare_digest(auth, f"Bearer {config.MCP_API_TOKEN}"):
                await send({"type": "http.response.start", "status": 401, "headers": [(b"content-type", b"application/json")]})
                await send({"type": "http.response.body", "body": b'{"error":"bearer token required"}'})
                return
        await inner(scope, receive, send)

    app.router = inner.router  # lifespan/session manager still come from the inner app
    return app


@server.tool()
async def research_target_companies(domains: list[str]) -> dict:
    """Research 1–10 company website domains using live Crustdata Identify for the business plan.
    Returns candidate company matches with provenance. Not a fraud check, customer list or sales forecast.
    Never supply customer emails, UPI addresses or fictional merchants."""
    from integrations.crustdata import identify_companies
    return await identify_companies(domains)
