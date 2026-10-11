"""Bank-ledger workflow: one master, three specialists, mandatory policy gate."""
import json
import config
import tracing
from . import agents, rules, tools as T
from .orchestrator import _dispatch, _resolve_and_execute, _finish, snapshot
from .llm import run_agent


def chain_from_evidence(run):
    ev=run.facts.get('evidence', {}); utr=run.case['utr']
    st=ev.get('npci',{}).get(utr,{})
    if not st: return None
    reason=(st.get('credit_leg_reason') or '').lower()
    loc=('remitter' if 'remitter reversal' in reason else 'npci' if 'npci routing' in reason else 'receiver')
    if run.facts.get('findings',{}).get('case_type')=='UNCLEAR': loc='unconfirmed'
    return {'remitter':st.get('remitter_bank'),'receiver':st.get('beneficiary_bank'), 'failure_at':loc,
            'reason':st.get('credit_leg_reason'),'debit':st.get('debit_leg'),'credit':st.get('credit_leg'),
            'source':'NPCI status, checked against core banking and beneficiary evidence'}


async def governance(run):
    """Code-enforced audit: a model statement alone cannot clear the execution gate."""
    f=run.facts['findings']; ct=f['case_type']; utr=f['disputed_utr']
    rule=rules.RULEBOOK[ct]
    st=run.facts.get('evidence',{}).get('npci',{}).get(utr)
    if not st: raise ValueError('Governance blocked: NPCI source evidence is missing')
    if utr != run.case['utr']:
        raise ValueError('Governance blocked: findings refer to a different ledger transaction')
    inward = st['beneficiary_bank'] == 'Sahyadri Bank'
    if ct == 'INWARD_NOT_CREDITED' and not inward:
        raise ValueError('Governance blocked: bank does not own the inward suspense')
    if ct in ('P2P_NOT_CREDITED', 'P2M_NOT_CONFIRMED') and st['remitter_bank'] != 'Sahyadri Bank':
        raise ValueError('Governance blocked: bank cannot reverse another bank debit')

    ruling=run.facts.get('ruling')
    if not ruling: raise ValueError('Governance blocked: policy ruling is missing')
    pos=rules.tat_position(ct,st['initiated_at'],st.get('reversal_at'),rules.datetime.now(rules.IST))
    if ruling.get('case_type') != ct or ruling['compensation_due_paise'] != pos['compensation_paise']:
        raise ValueError('Governance blocked: compensation differs from the deterministic rulebook')
    audit={'status':'hold' if ct=='UNCLEAR' else 'passed','rule':rule['source'],
           'checked_at':rules.datetime.now(rules.IST).isoformat(), 'tat':pos.get('tat'), 'deadline_at':pos.get('deadline_at'),
           'compensation_paise':pos['compensation_paise'], 'bank_role':run.case.get('role'),
           'checks':['Source evidence present','RBI applicability assessed','Deadline and compensation recomputed',
                     'Bank authority scoped','Execution requires fresh evidence and idempotency checks'],
           'reason':'Conflicting records require manual investigation' if ct=='UNCLEAR' else 'Policy gate passed; execution controls still apply'}
    run.facts['governance']=audit
    await run.step('policy','guard','Mandatory RBI governance check',audit['reason'],status='warn' if ct=='UNCLEAR' else 'ok',pause=0)
    await run.emit('governance',audit=audit)


@tracing.span('WORKFLOW','bank_ledger_resolution')
async def orchestrate_bank(run):
    run.trace_url=tracing.trace_url()
    await run.emit('run_started',run_id=run.id,case=run.case,brain=run.brain,brain_label=config.brain_label(),model=config.model_name() if run.brain!='rules' else None,trace_url=run.trace_url)
    await run.node('orchestrator','running',activity='Taking the next exception from the bank ledger',pause=0)
    run.facts['before']=await snapshot(run)
    await run.emit('before',before=run.facts['before'])
    instructions='Find where this ledger exception failed: remitter, NPCI or receiving bank. Query source systems; do not infer success from a single contradictory record.'
    if run.brain!='rules':
        route=T.Tool('submit_route','Assign this ledger case to the three specialists in the required order.',T._obj({'investigation':{'type':'string'},'reason':{'type':'string'}},['investigation','reason']))
        plan=await tracing.span('AGENT','orchestrator')(run_agent)(run,'orchestrator','You are the master agent for one bank. Route a failed UPI ledger entry to Investigator, RBI Policy, then Resolver. Policy is mandatory. You cannot move money or act for another bank. Give a concise investigation instruction and reason, then call submit_route immediately.',[route],json.dumps(run.case),'submit_route')
        instructions=plan['investigation']
        await run.step('orchestrator','plan','Dispatch Investigator → RBI Policy → Resolver',plan['reason'],pause=0)
    else:
        await run.step('orchestrator','plan','Dispatch Investigator → RBI Policy → Resolver','Rules verification run; no model inference is claimed.',pause=0)
    await _dispatch(run,'investigator',instructions)
    ev=run.facts['evidence'];utr=run.case['utr'];st=ev.get('npci',{}).get(utr,{})
    credit=ev.get('bene_credit',{}).get(utr,{})
    if st.get('tcc') and credit.get('status')=='NOT_CREDITED':
        run.facts['findings'].update(case_type='UNCLEAR',summary='NPCI reports credit confirmation but the beneficiary ledger says not credited. Financial action is blocked pending reconciliation.')
        await run.step('investigator','guard','Conflicting source records','NPCI TCC and beneficiary credit ledger disagree. Send to manual investigation, never issue a speculative refund.',status='warn',pause=0)
    run.facts['chain']=chain_from_evidence(run)
    await run.emit('bank_chain',chain=run.facts['chain'])
    await _dispatch(run,'policy','Mandatory RBI audit: establish applicability, compute T+1/T+5 and compensation from source timestamps. For unclear records hold financial action.')
    await governance(run)
    if run.facts['findings']['case_type']=='UNCLEAR':
        await run.node('resolver','running',activity='Preparing manual investigation handoff',pause=0)
        if run.brain!='rules':
            tool=T.Tool('submit_manual_review','Record a non-financial handoff; no payment actions allowed.',T._obj({'reason':{'type':'string'}},['reason']))
            result=await tracing.span('AGENT','resolver')(run_agent)(run,'resolver','You are the Resolution agent. Source records conflict and governance has blocked financial action. Give the analyst a concise reconciliation task and call submit_manual_review. Do not propose money movement.',[tool],json.dumps(run.facts['findings']),'submit_manual_review')
            await run.step('resolver','decision','Manual investigation required',result['reason'],status='warn',pause=0)
        run.status='ESCALATED'
        await run.node('resolver','done',activity='Manual investigation · no money moved',pause=0)
    elif run.facts['findings']['case_type'] in ('ALREADY_RESOLVED','CREDIT_CONFIRMED'):
        await run.node('resolver','done',activity='No further financial action is warranted',pause=0)
    else:
        await _resolve_and_execute(run,'Resolve only within Sahyadri Bank authority. Apply approval limits; keep the case-file note in plain English. No customer chat is needed.')
    await run.node('orchestrator','done',activity='Evidence, governance and resolution recorded',pause=0)
    await _finish(run,{})
