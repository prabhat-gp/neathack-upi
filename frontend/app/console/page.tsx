'use client'

import Link from 'next/link'
import { useCallback, useEffect, useReducer, useState } from 'react'
import { api, DeskCase, followRun, initialRunState, NodeId, Outcome, reduceRun, rs } from '@/lib/run'
import { Icon } from '@/components/meta'
import './bank.css'

type Chain = { remitter: string; receiver: string; failure_at: string; reason: string; source: string }
type Audit = { status: string; rule: string; reason: string; checks: string[]; tat?: string; deadline_at?: string; compensation_paise: number; checked_at: string }
type Result = Outcome & { governance?: Audit; chain?: Chain; trace_url?: string }
type Ledger = { cases: (DeskCase & { outcome?: Result })[]; counts: Record<string, number>; queue: { enabled: boolean; active_case_id: string | null; started_at: string | null; batch_left: number; batch_size: number }; model: string; brain: string; bank: string }
const filters = [['all', 'All cases'], ['approval', 'Approval'], ['investigate', 'Investigate'], ['completed', 'Completed']]
const labels: Record<string,string> = { QUEUED: 'Queued', WORKING: 'Agents working', NEEDS_YOU: 'Human approval', RESOLVED: 'Completed', ESCALATED: 'Investigate', FAILED: 'Investigate', NEEDS_INFO: 'Investigate' }
const agents: { id: NodeId; title: string; task: string; number: string }[] = [
  { id: 'investigator', title: 'Investigator', task: 'Locate the failure. Reconcile the source records.', number: '01' },
  { id: 'policy', title: 'RBI Policy', task: 'Check T+1 / T+5, compensation and bank authority.', number: '02' },
  { id: 'resolver', title: 'Resolver', task: 'Choose the remedy. Execute safely or request approval.', number: '03' },
]
function date(value: string, time=false) { return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) }) }
function short(id: string) { return `T${Number(id.split('-')[1]).toString().padStart(2,'0')}` }
function pretty(s: string) { return s.toLowerCase().replace(/_/g, ' ') }
const ACRONYMS = ['TAT','UDIR','NCRP','VPA','UPI','NPCI','RET']
function actionLabel(type: string) { const w=type.split('_').map(x=>ACRONYMS.includes(x)?x:x.toLowerCase()); w[0]=w[0][0].toUpperCase()+w[0].slice(1); return w.join(' ') }
function sentence(s: string) { const t=s.trim(); return /[.!?]$/.test(t) ? t : `${t}.` }
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const day = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

