"""DisputePro MCP server (Streamable HTTP at /mcp).

Lets cfo.ai, Claude Code or any MCP client read live desk numbers: open exceptions, run history and
unit economics measured from real agent runs (tokens, provider-reported cost, time, deadlines met).
"""

from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings

import config
import ledger
from engine.cases import build_cases

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
def open_exceptions() -> list[dict]:
    """UPI exceptions currently on the desk with their RBI turnaround (T+1 / T+5) and amount in INR."""
    return [{"id": c["id"], "title": c["title"], "trigger": c["trigger"], "tat_days": c.get("tat_days"),
             "amount_inr": c["amount_paise"] / 100, "utr": c["utr"]} for c in build_cases()]


def http_app():
    return server.streamable_http_app(
        streamable_http_path="/", stateless_http=True, json_response=True,
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    )
