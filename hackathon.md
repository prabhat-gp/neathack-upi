# neatHack build log — DisputePro

## Project
**DisputePro** — a master orchestrator and three AI agents that clear UPI payment exceptions before the RBI deadline.

**Problem:** Most failed UPI payments auto-reverse. The ones that don't — deemed payments with no credit confirmation,
inward credits stuck in suspense, merchant non-confirmations, disputed "not received" claims — are worked by hand across
core banking, NPCI and the other bank. Miss T+1 (T+5 for merchant payments) and the bank owes ₹100/day per transaction
(RBI circular DPSS.CO.PD No.629/02.01.014/2019-20); late returns lose chargebacks (NPCI UPI/OC/213/2024-25).

**What the agent does end to end:** picks up an exception (reconciliation sweep or customer complaint) → Investigator
queries every party → Policy computes the deadline and what is owed → Resolver plans actions → a guardrailed execution
engine re-verifies and executes (refund, return, chargeback, lien, cybercrime report) or holds for one-click human approval.

## Team
_Pending: builder to choose names/handles to publish._

## Stack
| Part | What is actually used |
|---|---|
| Agents | Python, FastAPI, Claude via the **Claude Agent SDK** (Claude Code token), tools served from an in-process MCP server (`backend/engine/agent_sdk.py`); Anthropic SDK loop kept for API-key/Bedrock (`backend/engine/llm.py`). The hackathon AWS account allows EC2/Lambda/IAM only, so Bedrock is not used. |
| Crustdata | Hosted MCP server given to the Investigator for live web/company intel; calls shown as a party in the console |
| DisputePro MCP | Our own MCP server at `/mcp` (`desk_metrics`, `recent_runs`, `open_exceptions`) and `/api/metrics`, fed by a run ledger (tokens, provider-reported cost, time, deadline, penalty) — for cfo.ai and Claude Code |
| Agent fallback | Deterministic rules brain with identical tools/outputs, used only when no LLM credentials are set |
| Counterparties | Sandbox CBS, NPCI switch + UDIR, beneficiary banks, merchant acquirer, NCRP portal — SQLite state, HTTP APIs (`backend/sandbox/`) |
| Frontend | Next.js 14, Tailwind: `/` landing page, `/console` exceptions desk |
| neatlogs | SDK wired (`backend/tracing.py`): workflow + per-agent spans, Anthropic/Bedrock auto-instrumentation — **pending API key** |
| Entire | CLI 0.11.4 enabled for Claude Code (`entire enable --agent claude-code`); GitHub repo + mirror pending |
| cfo.ai | **Pending**: business plan via cfo.ai MCP server (`https://api.cfo.ai/mcp`) |

## Build log

### 2026-10-10
- Rebuilt the earlier prototype from scratch: removed fake result pages, hard-coded mock fallbacks and invented token/cost numbers.
- Built sandbox counterparties with production-shaped HTTP APIs and real state changes (balances, postings, suspense, liens, UDIR complaints, NCRP reports).
- Built the orchestrator + Investigator / Policy / Resolver as Claude tool-use agents, plus the guardrailed execution engine
  (re-verifies NPCI and ledger, recomputes amounts, idempotent postings, human approval for high risk or payouts above ₹10,000).
- Reframed the product around **penalty prevention** after review: every scene must resolve before T+1/T+5 with ₹0 compensation.
- Final five scenes: outward deemed payment (recon sweep), inward credit stuck in suspense (we are beneficiary bank),
  merchant payment not confirmed (T+5), "recipient says not received", collect-request fraud (human approval).
- Added "Write your own complaint" so judges can dispute any transaction in their own words.
- Added per-agent model and token display, streamed model reasoning, per-turn markers and orchestrator handoff notes.
- **Tests that actually ran:** all five scenes end to end on the rules brain via API and in the browser (₹0 penalty on all
  deadline scenes; re-runs detected as already resolved; fraud approval froze a partial ₹31,200 lien). The Claude loop was
  tested only against scripted SDK responses; the streaming version has **not** been run against a real model yet.

- Afternoon (2026-10-10): researched every partner tool in the browser; added the Claude Agent SDK brain, Crustdata MCP in the
  Investigator, the DisputePro MCP server + run ledger, and scene 6 (beneficiary bank API outage).
- **Tests that actually ran:** MCP `tools/list` and `desk_metrics` over HTTP; scene 6 on the rules brain (504 → visible retry →
  504 → decided on NPCI evidence → refunded with 12h 28m to spare, ₹0 penalty). The Agent SDK path has **not** run yet (token pending).

## Demo
_Pending: URL and video. Local: backend `uvicorn main:app --port 8000`, frontend `npm run build && npm start -- -p 3001`._

## Known limitations and next steps
- Agents have not yet run on a real LLM (AWS credits pending). Until then the UI labels every agent "Rules mode · no LLM".
- Counterparties are a sandbox; no real NPCI or bank connectivity.
- neatlogs, Entire and cfo.ai integrations are not complete (see Submission).
- No failure-recovery run recorded yet (judging asks for one).
- No "before vs after" agent improvement evidence yet.

## Submission
Requirements from neatlogs.com/hackathon (checked 2026-10-10). Submit Oct 12, 7:00–11:55 PM IST, on X, quoting the official neatlogs post.
- [ ] Team and project name
- [ ] Public repository with commits dated Oct 10–12
- [ ] Demo video explaining the agent and all three tools
- [ ] neatlogs traces, including a before/after improvement comparison
- [ ] Entire checkpoints or entire-graph output
- [ ] cfo.ai business plan: pricing, costs, revenue, runway
- [ ] A run where an action failed and what the agent did next
- [ ] Build-in-public posts tagged #neatHack
