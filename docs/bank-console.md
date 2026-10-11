# Bank desk — product contract

The current product. Code: `frontend/app/console/` and `backend/desk/bank.py`.

## Scope

One bank's failed-UPI ledger. Cases come from the bank's exceptions ledger, not from customers. The home page has a
single destination, the bank desk. Bank runs never message customers.

## Layout

- **Left:** the ledger. Filters (All cases · Approval · Investigate · Completed), rows grouped by day: today first,
  then earlier days newest first. Footer shows how many are queued and the batch size.
- **Right, top to bottom:** case header with **Run agents** → payment chain (remitter → NPCI → receiver, failure
  marked) → agent workspace (master, then Investigator, RBI Policy, Resolver, each with its own tint) → RBI governance
  → Actions & resolution (approval form when held) → Source evidence and the full agent activity log.
- Both columns scroll independently; the page itself does not. Phones stack the ledger above the workspace.
- Type floor: 14px body, 11px for uppercase labels only.

## Queue

States: `QUEUED → WORKING → RESOLVED | NEEDS_YOU | ESCALATED`.

- Nothing runs on its own. **Run agents** works the next `BANK_BATCH_SIZE` queued cases (default 3) one at a time,
  then switches the queue off. While running, the button reads "Pause · case n of 3"; pausing finishes the active case.
- The desk selects each case as the agents pick it up. There is no Follow live toggle.
- `POST /api/bank/reset` restores a fresh ledger: 20 queued plus the two held approvals (T21, T22). Those two are
  re-created by the rules verifier, not the model, and are labelled that way.

## Decisions

- Master routes; Investigator reads real sandbox adapters; RBI Policy always runs and a deterministic gate checks it;
  Resolver proposes; the execution engine re-verifies and executes or holds.
- Payouts above ₹10,000 need a reviewer. Approval re-validates the exact actions; changed credit evidence blocks them.
  Sending to investigation needs a reason and moves no money.
- A proposed action is never shown as executed. Confirmed references stay visible after a partial failure.
- Held approvals survive a restart; work interrupted mid-run goes to investigation.

## Claims

- 60–90 seconds per case is a target. Recorded sandbox runs: 62.1s (outward refund), 64.1s (inward return).
- ₹100 per eligible overdue day is customer compensation under the RBI TAT circular, not a blanket fine.
- Per-case evidence is limited to payment sources (core banking, NPCI, other bank, acquirer, NCRP), the policy result,
  execution references and the neatlogs trace. Entire, cfo.ai and Crustdata appear only as build and business evidence.
