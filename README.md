# DisputePro

AI agents that resolve failed UPI transactions for a bank's payment-operations team, inside RBI turnaround times.

DisputePro is a bank desk for one bank (the fictional **Sahyadri Bank**). Failed payments sit in an exceptions
ledger. A **master agent** picks each case and coordinates three specialists: **Investigator**, **RBI Policy** and
**Resolver**. A deterministic execution engine re-checks every fact and amount before money moves. Payouts above
₹10,000 and conflicting records stop for a person.

Built for neatHack 2026. Build log and submission checklist: [hackathon.md](hackathon.md).

## Try it

1. Open the bank desk at `/console`.
2. The ledger on the left holds **22 transactions**: 20 queued, plus 2 held for human approval (T21, T22).
3. Press **Run agents · next 3**. The master works T01 → T02 → T03 one at a time, then the queue stops.
   Press again for the next three. The batch size keeps model usage predictable (`BANK_BATCH_SIZE`, default 3).
4. For each case, watch:
   - the **payment chain** (remitter → NPCI → receiver) and where it failed,
   - the **agents**: master on top, the three specialists below, each with its model, latest finding and tokens,
   - **RBI governance**: T+1 / T+5, compensation owed, pass or hold,
   - **Actions & resolution**: proposed vs executed actions, receipt references, approval form when required,
   - **Source evidence**: the raw responses from core banking, NPCI and the other bank, plus the neatlogs trace.
5. Open T21 or T22 and approve, or send to investigation with a reason.

Filters: All cases · Approval · Investigate · Completed. The desk switches to each case as the agents pick it up.

To put every transaction back to queued: `curl -X POST localhost:8000/api/bank/reset`.

## How a case is decided

```
ledger case → Master agent → Investigator → RBI Policy (always) → Resolver → execution engine → completed
                                                                                            → human approval
                                                                                            → investigation
```

- **Investigator** queries the sandbox bank's core banking, the NPCI switch and the receiving bank over HTTP and
  locates the failure.
- **RBI Policy** applies the turnaround rules (P2P and inward T+1, merchant T+5, ₹100 per eligible overdue day;
  [RBI circular](https://rbi.org.in/commonman/English/scripts/Notification.aspx?Id=3074)). A deterministic gate
  validates its ruling; no financial action runs without it.
- **Resolver** proposes the remedy: refund, return from suspense, chargeback, compensation.
- The **execution engine** is the only code that moves money. It re-reads NPCI, the ledger and beneficiary credit,
  recomputes amounts, posts idempotently and holds anything above the approval limit. Approval re-validates the plan;
  changed evidence blocks it. A declined plan needs a reason and moves no money.
- Run events, outcomes and approval checkpoints persist in SQLite. Held approvals survive a restart; interrupted
  work goes to investigation and is never retried blindly. A case that runs past 180 seconds goes to investigation.

The 60–90 second target is a goal, not an SLA. Recorded sandbox runs: an outward refund in 62.1s and an inward
return in 64.1s, all four agents on Codex.

## Run locally

Backend (Python 3.13; don't use `--reload` while agents are running):

```sh
cd backend
.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Frontend (the API URL is baked in at build time):

```sh
cd frontend
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run build
npm start -- -p 3001
```

Agents run on the **OpenAI Codex CLI signed in with the team's ChatGPT plan** (`codex exec --json`); no API key.
Development model: `gpt-6-luna`, low effort. Without a Codex login the desk uses a rules engine and labels it
"Rules verification · no LLM". All banks, accounts and money movement are sandbox data.

## Code map

| Area | Location |
|---|---|
| Ledger queue, batches, approvals, reset | `backend/desk/bank.py` |
| 22-case ledger seed | `backend/desk/bank_seed.py` |
| Master + specialists, mandatory governance | `backend/engine/bank_workflow.py` |
| Agent prompts, tools, Codex loop | `backend/engine/agents.py`, `tools.py`, `agent_codex.py`, `backend/agent_mcp.py` |
| Execution engine | `backend/engine/executor.py` |
| Sandbox counterparties (CBS, NPCI, other banks, acquirer, NCRP) | `backend/sandbox/` |
| Tracing | `backend/tracing.py` |
| DisputePro MCP (`desk_metrics`, `recent_runs`, `market_facts`, `open_exceptions`, `research_target_companies`) | `backend/mcp_server.py` |
| Bank desk UI | `frontend/app/console/page.tsx`, `bank.css` |
| Home page, sponsor evidence | `frontend/app/page.tsx`, `frontend/app/evidence/page.tsx` |

`/app` redirects to `/console`; the earlier customer portal is retired.

## Sponsors

- **neatlogs** — one trace per case: workflow → agents → each Codex turn with tokens → each tool and bank call.
  Linked from the case's Source evidence.
- **Entire** — every commit on `qa` carries an Entire checkpoint linked to the AI session that wrote it; Graph, Brain
  and a qa → main review trail.
- **cfo.ai** — a 12-month operating model with base, downside and upside scenarios (`docs/cfo-verified-forecast.json`,
  `/evidence#cfo`).
- **Crustdata** — company-identification lookups for target-bank research, ambiguous matches kept
  (`backend/integrations/crustdata.py`, `/evidence#crustdata`).

cfo.ai, Crustdata and Entire support the business plan and the build; none of them is presented as evidence for a
payment decision.

## Tests

```sh
cd backend && .venv/bin/python -m unittest discover -s tests
```

23 tests: all 20 queued ledger cases, policy before execution, approval restore and duplicate protection,
changed-evidence holds, decline without money movement, queue pause, the 3-case batch, ledger reset,
Crustdata parsing, and the earlier channel journeys.

## Limits

- Sandbox counterparties only; no real NPCI or bank connectivity.
- Demo controls are not production authentication.
- Measured timings are individual sandbox runs, not guarantees.
