"""Master orchestrator. As an LLM it routes the case by dispatching agents as tools; code enforces the
ordering constraints (no Policy before evidence, no Resolver before a ruling) and owns execution."""

import json
import time

import config
import tracing

from datetime import datetime

from . import agents, executor, rules
from .caseinfo import case_fields
from .intake import intake
from .llm import run_agent
from .parties import _client as http
from .run import Run
from .tools import SWEEP_TOOL, Tool, _obj, rs

O = "orchestrator"
AGENT_LABEL = {"investigator": "Investigator", "policy": "Policy", "resolver": "Resolver"}
NO_FAULT = ("CREDIT_CONFIRMED", "ALREADY_RESOLVED")

ORCHESTRATOR_SYSTEM = f"""You are the Master Orchestrator of Sahyadri Bank's UPI dispute desk.
You coordinate three specialist agents and never touch bank systems yourself:
- Investigator: gathers evidence from core banking, NPCI, beneficiary bank, acquirer, NCRP; classifies the case.
- Policy: applies RBI rules; computes exactly what the bank owes and who is liable.
- Resolver: scores fraud risk and proposes actions; a guardrailed execution engine validates and executes them
  (or holds them for human approval).

Route on evidence, never on the customer's claim:
0. If the case came from the reconciliation sweep, call reconciliation_sweep for its settlement date first and confirm the UTR is an exception.
1. Always dispatch the Investigator first.
2. If the case is CREDIT_CONFIRMED or ALREADY_RESOLVED, nothing is owed: skip Policy and Resolver and close the case.
3. If UNCLEAR, close with status ESCALATED.
4. Otherwise dispatch Policy, then Resolver, then close the case.
Before each dispatch, say in one sentence why. Give each agent a specific instruction. Finish with close_case.
If you close without the Resolver (nothing owed, already refunded, credit confirmed), write customer_message yourself."""


def _orch_tools() -> list[Tool]:
    instr = _obj({"instructions": {"type": "string", "description": "Specific instruction for the agent"}}, ["instructions"])
    return [
        Tool("dispatch_investigator", "Send the case to the Investigator agent. Returns its findings.", instr),
        Tool("dispatch_policy", "Send findings to the Policy agent. Returns the ruling. Requires findings.", instr),
        Tool("dispatch_resolver", "Send findings + ruling to the Resolver. Returns the validated plan and execution status.", instr),
        Tool("close_case", "Close the case with a headline and summary for the bank's case file.",
             _obj({"headline": {"type": "string", "description": "Under 8 words"},
                   "summary": {"type": "string", "description": "2 sentences for the case file"},
                   "customer_message": {"type": "string", "description": "If the Resolver did not run: a short, warm reply to the "
                                        "customer in exactly the language and script they wrote in (Hindi stays Hindi, Hinglish stays Hinglish), explaining what happened to their money"}},
                  ["headline", "summary"])),
    ]


async def _dispatch(run: Run, agent: str, instructions: str) -> dict:
    await run.node(O, "running", activity=f"Handing off to {AGENT_LABEL[agent]}", pause=0.2)
    await run.edge(f"orchestrator>{agent}", "active", pause=0.5)
    await run.node(agent, "running", activity="Starting", pause=0.3)
    await run.step(agent, "handoff", "From the Orchestrator", instructions, pause=0.4)
    t = time.monotonic()
    fn = {"investigator": agents.investigator, "policy": agents.policy, "resolver": agents.resolver}[agent]
    out = await tracing.span("AGENT", agent)(fn)(run, instructions)
    summary = _agent_summary(run, agent, out)
    await run.node(agent, "done", activity=summary, duration_ms=int((time.monotonic() - t) * 1000), pause=0.2)
    await run.edge(f"orchestrator>{agent}", "taken", pause=0.3)
    await run.node(O, "running", activity=f"Reviewing {AGENT_LABEL[agent]} output", pause=0.2)
    return out