export default function BankDesk() {
  const [ledger, setLedger] = useState<Ledger>()
  const [selected, setSelected] = useState('')
  const [filter, setFilter] = useState('all')
  const [run, dispatch] = useReducer(reduceRun, undefined, initialRunState)
  const [chain, setChain] = useState<Chain>()
  const [audit, setAudit] = useState<Audit>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reviewer, setReviewer] = useState('Aarav Joshi')
  const [reason, setReason] = useState('')
  const [now, setNow] = useState(Date.now())
  const [reconnect, setReconnect] = useState(0)
  useEffect(() => { document.title = 'Bank desk · DisputePro' }, [])
  const refresh = useCallback(async () => {
    try { const d = await api<Ledger>('/api/bank/ledger'); setLedger(d); setSelected(s => s || d.cases[0]?.id || ''); setError('') }
    catch (e) { setError((e as Error).message) }
  }, [])
  useEffect(() => { refresh(); const t=setInterval(refresh,1800); return () => clearInterval(t) },[refresh])
  useEffect(() => { const t=setInterval(() => setNow(Date.now()),1000); return () => clearInterval(t) },[])
  // When the agents pick up the next case, show it.
  useEffect(() => { if (ledger?.queue.active_case_id) { setSelected(ledger.queue.active_case_id); setFilter('all') } },[ledger?.queue.active_case_id])
  const c=ledger?.cases.find(c => c.id===selected)
  // Keep the selected ledger row on screen, including when the agents pick up a new case.
  useEffect(() => { document.querySelector('.bank-row.selected')?.scrollIntoView({ block: 'nearest' }) },[selected,filter])
  // A different case starts at the top of its columns.
  useEffect(() => { document.querySelector('.bank-workspace')?.scrollTo({ top: 0 }) },[c?.id])
  useEffect(() => {
    dispatch({type:'reset',t:0}); setChain(undefined); setAudit(undefined); setReason('')
    if (!c?.run_id) return
    const abort=new AbortController()
    followRun(c.run_id, ev => {
      dispatch(ev)
      if(ev.type==='bank_chain') setChain(ev.chain)
      if(ev.type==='governance') setAudit(ev.audit)
      if(ev.type==='run_finished' || ev.type==='run_failed') refresh()
    },abort.signal).catch(e => { if(!abort.signal.aborted) setError(`Live connection: ${e.message}`) })
    return () => abort.abort()
  // Reconnect an approval run after it becomes WORKING, including after a page reload.
  },[c?.id,c?.run_id,c?.status==='WORKING',reconnect,refresh])
  const outcome=(run.outcome || c?.outcome) as Result | undefined
  const currentChain=chain || outcome?.chain
  const currentAudit=audit || outcome?.governance
  const active=c?.status==='WORKING'
  const elapsed=active && ledger?.queue.started_at ? Math.max(0,(now-new Date(ledger.queue.started_at).getTime())/1000) : outcome?.ops?.seconds || run.elapsedMs/1000
  const visible=(ledger?.cases || []).map((c,i)=>({c,i})).sort((a,b)=>{const t=today(),da=day(a.c.created_at),db=day(b.c.created_at);if(da===db)return a.i-b.i;if(da===t)return -1;if(db===t)return 1;return db.localeCompare(da)}).map(x=>x.c).filter(c => filter==='all' || (filter==='approval' ? c.status==='NEEDS_YOU' : filter==='completed' ? c.status==='RESOLVED' : ['ESCALATED','FAILED','NEEDS_INFO'].includes(c.status)))
  async function toggleQueue() {
    setBusy(true)
    try { await api('/api/bank/queue',{on:!ledger?.queue.enabled}); setFilter('all'); await refresh() }
    catch(e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function decide(approve:boolean) {
    if(!c) return
    setBusy(true)
    try { await api(`/api/bank/cases/${c.id}/decision`,{approve,reviewer,reason}); setReconnect(n=>n+1); await refresh() }
    catch(e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const model=run.brain==='rules' ? 'Rules verification · no LLM' : run.model || (ledger?.brain==='rules' ? 'Rules verification · no LLM' : ledger?.model || 'Connecting…')
  return <div className="bank-desk">
    <header className="bank-topbar"><Link href="/" className="bank-brand"><span><Icon name="orchestrator"/></span>DisputePro<span className="bank-brand-divider"/> <small>Bank desk</small></Link><div className="bank-bank"><span className="bank-dot"/>{ledger?.bank || 'Sahyadri Bank'}<span className="bank-sandbox">Sandbox</span></div><Link href="/" className="bank-home">← Home</Link></header>
    <div className="bank-layout">
      <aside className="bank-ledger" aria-label="Failed transaction ledger">
        <div className="bank-ledger-head"><p className="bank-kicker">OPERATIONS LEDGER</p><h1>Failed payments <span>{ledger?.counts.all ?? '—'}</span></h1><p>Today first. One exception at a time.</p></div>
        <div className="bank-filters" aria-label="Filter cases">{filters.map(([key,label]) => <button key={key} onClick={()=>setFilter(key)} aria-pressed={filter===key} className={filter===key?'selected':''}>{label}<span>{ledger?.counts[key] ?? '—'}</span></button>)}</div>
        <div className="bank-ledger-list">{!ledger ? <p className="bank-empty">Preparing the bank ledger…</p> : !visible.length ? <div className="bank-empty"><Icon name="check"/><h3>No {filter==='completed'?'completed cases':filter==='investigate'?'cases to investigate':'approvals waiting'} yet</h3><p>Outcomes will appear here as agents work through the queue.</p><button onClick={()=>setFilter('all')}>View all cases →</button></div> : visible.map((item,i) => <div key={item.id}>
          {(i===0 || day(visible[i-1].created_at)!==day(item.created_at)) && <div className="bank-date">{date(item.created_at)} <span>{day(item.created_at)===today() ? 'TODAY · PRIORITY' : 'EARLIER'}</span></div>}
          <button className={`bank-row ${selected===item.id?'selected':''}`} aria-pressed={selected===item.id} onClick={()=>setSelected(item.id)}><div><strong>{short(item.id)}</strong><b>{rs(item.amount_paise)}</b></div><div className="bank-row-ref"><span>{item.utr}</span><span>{new Date(item.created_at).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false})}</span></div><div><span className={`bank-status s-${item.status}`}><i/>{labels[item.status]}</span><small>{item.role==='Beneficiary bank'?'INWARD':'OUTWARD'}</small></div></button>
        </div>)}</div>
        <div className="bank-ledger-foot"><span className={ledger?.queue.enabled?'bank-dot':''}/>{ledger?.queue.enabled?'Agents are processing the queue':!ledger?'Loading…':ledger.counts.queued?`${ledger.counts.queued} queued · ${ledger.queue.batch_size===1?'each press works the next case':`each press works ${ledger.queue.batch_size}`}`:'No cases queued'}</div>
      </aside>
      <main className="bank-workspace">
        <div className="bank-toolbar"><div><p className="bank-kicker">PAYMENT RECOVERY WORKSPACE</p><h2>{c ? `${short(c.id)} · ${rs(c.amount_paise)}` : 'Your operations desk'} <span className={`bank-status s-${c?.status}`}>{c && labels[c.status]}</span></h2><p>{c?.utr ? `UTR ${c.utr} · ${c.role} · ${date(c.created_at,true)}` : 'Investigate. Govern. Resolve.'}</p></div><div className="bank-controls"><span className="bank-analyst"><span>AJ</span>Aarav Joshi</span><button className="bank-run" disabled={!ledger || busy || (!ledger.queue.enabled && !ledger.counts.queued) || (ledger.queue.enabled && ledger.queue.batch_size===1)} onClick={toggleQueue}>{busy?'Working…':ledger?.queue.enabled ? (ledger.queue.batch_size===1 ? 'Agents working…' : `Ⅱ Pause · case ${ledger.queue.batch_size-ledger.queue.batch_left+1} of ${ledger.queue.batch_size}`) : (ledger?.queue.batch_size ?? 1)===1 ? '▶ Run agents · next case' : `▶ Run agents · next ${Math.min(ledger?.queue.batch_size ?? 1, ledger?.counts.queued ?? 0) || ledger?.queue.batch_size}`}</button></div></div>
        {error && <div className="bank-error" role="alert">{error}<button onClick={()=>{setReconnect(n=>n+1);refresh()}}>Reconnect</button></div>}
        {ledger?.queue.active_case_id && !ledger.queue.enabled && <div className="bank-notice">Queue paused. The active transaction will finish safely.</div>}
        <section className="bank-chain" aria-label="Payment chain"><div className="bank-section-label"><span>PAYMENT CHAIN</span><small>{currentChain ? (currentChain.failure_at==='unconfirmed'?'Conflicting records · location unconfirmed':'Failure located from source records') : 'Location pending investigation'}</small></div><div className="bank-chain-track">{[['remitter',currentChain?.remitter || (c?.role==='Remitter bank'?'Sahyadri Bank':'Remitter bank'),'Remitter'],['npci','NPCI','Payment network'],['receiver',currentChain?.receiver || (c?.role==='Beneficiary bank'?'Sahyadri Bank':'Receiving bank'),'Receiver']].map(([id,name,label],i)=><div key={id} className={`bank-chain-node ${currentChain?.failure_at===id?'fault':''}`}><span className="bank-chain-symbol">{id==='npci'?'⇄':'▤'}</span><div><small>{label}</small><strong>{name}</strong></div><span className="bank-chain-state">{currentChain?.failure_at===id?'Failure here':currentChain? 'Checked':'—'}</span>{i<2 && <span className="bank-chain-arrow">→</span>}</div>)}</div>{currentChain && <p className="bank-chain-reason">{currentChain.reason}</p>}</section>
        <section className={`bank-canvas ${active?'is-running':''}`} aria-label="Live agent workflow">
          <div className="bank-canvas-top"><div><p className="bank-kicker">AGENT WORKSPACE</p><h3>{active?'Agents are working':outcome?outcome.headline:'A coordinated team. One clear outcome.'}</h3></div><div className={`bank-timer ${elapsed>90?'over':''}`}><strong>{Math.floor(elapsed)}<small>s</small></strong><span>{active && elapsed>90?'Above target · still working':'60–90s target / case'}</span></div></div>
          <div className={`bank-master n-${run.nodes.orchestrator.status}`}><div className="bank-agent-icon"><Icon name="orchestrator"/></div><div><div className="bank-agent-heading"><h4>Master agent</h4><span>{active?'Coordinating':outcome?'Run recorded':'Ready'}</span></div><p>{run.nodes.orchestrator.activity || 'Picks the next ledger entry and coordinates all three specialists.'}</p><small className="bank-model">{model}</small></div></div>
          <div className="bank-connectors"><span/><span/><span/></div>
          <div className="bank-specialists">{agents.map(a=>{const n=run.nodes[a.id];const steps=run.steps.filter(s=>s.node===a.id && !['think','turn'].includes(s.kind));const latest=steps.at(-1);return <article key={a.id} className={`bank-agent agent-${a.id} n-${n.status}`}><div className="bank-agent-top"><span className="bank-agent-icon"><Icon name={a.id}/></span><span className="bank-agent-number">{a.number}</span><span className="bank-agent-state">{n.status==='running'?'Working':n.status==='done'?'Done':n.status==='waiting'?'Held':'Waiting'}</span></div><h4>{a.title}</h4><small className="bank-model">{model}</small><p>{n.status==='idle'||n.status==='skipped'?a.task:n.activity || a.task}</p><div className="bank-agent-output">{latest?<><span>{latest.kind==='call'?'SOURCE CHECK':'LATEST FINDING'}</span><strong>{latest.result || latest.detail || latest.title}</strong></>:<><span>{a.id==='policy'?'MANDATORY GATE':'NEXT STEP'}</span><strong>{a.id==='investigator'?'Core banking → NPCI → other bank':a.id==='policy'?'No financial action without policy clearance':'Complete · approval · investigate'}</strong></>}</div>{run.usage[a.id] && <div className="bank-token-count">{run.usage[a.id].llm_calls} model call{run.usage[a.id].llm_calls===1?'':'s'} · {(run.usage[a.id].input_tokens+run.usage[a.id].output_tokens).toLocaleString('en-IN')} tokens</div>}</article>})}</div>
          <div className="bank-activity"><span className={active?'bank-dot':''}/><strong>{active?'Live activity':outcome?'Recorded activity':'Ready to begin'}</strong><p>{run.steps.at(-1)?.title || (ledger?.queue.batch_size ?? 1)===1 ? 'Press Run agents. The master takes the next queued transaction and works it end to end.' : `Press Run agents. The master works the next ${ledger?.queue.batch_size} queued transactions, then stops.`}</p><span>{run.steps.filter(s=>s.kind==='call').length} source calls</span></div>
        </section>
        <section className={`bank-governance ${currentAudit?.status==='hold'?'held':''}`} aria-label="Mandatory RBI governance"><div className="bank-governance-title"><Icon name="policy"/><div><h3>RBI governance <span>{currentAudit ? currentAudit.status==='passed'?'Passed':'Hold':'Mandatory'}</span></h3><p>{currentAudit?.reason || 'Policy must pass before any refund or network action can execute.'}</p></div></div><div className="bank-policy-facts"><div><small>APPLICABILITY</small><strong>{currentAudit?.tat || (currentAudit?'Review required':c?.tat_days?`T+${c.tat_days} · to verify`:'Pending')}</strong></div><div><small>COMPENSATION</small><strong>{currentAudit?.status==='hold' ? 'Pending evidence' : currentAudit ? rs(currentAudit.compensation_paise) : 'To calculate'}</strong></div><a href="https://rbi.org.in/commonman/English/scripts/Notification.aspx?Id=3074" target="_blank" rel="noreferrer">RBI circular ↗</a></div>{currentAudit && <details><summary>Inspect governance record</summary><p>{currentAudit.rule}</p><ul>{currentAudit.checks.map(x=><li key={x}>{x}</li>)}</ul><p>Checked {date(currentAudit.checked_at,true)}{currentAudit.deadline_at && ` · Deadline ${date(currentAudit.deadline_at,true)}`}</p></details>}</section>
        <section className="bank-results" aria-label="Actions and resolution"><div className="bank-section-heading"><div><p className="bank-kicker">THE OUTCOME</p><h3>Actions & resolution</h3></div><span>{outcome ? `${outcome.ops?.seconds ?? 0}s recorded` : 'Awaiting agent decisions'}</span></div>
          {c?.status==='NEEDS_YOU' && <div className="bank-approval"><div><h4>Human approval required</h4><p>{sentence(outcome?.human_reason || 'Review the proposed actions before authorizing payment')} No proposed money movement has executed.</p></div><div className="bank-review-fields"><label>Reviewer<input value={reviewer} onChange={e=>setReviewer(e.target.value)} maxLength={80}/></label><label>Review note<input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Required when sending to investigation" maxLength={500}/></label></div><div className="bank-review-buttons"><button disabled={busy || !!ledger?.queue.active_case_id || reviewer.trim().length<2} onClick={()=>decide(true)}>Approve displayed actions</button><button disabled={busy || !!ledger?.queue.active_case_id || !reason.trim() || reviewer.trim().length<2} onClick={()=>decide(false)}>Send to investigation</button></div>{ledger?.queue.active_case_id && <small>Pause the queue and wait for the current case to finish before approving.</small>}</div>}
          <div className="bank-action-flow">{outcome?.actions?.length ? outcome.actions.map((a,i)=><article className={`bank-action a-${a.state}`} key={`${a.type}-${i}`}><div><span>{String(i+1).padStart(2,'0')}</span><b>{pretty(a.state)}</b></div><h4>{actionLabel(a.type)}</h4><strong>{a.amount_paise?rs(a.amount_paise):'No money movement'}</strong><p>{a.note || a.reason}</p>{a.ref && <code>Receipt {a.ref}</code>}</article>) : <div className="bank-result-empty"><span>↳</span><div><h4>{c?.status==='ESCALATED'?'Financial action held':'A receipt for every decision'}</h4><p>{outcome?.summary || 'Validated actions, approval decisions and execution references will appear here.'}</p></div></div>}</div>{outcome && <div className="bank-receipt"><span>CASE RECEIPT</span><p>{outcome.summary}</p><code>{c?.run_id}</code></div>}
        </section>
        <section className="bank-evidence" aria-label="Source evidence"><div className="bank-section-heading"><div><p className="bank-kicker">VERIFY THE WORK</p><h3>Source evidence</h3></div>{(run.traceUrl || outcome?.trace_url) && <a href={run.traceUrl || outcome?.trace_url} target="_blank" rel="noreferrer">Open neatlogs trace ↗</a>}</div><div className="bank-evidence-grid">{outcome?.findings?.evidence?.map((e,i)=><article key={i}><small>{e.source}</small><p>{e.fact}</p></article>)}</div><details className="bank-tool-log"><summary>Agent activity & source responses <span>{run.steps.length} events</span></summary>{run.steps.length ? run.steps.filter(s=>s.kind!=='think').map(s=><details key={s.id}><summary><span>{(s.t/1000).toFixed(1)}s · {s.node}</span> {s.title}<b>{s.status}</b></summary><p>{s.result || s.detail}</p>{s.http && <code>{s.http.method} {s.http.path} {s.http.status}</code>}{s.data!==undefined && <pre>{JSON.stringify(s.data,null,2)}</pre>}</details>):<p>Source responses appear when the investigation starts.</p>}</details><p className="bank-evidence-note">Sandbox bank and network adapters · Actual model calls and tool responses are recorded. Entire, cfo.ai and Crustdata support the build and business plan; they are not payment evidence. <Link href="/evidence">View sponsor proof ↗</Link></p></section>
      </main>
    </div>
  </div>
}
