"""Bank-ledger regression tests. All money movement uses isolated SQLite adapters."""
import asyncio
import json
import logging
import os
import tempfile
import unittest
from pathlib import Path

_tmp = tempfile.TemporaryDirectory(prefix='bank-desk-tests-')
os.environ['SANDBOX_DB'] = str(Path(_tmp.name)/'sandbox.db')
os.environ['LEDGER_PATH'] = str(Path(_tmp.name)/'ledger.db')
os.environ['LLM_PROVIDER'] = 'rules'
os.environ['NEATLOGS_API_KEY'] = ''

import httpx
import main
from desk import bank, bank_seed, store, supervisor
from engine import parties, executor
from engine.bank_workflow import orchestrate_bank
from engine.run import Run
from sandbox import db
logging.getLogger('httpx').setLevel(logging.WARNING)

class BankTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        db.reset()
        bank._initialized = False
        bank._init_lock = asyncio.Lock()
        bank._work_lock = asyncio.Lock()
        bank.STATE.update(enabled=False, active_case_id=None, started_at=None)
        bank._batch_starts.clear()
        bank._spend_cache.update(at=0.0, value=None)
        supervisor.RUNS.clear()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app),base_url='http://test')
        self.old_client = parties._client
        parties._client = self.client
        await bank.ensure_seed()

    async def asyncTearDown(self):
        parties._client = self.old_client
        await self.client.aclose()

    async def process(self, cid):
        run = bank.new_run(store.get_case(cid),'rules')
        await bank.drive(run,orchestrate_bank(run))
        return run, store.get_case(cid)

    async def test_initial_counts_and_seed_is_additive(self):
        initial = (await self.client.get('/api/bank/ledger')).json()
        self.assertEqual(initial['counts'],dict(all=22,queued=20,approval=2,investigate=0,completed=0))
        existing = len(store.list_cases())
        bank_seed.seed()
        self.assertEqual(len(store.list_cases()),existing)
        self.assertEqual(initial['cases'][0]['id'],'BK-001')
        for cid in ('BK-021','BK-022'):
            c=store.get_case(cid)
            self.assertTrue(all(a['state']=='proposed' for a in c['outcome']['actions']))
            self.assertFalse(db.q('SELECT * FROM cbs_postings WHERE utr_ref=?',c['utr']))

    async def test_all_twenty_routes_and_policy_precedes_execution(self):
        for i in range(1,21):
            run,c=await self.process(f'BK-{i:03d}')
            self.assertNotEqual(c['status'],'FAILED',c.get('outcome'))
            self.assertIsNotNone(c['outcome']['governance'])
            self.assertFalse(store.messages_for_case(c['id']))
            gates=[n for n,e in enumerate(run.history) if e['type']=='governance']
            self.assertEqual(len(gates),1)
            writes=[n for n,e in enumerate(run.history) if e['type']=='step' and e.get('http',{}).get('method')=='POST']
            self.assertTrue(all(n>gates[0] for n in writes))
        d=(await self.client.get('/api/bank/ledger')).json()
        self.assertEqual(d['counts'],dict(all=22,queued=0,approval=4,investigate=2,completed=16))
        for cid in ('BK-007','BK-017'):
            c=store.get_case(cid)
            self.assertEqual(c['outcome']['governance']['status'],'hold')
            self.assertFalse(db.q('SELECT * FROM cbs_postings WHERE utr_ref=?',c['utr']))

    async def test_approval_restores_after_restart_and_prevents_duplicates(self):
        supervisor.RUNS.clear()
        response=await self.client.post('/api/bank/cases/BK-021/decision',json={'approve':True,'reviewer':'Test analyst'})
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['status'],'RESOLVED')
        utr=response.json()['utr']
        self.assertEqual(db.q1("SELECT COUNT(*) n FROM cbs_postings WHERE utr_ref=? AND type='REVERSAL'",utr)['n'],1)
        again=await self.client.post('/api/bank/cases/BK-021/decision',json={'approve':True,'reviewer':'Test analyst'})
        self.assertEqual(again.status_code,409)
        supervisor.RUNS.clear()
        replay=await self.client.get(f"/api/runs/{response.json()['run_id']}/events")
        self.assertIn('Approved by Test analyst',replay.text)

    async def test_changed_credit_blocks_waiting_approval(self):
        c=store.get_case('BK-021')
        db.ex("UPDATE bene_credits SET status='CREDITED', credited_at=?, credit_ref='LATE-CREDIT' WHERE utr=?", db.iso(db.now()), c['utr'])
        response=await self.client.post('/api/bank/cases/BK-021/decision',json={'approve':True,'reviewer':'Test analyst'})
        self.assertEqual(response.json()['status'],'ESCALATED')
        self.assertIn('Credit evidence changed',response.json()['outcome']['summary'])
        self.assertFalse(db.q('SELECT * FROM cbs_postings WHERE utr_ref=?',c['utr']))

    async def test_decline_has_reason_and_never_moves_money(self):
        path='/api/bank/cases/BK-022/decision'
        bad=await self.client.post(path,json={'approve':False,'reviewer':'Test analyst'})
        self.assertEqual(bad.status_code,422)
        good=await self.client.post(path,json={'approve':False,'reviewer':'Test analyst','reason':'Reconcile against settlement report'})
        self.assertEqual(good.json()['status'],'ESCALATED')
        self.assertTrue(all(a['state']=='cancelled' for a in good.json()['outcome']['actions']))
        self.assertFalse(db.q('SELECT * FROM cbs_postings WHERE utr_ref=?',good.json()['utr']))

    async def test_policy_gate_cannot_be_bypassed(self):
        run=bank.new_run(store.get_case('BK-001'),'rules')
        with self.assertRaisesRegex(ValueError,'governance'):
            await executor.validate(run,{'actions':[]})
        with self.assertRaisesRegex(ValueError,'governance'):
            await executor.execute(run,[])
        run.close()
        old=await self.client.post('/api/desk/cases/BK-002/start')
        self.assertEqual(old.status_code,409)
        old=await self.client.post('/api/runs/'+store.get_case('BK-021')['run_id']+'/decision',json={'approve':True})
        self.assertEqual(old.status_code,409)

    async def test_queue_pause_finishes_only_active_case(self):
        await self.client.post('/api/bank/queue',json={'on':True})
        task=asyncio.create_task(bank.loop())
        try:
            for _ in range(200):
                if bank.STATE['active_case_id']: break
                await asyncio.sleep(.005)
            self.assertEqual(bank.STATE['active_case_id'],'BK-001')
            await self.client.post('/api/bank/queue',json={'on':False})
            for _ in range(400):
                if not bank.STATE['active_case_id']: break
                await asyncio.sleep(.005)
            self.assertEqual(store.get_case('BK-001')['status'],'RESOLVED')
            self.assertEqual(store.get_case('BK-002')['status'],'QUEUED')
        finally:
            task.cancel()
            await asyncio.gather(task,return_exceptions=True)

    async def test_run_agents_stops_after_one_batch(self):
        await self.client.post('/api/bank/queue',json={'on':True})
        task=asyncio.create_task(bank.loop())
        try:
            for _ in range(3000):
                if not bank.STATE['enabled'] and not bank.STATE['active_case_id']: break
                await asyncio.sleep(.01)
            import config
            n=config.BANK_BATCH_SIZE
            done=[c['id'] for c in bank.cases() if c['status']!='QUEUED' and c['id'] not in ('BK-021','BK-022')]
            self.assertEqual(done,[f'BK-{i:03d}' for i in range(1,n+1)])
            self.assertFalse(bank.STATE['enabled'])
            self.assertEqual(store.get_case(f'BK-{n+1:03d}')['status'],'QUEUED')
        finally:
            task.cancel()
            await asyncio.gather(task,return_exceptions=True)

    async def test_reset_returns_every_transaction_to_the_queue(self):
        await self.process('BK-001')
        self.assertEqual(store.get_case('BK-001')['status'],'RESOLVED')
        body=(await self.client.post('/api/bank/reset')).json()
        self.assertEqual(store.get_case('BK-001')['status'],'QUEUED')
        self.assertEqual(body['counts']['queued'],20)
        self.assertFalse(body['queue']['enabled'])

    async def test_run_agents_is_capped_per_hour(self):
        import config
        old=config.BANK_BATCHES_PER_HOUR
        config.BANK_BATCHES_PER_HOUR=1
        try:
            self.assertEqual((await self.client.post('/api/bank/queue',json={'on':True})).status_code,200)
            await self.client.post('/api/bank/queue',json={'on':False})
            r=await self.client.post('/api/bank/queue',json={'on':True})
            self.assertEqual(r.status_code,429)
            self.assertFalse(bank.STATE['enabled'])
        finally:
            config.BANK_BATCHES_PER_HOUR=old

    async def test_reset_needs_operator_token_when_set(self):
        import config
        old=config.OPERATOR_TOKEN
        config.OPERATOR_TOKEN='op-secret'
        try:
            self.assertEqual((await self.client.post('/api/bank/reset')).status_code,403)
            self.assertEqual((await self.client.post('/api/bank/reset',headers={'X-Operator-Token':'wrong'})).status_code,403)
            self.assertEqual((await self.client.post('/api/bank/reset',headers={'X-Operator-Token':'op-secret'})).status_code,200)
        finally:
            config.OPERATOR_TOKEN=old

    async def test_agents_get_the_exact_amount(self):
        from engine import agents
        run = bank.new_run(store.get_case('BK-001'),'rules')
        brief = agents._case_brief(run)
        self.assertIn('245000 paise', brief)
        self.assertIn('₹2,450.00', brief)

    async def test_headline_never_claims_an_unexecuted_refund(self):
        from engine import orchestrator
        run = bank.new_run(store.get_case('BK-001'),'rules')
        run.facts['findings'] = {'case_type':'P2P_NOT_CREDITED','disputed_utr':run.case['utr'],'summary':'s','evidence':[]}
        run.facts['validation'] = {'approved':[{'type':'MONITOR','utr':run.case['utr'],'amount_paise':0,'state':'scheduled'}],'rejected':[]}
        o = orchestrator._outcome(run, {})
        self.assertEqual(o['status'],'ACTIONED')
        self.assertNotIn('Refunded', o['headline'])
        self.assertEqual(o['headline'],'No money moved · review needed')

    async def test_spend_ceiling_blocks_new_runs(self):
        import config
        old=(config.LLM_PROVIDER, config.LITELLM_API_KEY)
        config.LLM_PROVIDER, config.LITELLM_API_KEY = 'litellm', 'test-key'
        bank._spend_cache.update(at=10**12, value=config.LITELLM_SPEND_CEILING + 0.01)
        try:
            r=await self.client.post('/api/bank/queue',json={'on':True})
            self.assertEqual(r.status_code,429)
            self.assertIn('budget',r.json()['detail'])
            self.assertFalse(bank.STATE['enabled'])
        finally:
            config.LLM_PROVIDER, config.LITELLM_API_KEY = old
            bank._spend_cache.update(at=0.0, value=None)

    async def test_litellm_cost_uses_proxy_prices(self):
        import config
        from types import SimpleNamespace
        from engine import llm
        old=(config.LLM_PROVIDER, config.LITELLM_API_KEY, llm._prices)
        config.LLM_PROVIDER, config.LITELLM_API_KEY = 'litellm', 'test-key'
        llm._prices={config.LITELLM_MODEL:{'input_cost_per_token':3.3e-6,'output_cost_per_token':16.5e-6}}
        try:
            cost=await llm._cost(SimpleNamespace(input_tokens=10000, output_tokens=1000, cache_read_input_tokens=0, cache_creation_input_tokens=0))
            self.assertAlmostEqual(cost, 0.033+0.0165, places=6)
        finally:
            config.LLM_PROVIDER, config.LITELLM_API_KEY, llm._prices = old

if __name__=='__main__': unittest.main()