CASE_LABEL = {
    "P2P_NOT_CREDITED": "Deemed · never credited", "INWARD_NOT_CREDITED": "Inward credit stuck in suspense",
    "P2M_NOT_CONFIRMED": "Merchant never confirmed", "DUPLICATE_DEBIT": "Duplicate debit", "AUTHORISED_FRAUD": "Authorised fraud",
    "CREDIT_CONFIRMED": "Credit confirmed · no failure", "ALREADY_RESOLVED": "Already resolved", "UNCLEAR": "Records conflict",
}


def _agent_summary(run: Run, agent: str, out: dict) -> str:
    if agent == "investigator":
        return CASE_LABEL.get(out["case_type"], out["case_type"])
    if agent == "policy":
        pos = (run.facts.get("tat") or {}).get(run.facts["findings"]["disputed_utr"])
        if pos and pos.get("applies"):
            return f"{pos['tat']} deadline · {rules.human_left(pos['seconds_left'])}"
        return "No deadline penalty applies"
    return f"{len(out['actions'])} action(s) planned"


async def _resolve_and_execute(run: Run, instructions: str) -> dict:
    plan = await _dispatch(run, "resolver", instructions)
    await run.node("resolver", "running", activity="Execution engine validating plan", pause=0.2)
    await run.edge("resolver>executor", "taken")
    v = await executor.validate(run, plan)
    run.facts["validation"] = v
    if v["needs_human"]:
        run.pending_plan = v
        await run.node("executor", "waiting", activity="Guardrails require human approval", pause=0)
        await run.node("resolver", "done", activity="Plan held for human approval", pause=0.2)
        return {"status": "AWAITING_APPROVAL", "reason": v["human_reason"], "approved_actions": v["approved"], "rejected": v["rejected"]}
    await executor.execute(run, v["approved"])
    await run.node("resolver", "done", activity=f"{len(v['approved'])} action(s) executed", pause=0.2)
    return {"status": "EXECUTED", "actions": v["approved"], "rejected": v["rejected"], "payout_paise": v["payout_paise"]}


async def snapshot(run: Run) -> dict | None:
    try:
        r = await http.get(f"{config.PARTY_BASE_URL}/snapshot", params={"customer_id": run.case["customer_id"], "utr": run.case["utr"]})
        return r.json() if r.status_code == 200 else None
    except Exception:
        return None


