# DisputePro — neatHack entry

AI agents that clear UPI payment exceptions before the RBI deadline (T+1 P2P, T+5 P2M), so the bank pays ₹0 in
penalties, and answer customer complaints on the channel they came from. Build log and submission checklist:
`hackathon.md` (keep it updated after every milestone, with only tests that actually ran).

**Deadline:** submit Oct 12 2026, 7:00–11:55 PM IST on X (quote the official neatlogs post, tag #neatHack).
**Rubric:** agent 30% · use of neatlogs + Entire + cfo.ai 25% · demo 20% · building in public 15% · usefulness 10%.

## Rules from the user (non-negotiable)
- **Agentic, not a demo.** No hardcoded scenes, no scripted outcomes, no customer pickers in the complaint flow.
  Complaints arrive through channels; agents decide from evidence. Money math stays deterministic in the executor.
- **Never fake anything:** no invented numbers, no claims about tools we don't use (Crustdata was removed — never
  claim it), no "tested" unless it ran. Fictional bank is **Sahyadri Bank**; no real-bank branding.
- **Git:** work on `qa`; `main` is prod — merge only when the user says. Commits look human: short lowercase
  message, **no Claude co-author / no AI attribution lines**. Flow:
  `CP=$(entire session attach <session-id> | grep -o "Entire-Checkpoint: [A-Z0-9]*")` → `git commit -m "msg" -m "$CP"` → `git push`.
  Never force-push or rewrite history yourself.
- **No Docker.** Plain processes (systemd on EC2).
- **AWS: $25 credits total** — touch only at deploy time (one t3.small, us-east-1, Hackathon_VPC). EC2/Lambda/IAM/LB only; no Bedrock.
- **Model:** agents run on Codex with the user's ChatGPT plan. Build/test on `gpt-6-luna` low effort; switch to
  `gpt-6.1-sol` medium **before deploy**. Never use an OpenAI API key.
- Only add connectors/MCP that change an outcome — nothing "for the sake of adding".
- Never print `.env` values (a token was leaked once and rotated). Never commit `.env`.
- Home page and console share one design system; sponsors (neatlogs, Entire, cfo.ai) are marketed prominently.
- The user prefers to do UI/account steps themselves: give exact click paths.

## Architecture
```
channels ──► desk (case queue) ──► supervisor (2 in flight) ──► agents ──► guardrailed executor ──► reply on channel
UDIR (UPI app, UTR)        backend/desk/store.py       supervisor.py     Intake → Orchestrator    executor.py
CHAT (free text, any lang) statuses: QUEUED WORKING                       → Investigator → Policy
RECON (nightly sweep)      NEEDS_YOU NEEDS_INFO                           → Resolver
autopilot.py (recon + a complaint every 120s, max 10)  RESOLVED ESCALATED FAILED
```
- **Synthetic bank** `backend/sandbox/` (db.py, population.py, routes.py): 40 customers, ~430 payments/7 days, 9
  real exceptions hidden in traffic. Parties over HTTP: CBS, NPCI switch + UDIR, beneficiary banks, acquirer, NCRP.
- **Agents** `backend/engine/`: `intake.py` (finds the UTR or asks one question), `orchestrator.py`, `agents.py`
  (Investigator/Policy/Resolver prompts), `caseinfo.py` (TAT/deadline), `executor.py` (only code that moves money;
  re-verifies, idempotent, human approval for fraud or > ₹10,000), `tools.py`, `parties.py` (retry once on 5xx).
- **Brain** `engine/agent_codex.py`: `codex exec --json` (ChatGPT login in `~/.codex/auth.json`, OPENAI_API_KEY
  stripped, read-only sandbox, `--ignore-user-config`). Tools reach Codex via per-agent MCP `/agent-mcp/<sid>`
  (`agent_mcp.py`, `default_tools_approval_mode="approve"`). Tools return `*_inr` beside every `*_paise`.
  Unsubmitted sessions are resumed with a nudge (max 2). Without a Codex login → labelled rules brain fallback.
- **neatlogs** `backend/tracing.py`: one trace per case, WORKFLOW > AGENT > LLM/TOOL > TOOL. Use neatlogs' private
  tracer (`neatlogs._wrap_utils.get_tracer()`), attach the saved context — never pass `context=`.
- **DisputePro MCP** `mcp_server.py` at `/mcp`, bearer `MCP_API_TOKEN`: desk_metrics, recent_runs, market_facts,
  open_exceptions. Intended surface for cfo.ai and Claude Code.
- **Frontend** Next.js 14 + Tailwind: `/` landing (dark hero, Partners), `/app` customer UPI app simulator,
  `/console` live ops desk (SSE `/api/runs/{id}/events`). Fonts Inter / Inter Tight / Newsreader / JetBrains Mono;
  `night`/`ink` = `#06070d`, violet accent.

## Run locally
- Backend (Python 3.13 venv; no `--reload` — reload kills in-flight runs; don't edit backend files mid-run):
  `cd backend && /Users/admin/Desktop/neathack-upi/backend/.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000`
- Frontend: `cd frontend && npm run build && npm start -- -p 3001`
- Reset sandbox: ⋯ menu in `/console`. Each real Codex case ≈ 250–400k tokens, 1–1.5 min.

## Partner tools
- **Entire** CLI 0.11.4 (github:prabhat-gp), Graph v0.4.0, Brain 0.1.0 (MCP in `.mcp.json`), 6 Trail runners,
  Trail #1 qa→main: https://entire.io/gh/prabhat-gp/neathack-upi/trails/1
- **neatlogs** workflow `upi-exception-desk`; trace URL
  `https://app.neatlogs.com/traces/{traceid}?orgId=…&projectId=…` (ids in `.env`).
- **cfo.ai** (pending, OK to show as in progress): connect DisputePro MCP (needs public URL) + Frankfurter,
  build pricing/costs/revenue/runway plan, then flip the Partners panel to Live.

## Open work
1. Re-verify Hindi complaint → Hindi reply on real Codex.
2. cfo.ai business plan. 3. neatlogs detections/evals + before/after evidence. 4. Failure-recovery run write-up.
5. Deploy Oct 12 (EC2 + Caddy/sslip HTTPS, `codex login --device-auth` on server, model switch). 6. Video, posts, submission checklist.

<!-- entire-agent:begin -->
Read .entire/agent-guide.md for this repository's workflow, source inspection, and verification guidance.
@.entire/agent-guide.md
<!-- entire-agent:end -->
