# DisputePro — clear UPI exceptions before the penalty clock runs out

Banks pay RBI compensation (₹100/day past T+1, or T+5 for merchant payments) and lose chargebacks on UPI failures
they fix too late. Most failures auto-reverse; the penalties come from the exceptions: deemed payments, inward
credits stuck in suspense, merchant non-confirmations, disputed claims. DisputePro's orchestrator and three AI agents
(Investigator, Policy, Resolver) find those exceptions, investigate every party and resolve them inside the deadline.

- `/`: the problem, today's manual process vs. DisputePro (sourced numbers)
- `/console`: the UPI exceptions desk. Pick an exception and watch the agents clear it, with ₹0 penalty

## Run locally

```bash
# Backend (Python 3.10–3.13; neatLogs does not support 3.14 yet)
cd backend
python3.13 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env            # optional: add Bedrock / Anthropic / neatLogs keys
.venv/bin/uvicorn main:app --port 8000

# Frontend
cd frontend && npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run build && npm start -- -p 3001
```

Or `docker compose up --build` (frontend on :3000, backend on :8000).

## Architecture

```
complaint ─► Master Orchestrator ─► Investigator ─┐   HTTP adapters (engine/parties.py)
                 (routes on evidence) ─► Policy ───┼──► CBS · NPCI UPI/UDIR · Beneficiary bank · Acquirer · NCRP
                                     ─► Resolver ──┘
                                          │
                                 Execution engine (engine/executor.py)
                                 re-verifies, recomputes, auto-executes or ─► Human approval
```

| Piece | File | What it does |
|---|---|---|
| Orchestrator | `engine/orchestrator.py` | LLM routes by dispatching agents as tools; code enforces ordering |
| Agents | `engine/agents.py` | System prompts + tool loops; each also has a rules brain with identical tools/output |
| Tools | `engine/tools.py` | Every tool is a real HTTP call to a party, or the policy/risk engine |
| Policy engine | `engine/rules.py` | RBI TAT annex rows 4(a)/4(b) verbatim; ₹100/day compensation; risk scorer |
| Execution engine | `engine/executor.py` | The only code that moves money: idempotent postings, amount recomputation, approval routing |
| LLM loop | `engine/llm.py` | Claude via AWS Bedrock or the Anthropic API; parallel tool calls; token usage streamed |
| Sandbox parties | `sandbox/` | SQLite-backed CBS, NPCI switch + UDIR, beneficiary banks, acquirer, NCRP with production-shaped APIs |
| Tracing | `tracing.py` | neatLogs spans (workflow → agent → LLM) when `NEATLOGS_API_KEY` is set |

**Agent brain.** `LLM_PROVIDER=auto` uses Bedrock when `AWS_*` + `BEDROCK_MODEL_ID` are set, else `ANTHROPIC_API_KEY`,
else the rules engine. The console header always shows which brain is active.

**Going live in a bank.** Set `CBS_URL`, `NPCI_URL`, `BENE_URL`, `ACQUIRER_URL`, `NCRP_URL` to the bank's integration
layer, with the same request and response shapes as `sandbox/routes.py`.

## The five scenes (sandbox)

| Scene | Trigger | Our role | Agents find | Result |
|---|---|---|---|---|
| Deemed payment, no credit confirmation | Recon sweep | Remitter | Kaveri Bank timed out; NPCI deemed; never credited, never returned | ₹5,000 refunded + chargeback, ~21h before T+1 · ₹0 penalty |
| Inward credit stuck in our suspense | Recon sweep | Beneficiary | Credit to a closed account parked in UPI suspense | Returned (RET) via NPCI before T+1, suspense cleared · ₹0 penalty, no chargeback |
| Shop never got confirmation | Complaint | Remitter | First payment deemed, merchant never confirmed; second paid the order | ₹2,340 refunded days before T+5 · ₹0 penalty |
| “Recipient says not received” | Complaint | Remitter | Beneficiary bank confirms credit with reference | Closed with proof; Policy & Resolver skipped; no chargeback |
| Collect-request scam | Complaint | Remitter | 2-day-old mule, 9 NCRP reports, risk 90 | Held for one-click approval → ₹31,200 frozen, NCRP + UDIR reports, payee blocked |

"Reset sandbox" (header) restores all state. Re-running a solved scene is recognised as already resolved, so nothing is paid twice.

## Sponsor tools: status

| Tool | Status |
|---|---|
| AWS Bedrock | Wired (`AsyncAnthropicBedrock`). Needs `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `BEDROCK_MODEL_ID` |
| neatLogs | Wired (`neatlogs.init` + `@span`). Needs `NEATLOGS_API_KEY` |
| Entire | Repo is git-initialised (nothing committed yet). Install the Entire CLI and enable it in this repo (docs.entire.io) to capture session checkpoints |
| cfo.ai | Not started: business model for the pitch |

## Deploy (judges never log in)

The agents run on **OpenAI Codex using the team's own ChatGPT plan** (neatHack provides no model credits). The server
holds its own Codex login; visitors only use the web app.

```bash
docker compose up -d --build
# one time per server: sign the server in to our ChatGPT plan with a device code (open the URL, enter the code)
docker compose exec backend codex login --device-auth
docker compose exec backend codex login status   # -> Logged in using ChatGPT
```

The login lives in the `agent-data` volume (`/data/codex`), so rebuilds keep it. Without a login the app falls back to
the rules engine and says so in the UI. `RUNS_PER_VISITOR_PER_HOUR` and `MAX_CONCURRENT_LLM_RUNS` ration the plan.
