"""Single-bank ledger queue. One run at a time; no customer messaging."""
import asyncio
import json
import logging
import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import config
from sandbox import db
from engine.run import Run
from engine.bank_workflow import orchestrate_bank
from engine.orchestrator import decide
from . import bank_seed, store, supervisor

router = APIRouter(prefix='/api/bank', tags=['Bank ledger'])
log = logging.getLogger('bank')
STATE = {'enabled': False, 'active_case_id': None, 'started_at': None, 'batch_left': 0, 'batch_size': config.BANK_BATCH_SIZE}
_init_lock = asyncio.Lock()
_work_lock = asyncio.Lock()
_initialized = False


def cases():
    today = db.iso(db.now())[:10]
    rows = [store._enrich(r) for r in db.q("SELECT * FROM desk_cases WHERE id LIKE 'BK-%'")]
    return sorted(rows, key=lambda c: (c['created_at'][:10] != today, c['created_at'], c['id']))


def persist(run):
    payload = {k: getattr(run, k) for k in ('case', 'brain', 'facts', 'pending_plan', 'usage', 'calls', 'trace_url', 'status', '_seq')}
    payload['elapsed_ms'] = run.ms()
    db.ex('INSERT OR REPLACE INTO bank_run_state VALUES (?,?)', run.id, json.dumps(payload, default=str))


def restore(run_id):
    if run_id in supervisor.RUNS:
        return supervisor.RUNS[run_id]
    saved = db.q1('SELECT payload FROM bank_run_state WHERE run_id=?', run_id)
    if not saved:
        raise HTTPException(409, 'Approval checkpoint is unavailable. Manual reconciliation is required.')
    data = json.loads(saved['payload'])
    run = Run(data['case'], data['brain'], 0)
    run.id = run_id
    for key, val in data.items():
        if key != 'elapsed_ms': setattr(run, key, val)
    run.t0 = time.monotonic() - data['elapsed_ms']/1000
    run.history = [json.loads(r['event']) for r in db.q('SELECT event FROM desk_events WHERE run_id=? ORDER BY seq', run_id)]
    run.closed = True
    supervisor.RUNS[run_id] = run
    return run


def new_run(c, brain=None):
    case = {**supervisor._run_case(c), 'bank_ledger': True}
    run = Run(case, brain or config.brain(), 0)
    supervisor.RUNS[run.id] = run
    store.update_case(c['id'], status='WORKING', run_id=run.id)
    return run


async def drive(run, work):
    try:
        # A slow/downstream call cannot strand the ledger indefinitely. Never retry
        # potentially partial financial work automatically after this boundary.
        await asyncio.wait_for(work, timeout=180)
        outcome = run.facts['outcome']
        supervisor._apply(run, run.case['id'], outcome)
        if outcome.get('status') not in ('RESOLVED', 'CLOSED', 'AWAITING_APPROVAL'):
            store.update_case(run.case['id'], status='ESCALATED')
    except (Exception, asyncio.CancelledError) as exc:
        reason = ('Run exceeded its processing limit; reconcile recorded actions before continuing.'
                  if isinstance(exc, TimeoutError) else str(exc) or 'Run interrupted; reconciliation required.')
        log.warning('Bank case %s interrupted: %s', run.case['id'], reason)
        actions = run.facts.get('validation', {}).get('approved', [])
        outcome = {'status': 'ESCALATED', 'headline': 'Investigation required', 'summary': reason,
                   'case_type': run.facts.get('findings', {}).get('case_type', 'UNKNOWN'),
                   'findings': run.facts.get('findings', {'summary': reason, 'evidence': []}),
                   'actions': actions, 'rejected': [], 'ruling': run.facts.get('ruling'),
                   'governance': run.facts.get('governance'), 'chain': run.facts.get('chain'),
                   'trace_url': run.trace_url, 'usage': run.usage,
                   'ops': {'seconds': round(run.ms()/1000, 1), 'api_calls': len(run.calls), 'human_touches': 0}}
        run.status = 'ESCALATED'
        run.facts['outcome'] = outcome
        store.update_case(run.case['id'], status='ESCALATED', headline=outcome['headline'], outcome=outcome)
        await run.emit('run_failed', error=reason, outcome=outcome)
        if isinstance(exc, asyncio.CancelledError): raise
    finally:
        persist(run)
        run.close()


