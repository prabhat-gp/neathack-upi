# neatHack build log — DisputePro

## Project
**DisputePro** — an Intake agent, a master orchestrator and three specialist AI agents that clear UPI payment exceptions
before the RBI deadline and reply to the customer on the channel they used.

**Problem:** Most failed UPI payments auto-reverse. The ones that don't — deemed payments with no credit confirmation,
inward credits stuck in suspense, merchant non-confirmations, disputed "not received" claims — are worked by hand across
core banking, NPCI and the other bank. Miss T+1 (T+5 for merchant payments) and the bank owes ₹100/day per transaction
(RBI circular DPSS.CO.PD No.629/02.01.014/2019-20); late returns lose chargebacks (NPCI UPI/OC/213/2024-25).

**What the agent does end to end:** a case arrives (UPI-app complaint via UDIR, free-text chat, or the nightly reconciliation
sweep) → Intake finds the payment or asks the customer → Investigator
queries every party → Policy computes the deadline and what is owed → Resolver plans actions → a guardrailed execution
engine re-verifies and executes (refund, return, chargeback, lien, cybercrime report) or holds for one-click human approval.

## Team
prabhat-gp (github.com/prabhat-gp)

## Stack
| Part | What is actually used |
|---|---|
| Agents | Python, FastAPI. Model runtime: **OpenAI Codex CLI on the team's own ChatGPT plan** (`codex exec --json`, ChatGPT login, no API key) — `backend/engine/agent_codex.py`. Each agent's tools are served to Codex from a per-agent MCP endpoint (`backend/agent_mcp.py`). Building/testing on `gpt-6-luna` (low effort); a stronger model is planned for the judged deployment. neatHack provides no model credits (AWS account excludes Bedrock; confirmed by organisers on Discord). |
| DisputePro MCP | Our own MCP server at `/mcp` behind a bearer token (`desk_metrics`, `recent_runs`, `market_facts`, `open_exceptions`), fed by a run ledger (tokens, time, deadline, penalty) — the single surface cfo.ai and Claude Code read from |
| Agent fallback | Deterministic rules brain with identical tools/outputs, used only when no LLM credentials are set |
| Counterparties | Sandbox CBS, NPCI switch + UDIR, beneficiary banks, merchant acquirer, NCRP portal — SQLite state, HTTP APIs (`backend/sandbox/`) |
| Frontend | Next.js 14, Tailwind: `/` landing page, `/app` customer UPI app, `/console` live ops desk |
| neatlogs | `backend/tracing.py`: one trace per case — WORKFLOW > AGENT (orchestrator, investigator, policy, resolver) > LLM (each Codex turn: model, prompt, output, token counts incl. cached/reasoning) and TOOL (each tool call) > TOOL (each counterparty HTTP call, errors marked). Manual spans because model calls happen inside the Codex process. |
| Entire | CLI 0.11.4 with Claude Code hooks; every commit on `qa` carries an Entire-Checkpoint trailer and checkpoints sync to GitHub; repo mirrored on entire.io (US East + Mumbai). **Graph** v0.4.0 indexes the repo (449 symbols, 1,685 relations) for code search/impact; **Brain** 0.1.0 distils build sessions into project memory (MCP server registered in `.mcp.json`); 6 **Trail runners** (review, risk, security, drift, confidence, summary) committed for qa→main reviews |
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