@tracing.span("WORKFLOW", "resolve_upi_dispute")
async def orchestrate(run: Run):
    c = run.case
    run.trace_url = tracing.trace_url()
    await run.emit("run_started", run_id=run.id, case=c, brain=run.brain, brain_label=config.brain_label(), model=config.model_name(),
                   trace_url=run.trace_url, before=None)
    sweep = c["trigger"] == "sweep"
    await run.node("complaint", "done", activity=(f"Recon sweep · {c['settlement_date']}" if sweep else f"{c['channel']} · {c['customer_name']}"), pause=0.3)

    # Intake: a free-text complaint has no UTR yet. Find the payment the customer means, or ask them.
    if not c.get("utr"):
        await run.edge("complaint>intake", "active")
        with tracing.child("intake", "AGENT", inp=c["complaint"]) as sp:
            found = await intake(run)
            tracing.finish(sp, found)
        await run.edge("complaint>intake", "taken")
        if not found.get("utr"):
            run.status = "NEEDS_INFO"
            outcome = {"status": "NEEDS_INFO", "headline": "Asked the customer for one detail", "summary": found["summary"],
                       "customer_message": found.get("question_for_customer") or "Which payment is this about? Please share the amount and the payee.",
                       "actions": [], "rejected": [], "usage": run.usage, "deadline": None, "after": None}
            run.facts["outcome"] = outcome
            await run.emit("run_finished", outcome=outcome)
            return
        c.update(case_fields(found["utr"]))
        c["intake_summary"] = found["summary"]
        await run.emit("case_updated", case=c)
    else:
        await run.node("intake", "skipped", activity="Found by the reconciliation sweep" if sweep else "The UTR came with the complaint", pause=0.1)
    run.facts["before"] = await snapshot(run)
    await run.emit("before", before=run.facts["before"])
    entry = "intake>orchestrator" if c.get("intake_summary") else "complaint>orchestrator"
    await run.edge(entry, "active", pause=0.6)
    await run.edge(entry, "taken")
    await run.node(O, "running", activity="Running reconciliation sweep" if sweep else "Reading complaint", pause=0.3)
    t0 = time.monotonic()
    dispatched: list[str] = []
    closing: dict = {}

    if run.brain != "rules":
        async def orch_tool(name: str, inp: dict):
            agent = name.removeprefix("dispatch_")
            if agent == "policy" and "findings" not in run.facts:
                return {"error": "Dispatch the Investigator first."}
            if agent == "resolver" and "ruling" not in run.facts:
                return {"error": "Dispatch Policy before the Resolver."}
            if agent in dispatched:
                return {"error": f"{agent} already ran; use its output."}
            dispatched.append(agent)
            if agent == "resolver":
                return await _resolve_and_execute(run, inp["instructions"])
            return await _dispatch(run, agent, inp["instructions"])

        tools = _orch_tools()
        for t in tools[:3]:
            t.fn = (lambda name: (lambda r, n, inp: orch_tool(name, inp)))(t.name)
        if sweep:
            tools.insert(0, SWEEP_TOOL)
        origin = (f"Raised by the reconciliation sweep for settlement date {c['settlement_date']} (no complaint yet)." if sweep
                  else f"Customer complaint: \"{c['complaint']}\"")
        task = f"Case for {c['customer_name']} (customer id {c['customer_id']}), UTR {c['utr']}.\n{origin}"

        def check(inp):
            return None if "findings" in run.facts else "Dispatch the Investigator before closing."

        with tracing.child("orchestrator", "AGENT", inp=task, **{"case.id": c["id"], "case.utr": c["utr"]}) as sp:
            closing = await run_agent(run, O, ORCHESTRATOR_SYSTEM, tools, task, "close_case", validate=check)
            tracing.finish(sp, closing)
    else:
        if sweep:
            await run.step(O, "think", "Reconciliation sweep", f"Match NPCI's settlement file for {c['settlement_date']} against our switch and core banking. "
                           "Exceptions are what turn into penalties.", pause=0.7)
            await SWEEP_TOOL.fn(run, O, {"settlement_date": c["settlement_date"]})
            await run.step(O, "plan", "Exception → Investigator", f"UTR {c['utr']} has no clean outcome. The deadline clock is running. Send to the Investigator.", pause=0.6)
        else:
            await run.step(O, "think", "Read the complaint", f"\u201c{c['complaint']}\u201d", pause=0.8)
            await run.step(O, "plan", "Evidence first → Investigator", "The claim is a lead, not evidence. Send to the Investigator first.", pause=0.6)
        dispatched.append("investigator")
        f = await _dispatch(run, "investigator", "Establish what happened to this UTR")
        ct = f["case_type"]
        if ct in NO_FAULT or ct == "UNCLEAR":
            why = "Records show nothing is owed" if ct in NO_FAULT else "Records conflict"
            contradiction = " — the customer's claim doesn't match the records" if not f["claim_matches_evidence"] else ""
            await run.step(O, "decision", "Nothing owed → close", f"{why}{contradiction}. Skip Policy and Resolver.", status="info", pause=0.8)
        else:
            await run.step(O, "plan", f"{CASE_LABEL.get(ct, ct)} → Policy, Resolver", "Policy sets the deadline, then Resolver acts.", pause=0.6)
            dispatched.append("policy")
            await _dispatch(run, "policy", "Rule on this case")
            dispatched.append("resolver")
            await _resolve_and_execute(run, "Score risk and resolve")

    for a in ("policy", "resolver"):
        if a not in dispatched:
            await run.edge(f"orchestrator>{a}", "skipped")
            await run.node(a, "skipped", activity="Not needed for this case", pause=0.2)

    route = " → ".join(AGENT_LABEL[a] for a in dispatched)
    await run.node(O, "done", activity=f"Routed: {route}", duration_ms=int((time.monotonic() - t0) * 1000), pause=0.2)
    await _finish(run, closing)


