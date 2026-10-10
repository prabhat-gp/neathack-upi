"""DisputePro API.

/channels/*   customer channels (UPI app complaints via UDIR, chat) that open cases
/api/desk/*   the ops console: case queue, live runs, approvals, reconciliation, autopilot
/api/app/*    the customer's view of their account (for the UPI app simulator)
/sandbox/*    the bank's systems the agents work against (core banking, NPCI, other banks, acquirer, NCRP)
/mcp          DisputePro MCP server (desk numbers for cfo.ai and Claude Code)
"""

import asyncio
import contextlib

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import agent_mcp
import config
import ledger
import mcp_server
from desk import supervisor
from desk.routes import router as desk_router
from engine.parties import PARTIES
from sandbox import db
from sandbox.routes import router as sandbox_router

_mcp_app = mcp_server.http_app()


@contextlib.asynccontextmanager
async def lifespan(_app):
    loop = asyncio.create_task(supervisor.loop())  # works the case queue on its own
    async with mcp_server.server.session_manager.run():
        yield
    loop.cancel()


app = FastAPI(title="DisputePro", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(sandbox_router)
app.include_router(desk_router)
app.include_router(agent_mcp.router)  # per-agent tool endpoints the Codex agents connect to
app.mount("/mcp", _mcp_app)  # DisputePro MCP server (cfo.ai, Claude Code)


@app.get("/api/metrics")
def metrics():
    """Same numbers as the MCP desk_metrics tool, as plain JSON (the home page's live counters)."""
    return {**ledger.summary(), "agent_model": config.model_name(), "recent_runs": ledger.runs(10)}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/meta")
def meta():
    return {"brain": config.brain(), "brain_label": config.brain_label(), "model": config.model_name(), "parties": PARTIES,
            "auto_approve_limit_paise": config.AUTO_APPROVE_LIMIT_PAISE, "neatlogs": bool(config.NEATLOGS_API_KEY)}


@app.get("/api/customers/{customer_id}/transactions")
def customer_transactions(customer_id: str):
    c = db.q1("SELECT account_no FROM cbs_customers WHERE id=?", customer_id)
    if not c:
        raise HTTPException(404, "Unknown customer")
    out = db.q("SELECT utr, amount_paise, counterparty_vpa, counterparty_name, kind, mode, initiated_at, status, 'OUT' AS direction "
               "FROM cbs_transactions WHERE account_no=?", c["account_no"])
    inward = db.q("SELECT utr, amount_paise, remitter_vpa AS counterparty_vpa, remitter_name AS counterparty_name, 'P2P' AS kind, "
                  "'PUSH' AS mode, received_at AS initiated_at, credit_status AS status, 'IN' AS direction FROM cbs_inward WHERE account_no=?", c["account_no"])
    return sorted(out + inward, key=lambda t: t["initiated_at"], reverse=True)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=config.PORT)
