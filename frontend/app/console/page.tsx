'use client'

import Link from 'next/link'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import AgentColumn from '@/components/desk/AgentColumn'
import CaseRail from '@/components/desk/CaseRail'
import { OrchestratorBar, PartyBus } from '@/components/desk/Orchestrator'
import ResultPanel from '@/components/desk/ResultPanel'
import { PARTY_STYLE } from '@/components/desk/StepItem'
import { Icon } from '@/components/meta'
import { API_URL, initialRunState, reduceRun, rs, streamEvents, type Case, type Meta, type PartyId, type Snapshot } from '@/lib/run'

const PACES = [
  { id: 'slow', label: 'Slow' },
  { id: 'normal', label: 'Normal' },
  { id: 'fast', label: 'Fast' },
] as const

export default function Desk() {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [cases, setCases] = useState<Case[]>([])
  const [apiError, setApiError] = useState<string | null>(null)
  const [selected, setSelected] = useState('deemed-outward')
  const [pace, setPace] = useState<(typeof PACES)[number]['id']>('normal')
  const [run, dispatch] = useReducer(reduceRun, undefined, initialRunState)
  const [deciding, setDeciding] = useState(false)
  const [live, setLive] = useState<Snapshot | null>(null)
  const [resolved, setResolved] = useState<Record<string, string>>({})
  const abort = useRef<AbortController | null>(null)
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([])
  const [custom, setCustom] = useState({ customer_id: '', utr: '', complaint: '' })
  const [txns, setTxns] = useState<{ utr: string; amount_paise: number; counterparty_name: string; initiated_at: string; kind: string; direction: string }[]>([])

  const isCustom = selected === 'custom'
  const customCase: Case | undefined = isCustom && custom.customer_id && custom.utr ? {
    id: 'custom', title: 'Your complaint', subtitle: '', trigger: 'complaint', role: 'Bank', rule: '', tat_days: null,
    customer_id: custom.customer_id, customer_name: customers.find((c) => c.id === custom.customer_id)?.name ?? '', utr: custom.utr,
    amount_paise: txns.find((t) => t.utr === custom.utr)?.amount_paise ?? 0, complaint: custom.complaint,
    initiated_at: txns.find((t) => t.utr === custom.utr)?.initiated_at ?? null, deadline_at: null, resolved: null,
  } : undefined
  const kase = isCustom ? customCase : cases.find((c) => c.id === selected)
  const running = run.phase === 'running'
  const llm = !!meta && meta.brain !== 'rules'
  const model = meta?.model ?? null

  async function pickCustomer(id: string) {
    setCustom({ customer_id: id, utr: '', complaint: custom.complaint })
    setTxns(id ? await fetch(`${API_URL}/api/customers/${id}/transactions`).then((r) => r.json()) : [])
  }

  const loadSnapshot = useCallback(async (c: Case) => {
    const r = await fetch(`${API_URL}/sandbox/snapshot?customer_id=${c.customer_id}&utr=${c.utr}`)
    if (r.ok) setLive(await r.json())
  }, [])

  const loadCases = useCallback(() => fetch(`${API_URL}/api/cases`).then((r) => r.json()).then(setCases), [])

  useEffect(() => {
    fetch(`${API_URL}/api/customers`).then((r) => r.json()).then(setCustomers).catch(() => {})
    Promise.all([fetch(`${API_URL}/api/meta`).then((r) => r.json()), loadCases()])
      .then(([m]) => setMeta(m))
      .catch(() => setApiError(`Can't reach the DisputePro API at ${API_URL}.`))
  }, [loadCases])

  useEffect(() => {
    if (kase && run.phase === 'idle') loadSnapshot(kase)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, cases.length, custom.utr])

  const posts = run.steps.filter((s) => s.kind === 'call' && s.http?.method === 'POST' && s.status !== 'running').length
  useEffect(() => {
    if (posts && kase) loadSnapshot(kase)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts])

  useEffect(() => {
    const o = run.outcome
    if (!o) return
    if (o.after) setLive(o.after)
    if (o.status !== 'AWAITING_APPROVAL') {
      const label = o.deadline ? `₹0 penalty · ${o.headline.replace(/^(Refunded|Returned) with /, '').replace(' to spare', ' spare')}` : o.headline
      setResolved((r) => ({ ...r, [selected]: label }))
      loadCases()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.outcome])

  function pick(id: string) {
    if (running) return
    setSelected(id)
    setLive(null)
    dispatch({ type: 'reset', t: 0 })
  }

  async function consume(path: string, body: unknown) {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    try {
      await streamEvents(path, body, dispatch, ctrl.signal)
    } catch (e) {
      if (!ctrl.signal.aborted) dispatch({ type: 'run_failed', t: 0, error: (e as Error).message })
    }
  }

  async function start() {
    dispatch({ type: 'reset', t: 0 })
    await consume('/api/runs', isCustom ? { ...custom, pace } : { case_id: selected, pace })
  }

  async function decide(approve: boolean) {
    if (!run.runId) return
    setDeciding(true)
    dispatch({ type: 'resume', t: 0 })
    await consume(`/api/runs/${run.runId}/decision`, { approve })
    setDeciding(false)
  }

  async function resetSandbox() {
    await fetch(`${API_URL}/sandbox/reset`, { method: 'POST' })
    dispatch({ type: 'reset', t: 0 })
    setResolved({})
    await loadCases()
    if (kase) loadSnapshot(kase)
  }

  const stepsOf = (n: string) => run.steps.filter((s) => s.node === n)
  const partyLabels = Object.fromEntries(
    (Object.keys(PARTY_STYLE) as PartyId[]).map((p) => [p, p === 'bene' ? (live?.bene.bank ?? 'Other bank') : PARTY_STYLE[p].name]),
  ) as Record<PartyId, string>

  return (
    <div className="flex h-screen flex-col bg-white">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-700 text-white">
            <Icon name="orchestrator" className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">DisputePro</span>
        </Link>
        <span className="text-[13px] text-slate-300">/</span>
        <span className="text-[13px] font-medium text-slate-600">UPI exceptions desk</span>
        <span className="hidden text-[12px] text-slate-400 md:inline">Sahyadri Bank · sandbox</span>
        {meta && (
          <span title={meta.brain_label} className={`ml-1 hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium lg:flex ${
            llm ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${llm ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {llm ? meta.brain_label : 'Agent brain: rules engine (LLM keys not set)'}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-[12px] font-medium">
            {PACES.map((p) => (
              <button key={p.id} onClick={() => setPace(p.id)} disabled={running}
                className={`rounded-md px-2.5 py-1 ${pace === p.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{p.label}</button>
            ))}
          </div>
          <button onClick={resetSandbox} disabled={running} title="Restore every sandbox balance and record"
            className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40">
            <Icon name="reset" className="h-3.5 w-3.5" />
          </button>
          <button onClick={start} disabled={running || deciding || !kase || (isCustom && !custom.complaint.trim())}
            className="flex h-9 items-center gap-2 rounded-lg bg-ink px-4 text-[13px] font-semibold text-white shadow hover:bg-slate-800 disabled:opacity-60">
            {running ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> Resolving · {(run.elapsedMs / 1000).toFixed(1)}s</>
              : <><Icon name="play" className="h-3.5 w-3.5" /> {run.phase === 'idle' ? 'Resolve with agents' : 'Run again'}</>}
          </button>
        </div>
      </header>
      {apiError && <div className="bg-rose-50 px-4 py-2 text-[12px] text-rose-700">{apiError}</div>}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[264px_minmax(0,1fr)] xl:grid-cols-[264px_minmax(0,1fr)_340px]">
        <CaseRail cases={cases} selected={selected} onPick={pick} disabled={running} resolved={resolved} />

        <main className="flex min-h-0 flex-col gap-3 p-4">
          {isCustom && (
            <section className="rounded-2xl border border-violet-200 bg-violet-50/40 p-3">
              <div className="flex items-baseline justify-between">
                <h1 className="font-serif text-[26px] leading-tight tracking-tight">Write your own complaint</h1>
                <span className="text-[11.5px] text-slate-500">The agents only get the UTR and your words. They work out the rest.</span>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-[170px_minmax(0,1fr)]">
                <select value={custom.customer_id} onChange={(e) => pickCustomer(e.target.value)} disabled={running}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[13px]">
                  <option value="">Customer…</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={custom.utr} onChange={(e) => setCustom((c) => ({ ...c, utr: e.target.value }))} disabled={running || !txns.length}
                  className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-[13px]">
                  <option value="">Transaction being disputed…</option>
                  {txns.map((t) => (
                    <option key={t.utr} value={t.utr}>
                      {t.initiated_at.slice(0, 10)} · {t.direction === 'IN' ? 'received' : 'paid'} {rs(t.amount_paise)} {t.direction === 'IN' ? 'from' : 'to'} {t.counterparty_name} · {t.utr}
                    </option>
                  ))}
                </select>
                <textarea value={custom.complaint} onChange={(e) => setCustom((c) => ({ ...c, complaint: e.target.value }))} disabled={running} rows={2}
                  placeholder="e.g. “I paid my electrician but he says the money never came. Please reverse it.”"
                  className="resize-none rounded-lg border border-slate-200 bg-white p-2 text-[13px] md:col-span-2" />
              </div>
            </section>
          )}
          {kase && !isCustom && (
            <section className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <h1 className="font-serif text-[28px] leading-tight tracking-tight text-slate-900">{kase.title}</h1>
                <p className="mt-0.5 line-clamp-2 text-[13px] text-slate-500">
                  {kase.trigger === 'sweep'
                    ? <>Flagged by the reconciliation sweep of <b className="font-medium text-slate-700">{kase.settlement_date}</b>. No customer has complained yet.</>
                    : <><b className="font-medium text-slate-700">{kase.customer_name}:</b> <i>“{kase.complaint}”</i></>}
                </p>
              </div>
              <dl className="hidden shrink-0 grid-cols-3 gap-4 text-right md:grid">
                <div><dt className="text-[10px] uppercase tracking-widest text-slate-400">Amount</dt><dd className="font-mono text-[15px] font-semibold">{rs(kase.amount_paise)}</dd></div>
                <div><dt className="text-[10px] uppercase tracking-widest text-slate-400">Our role</dt><dd className="text-[13px] font-medium text-slate-700">{kase.role}</dd></div>
                <div><dt className="text-[10px] uppercase tracking-widest text-slate-400">UTR</dt><dd className="font-mono text-[12px] text-slate-600">{kase.utr}</dd></div>
              </dl>
            </section>
          )}

          <OrchestratorBar state={run.nodes.orchestrator} steps={stepsOf('orchestrator')} usage={run.usage.orchestrator} model={model} />

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-3">
            {(['investigator', 'policy', 'resolver'] as const).map((n) => (
              <AgentColumn key={n} id={n} state={run.nodes[n]} edge={run.edges[`orchestrator>${n}`] ?? 'idle'}
                steps={stepsOf(n)} usage={run.usage[n]} model={model} waitingHuman={n === 'resolver' && run.phase === 'awaiting'} />
            ))}
          </div>

          <PartyBus steps={run.steps} labels={partyLabels} />
          {run.phase === 'error' && <div className="rounded-xl bg-rose-50 p-3 text-[12px] text-rose-700">Run failed: {run.error}</div>}
        </main>

        <ResultPanel kase={kase} run={run} live={live} deciding={deciding} onDecide={decide} />
      </div>
    </div>
  )
}