def _outcome(run: Run, closing: dict) -> dict:
    f, r, v = run.facts["findings"], run.facts.get("ruling"), run.facts.get("validation")
    plan = run.facts.get("plan")
    ct, utr = f["case_type"], f["disputed_utr"]
    actions = (v or {}).get("approved", [])
    if ct in NO_FAULT and not actions:
        actions = [{"type": "SHARE_PROOF_OF_CREDIT" if ct == "CREDIT_CONFIRMED" else "MONITOR", "utr": utr,
                    "amount_paise": 0, "state": "done", "note": "Nothing owed"}]
    done = {a["type"] for a in actions if a["state"] == "done"}
    if run.pending_plan and run.status == "RUNNING":
        status = "AWAITING_APPROVAL"
    elif run.status == "ESCALATED" or ct == "UNCLEAR":
        status = "ESCALATED"
    elif done & {"REVERSE_DEBIT", "RETURN_TO_REMITTER"}:
        status = "RESOLVED"
    elif ct in NO_FAULT:
        status = "CLOSED"
    else:
        status = "ACTIONED"

    pos = (run.facts.get("tat") or {}).get(utr)
    deadline = None
    if pos and pos.get("applies"):
        left = int((datetime.fromisoformat(pos["deadline_at"]) - datetime.now(rules.IST)).total_seconds())
        deadline = {"tat": pos["tat"], "deadline_at": pos["deadline_at"], "seconds_left": left, "met": left > 0}
    penalty_paid = sum(a["amount_paise"] for a in actions if a["type"] == "PAY_TAT_COMPENSATION" and a["state"] == "done")
    refunded = sum(a["amount_paise"] for a in actions if a["type"] == "REVERSE_DEBIT" and a["state"] == "done")
    frozen = sum(a.get("frozen_paise", 0) for a in actions if a["type"] == "REQUEST_LIEN" and a["state"] == "done")
    spare = rules.human_left(deadline["seconds_left"]).replace(" left", "") if deadline else ""

    headline = {
        "AWAITING_APPROVAL": "Held for one-click approval",
        "ESCALATED": "Escalated to a specialist",
        "CLOSED": "Closed with proof · no chargeback" if ct == "CREDIT_CONFIRMED" else "Already resolved",
    }.get(status)
    if not headline:
        if ct == "INWARD_NOT_CREDITED":
            headline = f"Returned with {spare} to spare"
        elif ct in ("P2P_NOT_CREDITED", "P2M_NOT_CONFIRMED"):
            headline = f"Refunded with {spare} to spare" if not penalty_paid else f"Refunded late · {rs(penalty_paid)} paid"
        elif ct == "AUTHORISED_FRAUD":
            headline = f"{rs(frozen)} frozen before it moved"
        else:
            headline = "Actions executed"

    calls = [s for s in run.calls]
    return {
        "status": status,
        "headline": headline,
        "summary": (closing or {}).get("summary") or f["summary"],
        "case_type": ct,
        "findings": f,
        "ruling": r,
        "risk": run.facts.get("risk"),
        "actions": actions,
        "rejected": (v or {}).get("rejected", []),
        "human_reason": (v or {}).get("human_reason"),
        "deadline": deadline,
        "penalty_paid_paise": penalty_paid,
        "refunded_paise": refunded,
        "frozen_paise": frozen,
        "ops": {"api_calls": len(calls), "parties": sorted(set(calls)), "human_touches": 1 if run.facts.get("approved_by") else 0,
                "seconds": round(run.ms() / 1000, 1)},
        "customer_message": (plan or {}).get("customer_message") or closing.get("customer_message") or _proof_message(run, f),
        "citation": (r or {}).get("citation"),
        "usage": run.usage,
    }


