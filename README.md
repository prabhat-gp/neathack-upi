# DisputePro — payment stuck, agents on it

An agent-operated UPI exceptions desk for the fictional Sahyadri Bank. Customer complaints and reconciliation
exceptions enter a shared queue. Intake identifies the payment; the Orchestrator routes on evidence to Investigator,
Policy and Resolver. A separate deterministic executor rechecks facts and amounts before taking action or requesting approval.

## Product surfaces

- `/`: product introduction, agent responsibilities and truthful sponsor status.
- `/app`: responsive customer payment help, case-specific conversations, confirmed actions and review requests.
- `/console`: searchable priority inbox, interactive agent workflow, evidence inspector, decisions, replay and resolution records.
- `/console?case=DP-…` and `/app?c=…&case=DP-…`: follow the same case across bank and customer views.

The sandbox account selector is inside Demo controls, outside the complaint flow. The bank desk's Sandbox controls
run reconciliation or generate synthetic arrivals. All queued channels process independently of the arrival generator.

## Customer-to-agent demo journey

1. Open `/app`, choose **New question**, and write a complaint or select a sandbox story:
   suspected KYC fraud, a double payment at a shop, or an unresponsive beneficiary bank.
   Each story selects its matching sandbox account and fills an editable message; agents determine the outcome.
2. Press **Send**. A dialog offers **Watch agents** or **Back to message**. The complaint has not been submitted yet.
3. Choose **Watch agents**. The browser opens `/console?handoff=1`; the mounted bank desk submits the draft,
   selects the returned case, and follows its investigation. The temporary draft is stored in session storage
   and removed after successful submission.
4. Inspect an agent or recorded connection to review its work. **Follow live** returns to the active agent and
   recenters the map, including when clicked again after scrolling. At completion it becomes **Latest outcome**.
5. Use **Case details**, beside the customer name, for the customer thread, actions and receipt, source evidence,
   and the neatlogs trace when available. Approval and confirmed results remain in the resolution panel.

The handoff applies to payment complaints, new chat complaints, and replies that resume a case waiting for information.
Ordinary messages on an existing case and specialist review requests stay in the customer view.
It is a browser demo handoff, not a server-side pause: direct channel requests and queued cases still process automatically.

Agent cards show a small model label; the inspection panel shows model turns, tool calls, decisions and findings.
Recorded model metadata takes precedence over the current runtime. Rules fallback and the deterministic execution engine
are labelled separately. The graph fits its available width automatically; secondary controls are grouped to preserve space.

## Run locally

Backend (Python 3.13; do not use reload while agent runs are active):

```sh
cd backend
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Frontend:

```sh
cd frontend
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run build
npm start -- -p 3001
```

The browser API URL is baked into the frontend build. Rebuild when changing backend ports.

Current local demo: customer app `http://localhost:3011/app`, bank desk `http://localhost:3011/console`,
Codex backend `http://localhost:8012`. These are local preview ports, separate from the defaults above.
Build that preview with `NEXT_PUBLIC_API_URL=http://localhost:8012 npm run build`, then serve with
`npm start -- --port 3011`.

Agents use Codex CLI with the team's ChatGPT login. Development model: `gpt-6-luna`, low effort. No OpenAI API key.
Without a configured model runtime, the rules fallback is explicitly labelled. Counterparty APIs and money are sandbox data.

For an isolated test backend, set `SANDBOX_DB`, `LEDGER_PATH`, `PORT` and `PARTY_BASE_URL` together. Set
`LLM_PROVIDER=rules` to test deterministic paths without consuming model usage; use `LLM_PROVIDER=codex` for real agents.

## Workflow and controls

- A payment-attached complaint can skip Intake; a free-text complaint can ask a clarification question.
- Confirmed credit and prior reversals close with proof. Other findings route to Policy and Resolver as required.
- The execution engine rechecks evidence, recomputes amounts and applies financial guardrails.
- Approval records a reviewer decision; changed evidence/amounts pause execution for a new review.
- Decline/escalation requires a reason. Failed runs and escalations are separate from completed cases.
- Partial failures retain confirmed actions and identify unconfirmed work. They are not automatically retried.
- Case outcomes and execution events persist in SQLite. Recorded workflows can be replayed after a restart.
- Interrupted in-flight/approval cases are escalated at server startup, not automatically resumed.
- A customer follow-up explicitly identifies its case; review requests return completed cases to specialist attention.

## Architecture

| Area | Location |
|---|---|
| Queue, supervisor, customer conversations | `backend/desk/` |
| Agent routing and model/tool loops | `backend/engine/` |
| Guardrails and financial execution | `backend/engine/executor.py` |
| Recorded events | `backend/engine/run.py`, SQLite `desk_events` |
| Stateful sandbox counterparties | `backend/sandbox/` |
| Runtime tracing | `backend/tracing.py` |
| Business metrics MCP | `backend/mcp_server.py` |
| Agent map and inspection panels | `frontend/components/desk/` |

## Sponsor status

- **neatlogs:** configured runtime tracing; available trace URLs are linked from cases.
- **Entire:** development checkpoints, Graph, Brain and review trail; linked from Build evidence.
- **cfo.ai:** integration/business plan pending. DisputePro MCP exposes operational inputs for that work.
- **Crustdata:** not integrated; removed earlier because its lookups did not change a decision.

## Verification

```sh
cd backend
.venv/bin/python -m unittest discover -s tests -v
```

Integration tests use temporary SQLite databases and in-process HTTP adapters. They cover refunds, duplicate prevention,
clarification ownership, approval, changed evidence, rejection, partial failure, review requests and autonomous recon.
Frontend validation: `npm run build`. See `hackathon.md` for the browser and real-agent checks actually performed.