async def ensure_seed():
    global _initialized
    if _initialized: return
    async with _init_lock:
        if _initialized: return
        bank_seed.seed()
        # These are explicitly labelled pre-reviewed fixtures. They perform real
        # sandbox reads and validation but never execute the held payment plans.
        for cid in ('BK-021', 'BK-022'):
            c = store.get_case(cid)
            if c['status'] == 'QUEUED':
                run = new_run(c, 'rules')
                run.case['pre_reviewed_fixture'] = True
                await drive(run, orchestrate_bank(run))
        _initialized = True


@router.get('/ledger')
async def ledger_view():
    await ensure_seed()
    rows = cases()
    counts = {'all': len(rows), 'queued': 0, 'approval': 0, 'investigate': 0, 'completed': 0}
    for c in rows:
        group = {'QUEUED': 'queued', 'NEEDS_YOU': 'approval', 'RESOLVED': 'completed',
                 'ESCALATED': 'investigate', 'FAILED': 'investigate', 'NEEDS_INFO': 'investigate'}.get(c['status'])
        if group: counts[group] += 1
    return {'cases': rows, 'counts': counts, 'queue': STATE, 'model': config.model_name(),
            'brain': config.brain(), 'bank': db.OUR_BANK, 'target_seconds': 60, 'target_range': [60,90]}


class QueueRequest(BaseModel):
    on: bool


@router.post('/queue')
async def queue(req: QueueRequest):
    await ensure_seed()
    STATE['enabled'] = req.on
    # Each press works a small batch, then the queue switches itself off.
    STATE['batch_left'] = config.BANK_BATCH_SIZE if req.on else 0
    return dict(STATE)


@router.post('/reset')
async def reset_ledger():
    """Put every ledger transaction back to queued: fresh sandbox records, no runs."""
    global _initialized
    if _work_lock.locked():
        raise HTTPException(409, 'Wait for the active case to finish before resetting the ledger')
    STATE.update(enabled=False, active_case_id=None, started_at=None, batch_left=0)
    for rid in [k for k, r in supervisor.RUNS.items() if r.case.get('bank_ledger')]:
        supervisor.RUNS.pop(rid, None)
    db.reset()
    _initialized = False
    await ensure_seed()
    return await ledger_view()


class DecisionRequest(BaseModel):
    approve: bool
    reviewer: str = Field(min_length=2, max_length=80)
    reason: str = Field(default='', max_length=500)


@router.post('/cases/{cid}/decision')
async def decision(cid: str, req: DecisionRequest):
    await ensure_seed()
    c = store.get_case(cid) if cid.startswith('BK-') else None
    if not c: raise HTTPException(404, 'Bank ledger case not found')
    if c['status'] != 'NEEDS_YOU': raise HTTPException(409, 'This case is not awaiting approval')
    if len(req.reviewer.strip()) < 2: raise HTTPException(422, 'Enter a reviewer name')
    if not req.approve and not req.reason.strip(): raise HTTPException(422, 'Add a reason for investigation')
    if _work_lock.locked(): raise HTTPException(409, 'Pause the queue and wait for the active case before reviewing this payment')
    async with _work_lock:
        # Recheck after acquiring serialization lock.
        if store.get_case(cid)['status'] != 'NEEDS_YOU': raise HTTPException(409, 'Decision already recorded')
        run = restore(c['run_id'])
        if not run.pending_plan: raise HTTPException(409, 'No held plan to approve')
        run.facts['review_reason'] = req.reason.strip()
        run.closed = False
        store.update_case(cid, status='WORKING')
        STATE.update(active_case_id=cid, started_at=db.iso(db.now()))
        try:
            await drive(run, decide(run, req.approve, req.reviewer.strip()))
        finally:
            STATE.update(active_case_id=None, started_at=None)
    return store.get_case(cid)


async def loop():
    while True:
        if STATE['enabled'] and not _work_lock.locked():
            try:
                await ensure_seed()
                async with _work_lock:
                    c = next((c for c in cases() if c['status']=='QUEUED'), None)
                    if not c:
                        STATE['enabled'] = False
                    else:
                        STATE.update(active_case_id=c['id'], started_at=db.iso(db.now()))
                        run = new_run(c)
                        try:
                            await drive(run, orchestrate_bank(run))
                        finally:
                            STATE.update(active_case_id=None, started_at=None)
                            STATE['batch_left'] -= 1
                            if STATE['batch_left'] <= 0:
                                STATE.update(enabled=False, batch_left=0)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception('Bank queue tick failed')
                STATE['enabled'] = False
            # Brief receipt dwell, independent of actual run timing.
            await asyncio.sleep(3)
        else:
            await asyncio.sleep(.4)