- Midday (2026-10-10): switched the agent runtime to Codex on our ChatGPT plan after organisers confirmed teams use
  their own model access. First Codex runs of scene 6 (bank API outage): with gpt-5.5 the Investigator chose an extra
  retry and got "not credited"; with gpt-6-luna it decided on NPCI evidence after two 504s. Both refunded before T+1, ₹0
  penalty (~70–115 s per case, ~300k input tokens mostly Codex's own instructions, largely cached).
- neatlogs: first traces received. Fixed two tracing bugs found in the dashboard: spans went to the OTel global tracer
  instead of neatlogs' isolated provider, and child spans did not nest (neatlogs resolves parents from its own context key).
  Verified nesting WORKFLOW > AGENT > TOOL in the dashboard with a rules-mode run.
- Public repo created: github.com/prabhat-gp/neathack-upi. Docker removed (plain processes on one EC2 instance planned).

- Afternoon (2026-10-10):
  - All six scenes run on Codex agents. Failures found and fixed: an agent ended without submitting (now the Codex
    session is resumed and nudged), the model filed a "duplicate refund" for a payment that never reached the merchant
    (prompt clarified; execution engine now requires NPCI credit confirmation before a duplicate refund), and agents
    wrote ₹80,000 for an ₹8,000 case because tools returned paise (tools now return a rupee string beside every amount).
  - Removed Crustdata from the case flow after review: its results never changed a decision. Removed the separate
    Finance API; the DisputePro MCP (with bearer auth) is the one integration surface.
  - Console rebuilt for reviewers: pipeline stepper, one agent in focus at a time, case report on completion, live
    "what changed in the bank's systems", and a link from each run to its neatlogs trace.
  - Verified in neatlogs: one trace per case, WORKFLOW > AGENT > LLM (Codex turn with tokens) > TOOL > counterparty call.
- Branching: `qa` for work in progress, `main` is production.

- Evening (2026-10-10): rebuilt the product around how complaints actually reach a bank.
  - A synthetic Sahyadri Bank: 40 customers, ~430 UPI payments over 7 days, with realistic failures hidden in normal
    traffic (deemed, auto-reversed, suspense, collect-request mule). The six story customers live inside it.
  - Channels open cases: UPI-app complaints via NPCI UDIR (UTR attached), free-text chat (any language), and the
    nightly reconciliation sweep. New **Intake agent** finds the payment a chat message is about, or asks the customer.
  - A supervisor loop works the queue on its own (2 in flight); replies go back on the customer's channel.
    Autopilot runs the recon sweep and has customers write in every 2 minutes (capped at 10 per session).
  - New screens: a customer UPI app (`/app`) and an ops desk (`/console`) that follows each case live.
  - Tests that ran: rules brain end to end (chat → intake → refund; vague chat → question → follow-up → closed; UDIR
    fraud → approval → ₹31,200 frozen; autopilot → 8 recon exceptions + 2 complaints). Real Codex agents: Hinglish chat
    "kal Kiran ko 3000 bheje the…" → Intake found the UTR → correctly closed as already auto-refunded (56s); Hindi UDIR
    complaint → refunded ₹2,000 with 9h 29m to spare (84s). Found and fixed: no reply when the Orchestrator closed
    without the Resolver; reply written in Marathi to a Hindi complaint (language rule tightened).

### Agent-first product rebuild · 2026-10-10
- Rebuilt the landing page, customer help and bank desk with a shared navy/blue design system.
- Bank desk: case search and priority filters; stable, interactive agent graph drawn from recorded handoffs; separate
  execution-engine node; event-driven active connections; agent/task inspection; source evidence filtering; recorded-event
  replay; customer thread; reviewer decisions; action results and before/after bank records. Reduced-motion and keyboard support.
- Customer: payment issue shortcuts plus free text; sandbox session controls outside complaint intake; per-case conversations;
  direct link to the corresponding bank case; confirmed actions and specialist review requests; responsive layout and dialog focus trap.
- Backend: explicit case-scoped replies, recon independent of synthetic traffic, persisted events and full outcomes, interrupted
  cases escalated on restart, required decline reason, revalidation at approval, and partial failures retain confirmed actions.
- Fixed the sandbox reset attempting to drop SQLite's internal sqlite_sequence table, and closed run-ledger connections.
- Tests actually run: eight isolated integration tests passed (refund + replay + duplicate prevention, clarification ownership,
  approval, changed-evidence approval pause, decline reason, customer review, partial execution, autonomous recon).
- Browser checks actually run in headless Chrome: customer payment complaint → linked agent desk; approval → execution receipt;
  evidence filter; replay slider; customer review request. No page errors. No horizontal page overflow at 390, 768, 1024 or 1440 px.
- Real Codex check: Hindi free-text complaint, gpt-6-luna low, isolated sandbox. Intake identified the ₹5,000 payment;
  Investigator → Policy → Resolver → executor confirmed refund + chargeback. Customer response remained Hindi.
- Sponsor limitations remain explicit: cfo.ai pending; Crustdata absent. Model-driven results are not mocked for the UI.
- Final production build: `NEXT_PUBLIC_API_URL=http://localhost:8012 npm run build` passed, including TypeScript checking
  and static generation for `/`, `/app`, and `/console`. Local production preview runs on port 3011; the isolated real-Codex
  backend runs on port 8012. The original services on 3001/8000 were not restarted.

### Demo handoff and agent visibility · 2026-10-10

- Customer Send now opens a short Watch agents dialog before any complaint request. Back to message preserves the draft.
  Watch agents navigates to the bank desk, where the complaint is submitted once and its returned case is selected.
  The browser uses a temporary session-storage draft; direct API submissions and the server queue remain automatic.
- Added editable sandbox stories for suspected KYC fraud (Sunita), double merchant payment (Ananya), and an unresponsive
  beneficiary bank (Neha). These supply complaint text and account context, not predetermined outcomes.
- Added small model labels to agent cards and model turns to the inspection panel alongside tool calls and findings.
  Recorded run metadata supplies the model where available; rules fallback remains explicit.
- Moved Follow live and Case details beside the customer name. Grouped thread, actions/receipt, evidence and available
  trace link under Case details. Removed the map-size button; the workflow fits its container automatically.
- Fixed the workflow scroll container and repeat-click recentering. Selecting an agent pauses following; Follow live
  restores the active agent. Completed runs offer Latest outcome. The activity panel follows incoming work.
- **Checks actually run:** production build with `NEXT_PUBLIC_API_URL=http://localhost:8012` passed, including type checking
  and static generation. Headless Chrome verified no channel request while the dialog was open, cancellation without
  sending, exactly one submission after bank navigation, manual agent inspection → Follow live, repeat-click recentering,
  visible model turns, and no horizontal overflow at 390 px. Desktop checked at 1440 px; no page errors.
- **Verification boundary:** these interaction checks intercepted the complaint and run-event endpoints with simulated
  data. No new real-Codex investigation or backend integration suite was run for this frontend-only update.
- Restarted the production frontend on `3011` against the existing Codex backend on `8012`.

### Landing, quick tour and fixes · 2026-10-10 (night)
- Landing rebuilt around "The UPI dispute resolution squad": live replay of real case DP-2944, live desk numbers from
  the run ledger, the five agents, three real runs, and a thank-you section for neatlogs, Entire and cfo.ai.
- Quick tour (8 steps) from customer complaint to bank resolution; agent steps unlock only when that agent actually
  starts. Send is now one click straight to the bank desk (the extra "Watch agents" dialog was removed).
- Recon exceptions wait for autopilot or "Start agents" again, so a sweep no longer runs every case on its own.
- Fixed: old runs without recorded events now open from their saved outcome instead of a 404; a crash when the
  Investigator omitted the payment id (seen on a real autopilot run, DP-2260).
- **Checks actually run:** backend tests (9 passed); the full tour clicked through in Chrome against the real Codex
  backend (fraud story → one-click send → agents → held for human approval); short tour, first-visit memory and
  390 px layout in headless Chrome against a rules-mode test backend.

### Product review and guided journey, iteration 1 · 2026-10-10

- Audited commits `c673d20`, `bef84cc`, and `21340b6`, the current agent pipeline, and the running product on port 3001.
  Recorded ranked problems, integration decisions, and iteration gates in `docs/product-review.md`.
- Replaced the automatic eight-step overlay tour with an optional in-flow Customer → Agent investigation → Outcome guide.
  Guidance handles clarification and failure, does not wait for a fixed route, and leaves agent inspection under viewer control.
- Restored the pre-submission handoff. Send opens a native dialog; Watch agents navigates before submitting. Cancel preserves
  the message. Drafts track submission/case IDs so revisiting a submitted handoff reopens the case rather than resending.
  Interrupted submissions and missing drafts produce an explicit recovery message.
- Corrected the landing animation label to identify its illustrated historical replay; removed the blanket promise that every
  payment resolves before the deadline. The cfo.ai status remains pending.
- Checks actually run: production build against backend port 8000 passed. Headless Chrome interaction tests passed for direct
  visits without an automatic tour, guided entry, no POST before handoff, cancellation preserving text, one POST after
  navigation, revisiting a submitted draft without a second POST, manual inspection and Follow live, clarification and failure
  guidance, guide state after refresh, missing-draft handling, and mobile layout at 390 px. Desktop checked at 1440 px.
  No JavaScript page errors. Complaint/run endpoints were intercepted with simulated data for these interaction tests.
- No new real-model investigation or backend integration suite was run in this iteration. Recon gating and the misleading
  post-execution customer message are documented priorities for iteration 2, not claimed as fixed.
- Review preview: `http://localhost:3011/app?tour=1`, connected to the existing backend on port 8000.
- User confirmed a cfo.ai workspace. Added its official MCP server to global Codex configuration; OAuth authorization
  succeeded. Captured aggregate run metrics and explicit economics limitations in `docs/cfo-inputs.json`; no cfo.ai model yet.

### Homepage redesign — 2026-10-10
- Customer-first entry: Quick tour goes to `/app?tour=1`; Customer portal goes to `/app`. Removed direct bank-desk entry points from the homepage.
- Reworked section spacing, journey explanation, agent roles, recorded outcomes, sponsor cards and final call to action. Homepage replay and example messages use English.
- Sponsor screenshots use a consistent responsive grid with uncropped images. Native dialog viewer opens in place, supports previous/next, Escape and close, traps focus and restores it to the trigger.
- Removed the mistakenly added product screenshot gallery; retained its source captures in `frontend/public/proof/` for reference.
- Inspected the two Desktop screenshots supplied at 23:29. cfo.ai shows its welcome chat and no data connections; Crustdata shows zero watches. These do not establish completed integration or business-plan evidence and are not presented as such.
- cfo.ai OAuth authenticates Codex access to cfo.ai; it does not connect DisputePro as a data source inside cfo.ai. Business plan and verified Crustdata integration remain outstanding.
- Verified production build and browser checks at 360, 390, 768 and 1440px: no horizontal overflow, no Hindi homepage text, no direct bank entry links, working screenshot viewer and customer tour navigation, no page errors. Visually reviewed desktop page and mobile evidence cards.
- Preview: `http://localhost:3011`.

## Demo
Public URL and video are pending. Current local preview:

- Customer: `http://localhost:3011/app`
- Bank desk: `http://localhost:3011/console`
- Codex backend: `http://localhost:8000`

Demo path: New question → choose a sandbox story or write a complaint → Send → Watch agents → live bank workflow
→ approval when required → confirmed actions and customer response. See `README.md` for setup and controls.

## Known limitations and next steps
- Counterparties are a sandbox; no real NPCI or bank connectivity.
- cfo.ai business plan not built yet; neatlogs detections/evals not set up yet.
- Failure recovery ran (bank API outage scene: 504 → retry → decided on NPCI evidence) but is not written up for submission yet.
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