def _proof_message(run: Run, f: dict) -> str:
    name = run.case['customer_name'].split()[0]
    if f["case_type"] == "ALREADY_RESOLVED":
        st = run.facts.get("evidence", {}).get("npci", {}).get(f["disputed_utr"]) or {}
        when = (st.get("reversal_at") or "")[:16].replace("T", " at ")
        return (f"Hi {name}, that payment didn't go through and the full amount was already returned to your account"
                f"{' on ' + when if when else ''}. Please check your statement; no further action is needed.")
    cr = run.facts.get("evidence", {}).get("bene_credit", {}).get(f["disputed_utr"])
    if f["case_type"] != "CREDIT_CONFIRMED" or not cr:
        return ""
    return (f"Hi {name}, your payment reached {cr['holder_name']} on "
            f"{cr['credited_at'][:16].replace('T', ' at ')} (bank ref {cr['credit_ref']}). Please share this reference with them.")


async def _finish(run: Run, closing: dict, via: str | None = None):
    outcome = _outcome(run, closing)
    if outcome["status"] == "AWAITING_APPROVAL":
        await run.edge("executor>human", "active", pause=0.6)
        await run.edge("executor>human", "taken")
        await run.node("human", "waiting", activity=outcome["human_reason"], pause=0.2)
        run.status = "AWAITING_APPROVAL"
    else:
        src = via or ("resolver" if run.facts.get("validation") else "orchestrator")
        if src == "resolver":
            await run.edge("executor>human", "skipped")
            await run.node("human", "skipped", activity="Within auto-approval limits", pause=0.1)
        if any(a.get("state") == "done" for a in outcome.get("actions", [])) and run.facts.get("validation"):
            src = "executor"
        await run.edge(f"{src}>outcome", "active", pause=0.6)
        await run.edge(f"{src}>outcome", "taken")
        await run.node("outcome", "done", activity=outcome["headline"], pause=0.2)
        run.status = outcome["status"]
    outcome["after"] = await snapshot(run)
    run.facts["outcome"] = outcome
    await run.emit("run_finished", outcome=outcome)


async def decide(run: Run, approve: bool, reviewer: str):
    v = run.pending_plan
    await run.emit("resume")
    await run.node("human", "running", activity=f"{reviewer} reviewing", pause=0.3)
    if not approve:
        await run.step("human", "decision", f"Rejected by {reviewer}", run.facts.get("review_reason") or "Plan cancelled; case moved to manual review.", status="bad", pause=0.6)
        for a in v["approved"]:
            a["state"] = "cancelled"
        await run.node("human", "done", activity="Rejected", pause=0.2)
        run.status = "ESCALATED"
        await _finish(run, {"headline": "Escalated to manual review", "summary": f"{reviewer} declined the proposed actions. {run.facts.get('review_reason', '')}"}, via="human")
        return
    # Approval authorizes the displayed plan, not an unbounded future version of it.
    fresh = await executor.validate(run, {"actions": v["approved"]})
    signature = lambda actions: sorted((a["type"], a["utr"], a["amount_paise"]) for a in actions)
    if signature(fresh["approved"]) != signature(v["approved"]):
        run.pending_plan = fresh
        run.facts["validation"] = fresh
        run.status = "RUNNING" if fresh["approved"] else "ESCALATED"
        fresh["human_reason"] = "Evidence or amounts changed since the proposal. Review the updated actions."
        await run.step("human", "decision", "Approval paused: evidence changed", fresh["human_reason"], status="warn")
        await _finish(run, {}, via="human")
        return
    run.pending_plan = fresh
    run.facts["validation"] = fresh
    v = fresh
    await run.edge("human>executor", "taken")
    run.facts["approved_by"] = reviewer
    await run.step("human", "decision", f"Approved by {reviewer}",
                   " · ".join(a["type"].replace("_", " ").lower() for a in v["approved"]), status="ok", pause=0.5)
    await executor.execute(run, v["approved"])
    await run.node("resolver", "done", activity=f"{len(v['approved'])} action(s) executed after approval", pause=0.1)
    await run.node("human", "done", activity=f"Approved · {len(v['approved'])} action(s) executed", pause=0.2)
    run.status = "APPROVED"
    await _finish(run, {}, via="human")
