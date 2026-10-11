# DisputePro product review and iteration plan

Reviewed 2026-10-10 against commits `21340b6`, `bef84cc`, and `c673d20`, current source, and the local product on port 3001.

## Assessment

The agent/executor foundation is worth keeping. The current presentation does not yet make a convincing top-five case:
viewers must navigate too much, live work can happen before they reach it, and the customer receipt can contradict the
execution record. Ranking cannot be predicted without seeing competing submissions.

The intended demonstration is one coherent case: complaint → evidence → routing decision → proposed action → approval
when required → verified bank record → a clear reply to the same customer. A good live run should make each transition
understandable without the presenter explaining which button to find.

## Findings, in priority order

| Priority | Observed problem | Fix and acceptance criterion |
|---|---|---|
| P0 | cfo.ai remains a placeholder. The official event requires its business plan. | Author pricing, costs, revenue and runway in cfo.ai; include a shareable artifact. Our MCP endpoint alone is not proof of using cfo.ai. |
| P0 | Send posts the complaint before offering Watch agents (`app/app/page.tsx`). | Submit only after the bank workspace opens. Cancel must retain the message and create no case. Refresh must not silently resubmit. Iteration 1 addresses this. |
| P0 | The tour covers controls on mobile, changes panels, and waits on particular agents. | Replace the eight-step overlay with optional in-flow guidance derived from case state. No blocked Next button, no automatic welcome popup, no forced agent selection. Iteration 1 addresses this. |
| P0 | Recorded case DP-2620 shows a confirmed refund, but the customer reply says actions were submitted and approval might be needed. `_outcome` prefers the Resolver's pre-execution message. | Produce the customer receipt from confirmed execution state; separately describe completed, proposed, failed and scheduled actions. Verify automatic resolution, approval and partial-failure replies. |
| P0 | Six recon cases were queued with no working cases in the inspected desk. `supervisor.loop` gates RECON on synthetic-arrival autopilot; the UI says arrivals are independent and provides no per-case start action. | Make processing policy explicit and consistent. Preferred: recon processes whenever capacity is available, independent of generated arrivals. Test with arrivals off. |
| P1 | The demo opens Aarav's routine payments; story presets can point to transactions already resolved by previous demos. | Give guided visitors a clear scenario entry and disclose existing outcomes. Introduce an isolated, resettable demo session before promising a fresh run. Never reset shared cases behind another viewer. |
| P1 | The workflow map lists roles and call counts but makes the crucial decision hard to spot. | Above the graph, surface the latest evidence and the next action with its reason and source. Keep raw tool responses expandable. The viewer should explain why the route changed after reading one sentence. |
| P1 | Resolution proof competes with a large map and a long narrow report. Mobile puts inspection below the workflow. | Prioritize the decision panel during approval and the verified receipt at completion. Use explicit Workflow / Evidence / Outcome views on narrow screens; keep the case context visible. |
| P1 | Long-running model sessions lack an overall wall-clock timeout in `agent_codex.py`. | Bound agent duration, show last activity and recovery status, and release capacity on timeout. Preserve confirmed actions; never blindly retry a financial write. Test a stalled subprocess. |
| P1 | Stream effects reset on status changes, and follow mode can move readers away from evidence they are inspecting. | Keep one stable stream per run, reconnect after a real resume, and make inspection versus following explicit. Check completion, approval, reconnect and replay. |
| P1 | The landing hero animates a fixed historical run with a working indicator; generic copy promises every payment resolves before the deadline. | Label the animation as an illustrated recorded run and scope claims to demonstrated outcomes. Iteration 1 corrects the most visible claims. |
| P1 | Token usage and zero reported marginal cost are presented as business-plan inputs without allocated costs. | Separate measured tokens/time from subscription allocation, infrastructure, reviewer time and future deployment assumptions. Zero per-call billing is not zero cost to operate. |
| P1 | Sponsor screenshots show activity but no focused before/after improvement story. | Use one failure and its fix: linked neatlogs traces, comparable measurements, Entire checkpoint, and the resulting customer impact. |
| P2 | Documentation describes the old handoff and recon behavior while current source differs. | Treat source plus executed tests as authoritative; update docs with each bounded iteration and clearly distinguish simulated UI checks from live model runs. |

