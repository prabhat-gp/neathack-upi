# neatHack build log — DisputePro

## Project

**DisputePro** — AI agents that resolve a bank's failed UPI transactions inside RBI turnaround times.

**Problem.** Most failed UPI payments auto-reverse. The rest — deemed payments with no credit confirmation, inward
credits stuck in suspense, unconfirmed merchant payments — are worked by hand across core banking, NPCI and the
other bank. Past T+1 (T+5 for merchant payments) the bank owes the customer ₹100 per day
([RBI circular](https://rbi.org.in/commonman/English/scripts/Notification.aspx?Id=3074)).

**What the agents do.** A ledger case goes to a master agent → Investigator locates the failure across the payment
chain → RBI Policy always rules on deadline and compensation → Resolver proposes the remedy → a deterministic execution
engine re-verifies and executes, or holds for a human (fraud, payouts above ₹10,000, conflicting records).

## Team

prabhat-gp (github.com/prabhat-gp)

## Stack

| Part | What is used |
|---|---|
| Agents | Python, FastAPI. **OpenAI Codex CLI on the team's ChatGPT plan** (`codex exec --json`, no API key); each agent's tools served over a per-agent MCP endpoint. `gpt-6-luna` low effort during the build. neatHack provides no model credits. |
| Bank desk | Next.js 14 + Tailwind: `/` home, `/console` bank desk, `/evidence` sponsor evidence |
| Sandbox bank | Core banking, NPCI switch, receiving banks, acquirer, NCRP — SQLite state behind HTTP APIs |
| neatlogs | One trace per case: WORKFLOW > AGENT > LLM (each Codex turn with tokens) / TOOL > bank call |
| Entire | Checkpoint trailer on every `qa` commit, Graph, Brain (MCP), six Trail runners, Trail #1 qa → main |
| cfo.ai | 12-month operating model with base, downside and upside scenarios |
| Crustdata | Company-identification research for the target-bank list |
| DisputePro MCP | `/mcp` with bearer auth: desk metrics, recent runs, market facts, open exceptions, company research |

## Current build (11 October)

- Bank desk: ledger on the left; payment chain, master and three specialists, RBI governance, actions and resolution,
  and source evidence on the right. Readable type throughout; each agent has its own colour tint.
- 22-case ledger: 20 queued + 2 held approvals. **Run agents** works 3 cases (T01 → T03) and stops, to keep model
  usage predictable; `POST /api/bank/reset` restores the fresh ledger.
- Home page: mission, RBI deadlines and a compensation illustration, the agent team, sponsor thanks, real sponsor
  screenshots, then build evidence.
- **Checks that ran:** 23 backend tests pass (ledger cases, policy before execution, approval restore, duplicate and
  changed-evidence protection, queue pause, 3-case batch, reset, Crustdata). Real Codex sandbox runs with all four
  agents: outward refund 62.1s (11 source calls), inward return 64.1s (7 source calls). Console checked in Chrome at
  1920, 1440, 1280, 1024 and 390 px: no horizontal overflow, no text under 11px, no page errors.

## Build history

- **10 Oct, morning** — sandbox counterparties with real state changes; orchestrator + Investigator / Policy /
  Resolver; guardrailed execution engine.
- **10 Oct, midday** — agent runtime moved to Codex on the team's ChatGPT plan after organisers confirmed teams use
  their own model access. First neatlogs traces; fixed span routing and nesting.
- **10 Oct, afternoon** — fixed real-model failures found in runs: agents ending without submitting (session resumed
  and nudged), a wrong duplicate-refund classification (engine now needs NPCI credit confirmation), and paise read as
  rupees (tools return a rupee value beside every amount). Removed a Crustdata lookup that never changed a decision.
- **10 Oct, evening** — synthetic bank with realistic traffic, complaint channels and an Intake agent (later retired).
- **11 Oct** — rebuilt as a bank-only ledger desk with mandatory RBI governance, persisted approvals and a serial
  queue; cfo.ai model and Crustdata research added as business evidence; console readability and layout pass; 3-case
  batch and ledger reset.

## Demo

Local: home `http://localhost:3001`, bank desk `http://localhost:3001/console`, backend `http://localhost:8000`.
Path: open the desk → Run agents → watch T01–T03 → open T21 or T22 → approve or send to investigation.
Public URL and video: pending (deploy on 12 Oct).

## Known limits

- Sandbox counterparties only; no real NPCI or bank connectivity.
- No neatlogs before/after improvement comparison written up yet.
- The failure-recovery run is in the tests and traces but not yet written up for submission.

## Submission checklist

Requirements from neatlogs.com/hackathon. Submit Oct 12, 7:00–11:55 PM IST on X, quoting the official neatlogs post.

- [x] Team and project name
- [x] Public repository with commits dated Oct 10–12
- [x] Entire checkpoints on every `qa` commit
- [x] cfo.ai business model: pricing, costs, revenue, runway
- [ ] Demo video explaining the agents and all three tools
- [ ] neatlogs traces, including a before/after improvement comparison
- [ ] A run where an action failed and what the agent did next, written up
- [ ] Build-in-public posts tagged #neatHack
