# DisputePro — neatHack entry

A bank desk where AI agents resolve failed UPI transactions: a master agent plus Investigator, RBI Policy and
Resolver, with a deterministic execution engine and human approval above ₹10,000. Fictional **Sahyadri Bank**.
Run guide and code map: [README.md](README.md). Product contract: [docs/bank-console.md](docs/bank-console.md).
Build log and submission checklist: [hackathon.md](hackathon.md); add to it after every milestone, only with checks
that actually ran.

**Deadline:** submit Oct 12 2026, 7:00–11:55 PM IST on X (quote the official neatlogs post, tag #neatHack).
**Rubric:** agent 30% · use of neatlogs + Entire + cfo.ai 25% · demo 20% · building in public 15% · usefulness 10%.

## Rules from the user (non-negotiable)

- **Agentic, not scripted.** Agents decide from evidence; money math and execution stay deterministic. No customer
  portal (retired; `/app` redirects to `/console`). Don't reconnect the customer flow without a new instruction.
- **Save model tokens.** Nothing runs on its own. Run agents works `BANK_BATCH_SIZE` cases (3) and stops. Reset the
  demo ledger with `POST /api/bank/reset`; keep it fresh for the user.
- **Never fake anything.** No invented numbers, no claims about unused tools, no "tested" unless it ran. Sponsor
  tools are never shown as payment evidence. No real-bank branding in the product.
- **Git:** work on `qa`; `main` is prod, merge only when told. Commits look human: short lowercase message,
  **no co-author or AI attribution lines**. Flow:
  `CP=$(entire session attach <session-id> | grep -o "Entire-Checkpoint: [A-Z0-9]*")` → `git commit -m "msg" -m "$CP"` → `git push`.
  Never force-push or rewrite history.
- **No Docker.** Plain processes (systemd on EC2).
- **AWS: $25 credits total** — only at deploy time (one t3.small, us-east-1, Hackathon_VPC). EC2/Lambda/IAM/LB only.
- **Model:** Codex on the user's ChatGPT plan, no OpenAI API key. Build on `gpt-6-luna` low; switch to
  `gpt-6.1-sol` medium **before deploy**.
- Only add connectors/MCP that change an outcome.
- Never print `.env` values; never commit `.env`.
- UI: readable type (14px body, nothing under 11px), one design system across home and desk, sponsors prominent
  on the home page. Check UI changes in Chrome before reporting them done.

## Layout of the repo

- `backend/desk/bank.py` — ledger queue, batches, approvals, reset. `bank_seed.py` — 22-case seed.
- `backend/engine/bank_workflow.py` — master + specialists, mandatory governance. `executor.py` — the only code that
  moves money. `agent_codex.py` + `backend/agent_mcp.py` — Codex runtime and per-agent MCP tools.
- `backend/sandbox/` — stateful counterparties over HTTP. `backend/tracing.py` — neatlogs spans (use neatlogs'
  private tracer and attach the saved context; never pass `context=`).
- `backend/mcp_server.py` — DisputePro MCP at `/mcp` (bearer `MCP_API_TOKEN`).
- `frontend/app/console/` — bank desk. `frontend/app/page.tsx` — home. `frontend/app/evidence/` — cfo.ai and
  Crustdata evidence. `frontend/public/proof/` — screenshots used on the home page.

## Running

- Backend on 8000 (no `--reload`; don't restart while a case is WORKING), frontend on 3001.
- Tests: `cd backend && .venv/bin/python -m unittest discover -s tests`. Use a separate `SANDBOX_DB`, `LEDGER_PATH`,
  `PORT` and `PARTY_BASE_URL` for destructive experiments, and `LLM_PROVIDER=rules` to avoid model usage.

## Partner tools

- **neatlogs:** workflow `upi-exception-desk`; one trace per case, linked from Source evidence.
- **Entire:** CLI with Claude Code hooks, Graph, Brain (MCP in `.mcp.json`), Trail #1 qa → main:
  https://entire.io/gh/prabhat-gp/neathack-upi/trails/1
- **cfo.ai:** 12-month base/downside/upside model, `docs/cfo-verified-forecast.json`, `/evidence#cfo`.
- **Crustdata:** company research only, `backend/integrations/crustdata.py`, `/evidence#crustdata`.

## Open work

1. Deploy Oct 12: EC2 + Caddy/sslip HTTPS, `codex login --device-auth` on the server, model switch.
2. neatlogs before/after improvement evidence; failure-recovery write-up.
3. Demo video, build-in-public posts, submission checklist in `hackathon.md`.

<!-- entire-agent:begin -->
Read .entire/agent-guide.md for this repository's workflow, source inspection, and verification guidance.
@.entire/agent-guide.md
<!-- entire-agent:end -->