## Integration decisions

### cfo.ai — required, do this before optional sponsor expansion

The official event requires a business plan, not a cfo.ai agent inside each complaint. The official remote MCP endpoint is
`https://api.cfo.ai/mcp`; workspace authorization is required. No cfo.ai tools are available in this session, and the
project MCP configuration lists DisputePro and Entire only. The user confirmed that a workspace exists. The official
`cfoai` server has now been added to the global Codex configuration; OAuth authorization completed successfully. The business plan
is not yet created. `docs/cfo-inputs.json` contains a captured aggregate metrics snapshot and its limitations.

Use measured run history as inputs and label assumptions separately. Model a bank subscription plus usage pricing,
reviewer costs, infrastructure, model/subscription allocation, implementation cost and sales ramp. Produce base/upside/
downside scenarios, gross margin and runway. Link the actual cfo.ai model and explain what business decision changed.

Correct the existing ledger's economics semantics before using it to claim profitability. A locally generated plan is
preparation, not completion of the cfo.ai requirement.

Sources: [event requirements](https://neatlogs.com/hackathon),
[cfo.ai MCP documentation](https://docs.cfo.ai/integrations/mcp-server).

### Crustdata — feasible only with a useful, defensible question

A Crustdata key is configured in `backend/.env`; its value was not displayed and API validity was not tested in this review.
Crustdata is an optional credits partner, not one of the three required tools listed in the judging requirement.

Its Company Identify API resolves names/domains to candidate companies, with match metadata. A plausible product use is
merchant identity enrichment when the complaint includes a real business domain and bank/acquirer data supplies a trusted
merchant association. Show the match, ambiguity and source. Missing business data must not become a fraud verdict, and a
UPI handle's bank suffix must not be treated as the merchant's website.

The current synthetic merchants do not provide that trusted identity link. Do not attach a real company profile to a
fictional merchant just to light up a sponsor logo. An alternative is using Crustdata company research to inform the
customer segment and sales assumptions in the cfo.ai business plan. Choose one use only after it changes a real decision.

Source: [Company Identify](https://docs.crustdata.com/company-docs/identify/introduction).

## Iterations and review gates

1. **Entry and guidance:** repair handoff; opt-in guide; no overlays hiding controls; truthful recorded-run label.
   Gate: cancel, send-once, missing draft, mobile, direct visit, early closure and failure guidance.
2. **Trustworthy outcome:** repair receipt generation and recon processing; isolate fresh demo data; add stalled-agent recovery.
   Gate: real refund, fraud approval, already-resolved claim and bank outage each end in a consistent receipt or explicit escalation.
3. **Readable agent work:** evidence → decision → action presentation; calmer follow behavior; approval/receipt get sufficient space.
   Gate: a first-time viewer can identify what changed, why, and what awaits a person.
4. **Business and sponsor proof:** cfo.ai plan using corrected economics; neatlogs before/after; Entire checkpoint. Add Crustdata only
   where its result informs merchant identity or business planning, with the limitations above.
5. **Submission rehearsal:** a short, reproducible walkthrough centered on one difficult case, with an honest fallback to recorded
   events if a provider is unavailable. Link raw evidence; publish only with the user's authorization.

## Review evidence

- Inspected landing, customer and desk in headless Chrome at 1440 × 1000; reproduced mobile tour at 390 × 844.
- Mobile tour card occupied y=599–832 while the requested message field began at y=1137; guidance did not bring the action into view.
- Browser inspection produced no JavaScript page errors. The problems are primarily journey, state and information design.
- No new live agent case was submitted during the read-only audit; observed outcomes came from existing recorded cases.
- Iteration 1 verification is recorded in `hackathon.md` after the checks complete.
