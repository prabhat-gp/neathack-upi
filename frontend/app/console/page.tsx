'use client'

import Link from 'next/link'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import AgentFocus from '@/components/desk/AgentFocus'
import CaseRail, { type CaseStatus } from '@/components/desk/CaseRail'
import CaseReport from '@/components/desk/CaseReport'
import ResultPanel from '@/components/desk/ResultPanel'
import Stepper from '@/components/desk/Stepper'
import { Icon } from '@/components/meta'
import { API_URL, initialRunState, reduceRun, rs, streamEvents, type Case, type Meta, type NodeId, type Snapshot } from '@/lib/run'

const PACES = [{ id: 'slow', label: 'Slow' }, { id: 'normal', label: 'Normal' }, { id: 'fast', label: 'Fast' }] as const

export default function Desk() {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [cases, setCases] = useState<Case[]>([])
  const [apiError, setApiError] = useState<string | null>(null)
  const [selected, setSelected] = useState('bene-outage')
  const [pace, setPace] = useState<(typeof PACES)[number]['id']>('normal')
  const [run, dispatch] = useReducer(reduceRun, undefined, initialRunState)
  const [deciding, setDeciding] = useState(false)
  const [live, setLive] = useState<Snapshot | null>(null)
  const [status, setStatus] = useState<Record<string, CaseStatus>>({})
  const [pinned, setPinned] = useState<NodeId | null>(null)
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
  const model = llm ? meta?.model ?? null : null

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

  // Refresh the live records each time an agent writes to a system, so "What changed" updates as it happens.
  const posts = run.steps.filter((s) => s.kind === 'call' && s.http?.method === 'POST' && s.status !== 'running').length
  useEffect(() => {
    if (posts && kase) loadSnapshot(kase)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts])

  useEffect(() => {
    const o = run.outcome
    if (!o) return
    if (o.after) setLive(o.after)
    setStatus((s) => ({
      ...s,
      [selected]: o.status === 'AWAITING_APPROVAL' ? { kind: 'awaiting' }
        : { kind: 'resolved', label: o.deadline ? `₹0 penalty · ${o.headline.replace(/^(Refunded|Returned) with /, '').replace(' to spare', ' spare')}` : o.headline },
    }))
    if (o.status !== 'AWAITING_APPROVAL') loadCases()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.outcome])

  function pick(id: string) {
    if (running) return
    setSelected(id)
    setLive(null)
    setPinned(null)
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
    setPinned(null)
    dispatch({ type: 'reset', t: 0 })
    setStatus((s) => ({ ...s, [selected]: { kind: 'running' } }))
    await consume('/api/runs', isCustom ? { ...custom, pace } : { case_id: selected, pace })
    setStatus((s) => (s[selected]?.kind === 'running' ? (({ [selected]: _, ...rest }) => rest)(s) : s))
  }

  async function decide(approve: boolean) {
    if (!run.runId) return
    setDeciding(true)
    setPinned('resolver')
    dispatch({ type: 'resume', t: 0 })
    await consume(`/api/runs/${run.runId}/decision`, { approve })
    setDeciding(false)
    setPinned(null)
  }

  async function resetSandbox() {
    await fetch(`${API_URL}/sandbox/reset`, { method: 'POST' })
    dispatch({ type: 'reset', t: 0 })
    setStatus({})
    await loadCases()
    if (kase) loadSnapshot(kase)
  }

  const active = (['investigator', 'policy', 'resolver'] as NodeId[]).find((n) => run.nodes[n].status === 'running') ?? 'orchestrator'
  const showReport = !pinned && run.outcome && run.phase !== 'running'
  const focus: NodeId = pinned ?? active

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
            llm ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-800'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${llm ? 'animate-pulse bg-emerald-500' : 'bg-amber-500'}`} />
            {llm ? `AI agents live · ${meta.brain_label}` : 'Rules engine (no AI login on this server)'}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <details className="relative">
            <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[12.5px] font-medium text-slate-600 hover:bg-slate-50">
              Demo <span className="text-slate-400">▾</span>
            </summary>
            <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
              {!llm && (
                <div className="mb-2">
                  <div className="px-1 pb-1 text-[10.5px] font-semibold uppercase tracking-widest text-slate-400">Playback pace</div>
                  <div className="flex rounded-lg bg-slate-100 p-0.5 text-[12px] font-medium">
                    {PACES.map((p) => (
                      <button key={p.id} onClick={() => setPace(p.id)} disabled={running}
                        className={`flex-1 rounded-md px-2 py-1 ${pace === p.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{p.label}</button>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={resetSandbox} disabled={running}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                <Icon name="reset" className="h-3.5 w-3.5" /> Reset sandbox records
              </button>
            </div>
          </details>
          <button onClick={start} disabled={running || deciding || !kase || (isCustom && !custom.complaint.trim())}
            className="flex h-9 items-center gap-2 rounded-lg bg-ink px-4 text-[13px] font-semibold text-white shadow transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-60">
            {running ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> Agents working · {(run.elapsedMs / 1000).toFixed(0)}s</>
              : <><Icon name="play" className="h-3.5 w-3.5" /> {run.phase === 'idle' ? 'Resolve with AI agents' : 'Run again'}</>}
          </button>
        </div>
      </header>
      {apiError && <div className="bg-rose-50 px-4 py-2 text-[12px] text-rose-700">{apiError}</div>}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_320px]">
        <CaseRail cases={cases} selected={selected} onPick={pick} disabled={running} status={status} />

        <main className="flex min-h-0 flex-col gap-3 bg-slate-50/40 p-4">
          {isCustom ? (
            <section className="rounded-2xl border border-violet-200 bg-violet-50/40 p-3">
              <div className="flex items-baseline justify-between gap-3">
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
                  placeholder="e.g. “I paid my electrician but he says the money never came. Please reverse it.” (Hindi or Hinglish works too)"
                  className="resize-none rounded-lg border border-slate-200 bg-white p-2 text-[13px] md:col-span-2" />
              </div>
            </section>
          ) : kase && (
            <section key={kase.id} className="step-in">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className={`rounded px-1.5 py-0.5 font-bold uppercase tracking-wider ${kase.trigger === 'sweep' ? 'bg-violet-100 text-violet-700' : 'bg-slate-200 text-slate-600'}`}>
                  {kase.trigger === 'sweep' ? `Recon sweep · ${kase.settlement_date}` : `Complaint · ${kase.customer_name}`}
                </span>
                <span className="rounded bg-white px-1.5 py-0.5 font-medium text-slate-600 ring-1 ring-slate-200">We are the {kase.role.toLowerCase()}</span>
                <span className="rounded bg-white px-1.5 py-0.5 font-mono font-semibold text-slate-800 ring-1 ring-slate-200">{rs(kase.amount_paise)}</span>
                <span className="font-mono text-slate-400">UTR {kase.utr}</span>
              </div>
              <h1 className="mt-1.5 font-serif text-[25px] leading-snug tracking-tight text-slate-900">{kase.story ?? kase.title}</h1>
              {kase.trigger === 'complaint' && <p className="mt-0.5 line-clamp-1 text-[12.5px] italic text-slate-500">“{kase.complaint}”</p>}
            </section>
          )}

          <Stepper run={run} focus={showReport || run.phase === 'idle' ? null : focus} onFocus={setPinned} />

          {run.phase === 'idle' ? (
            <section className="step-in grid flex-1 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white">
              <div className="max-w-md p-6 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-lg">
                  <Icon name="orchestrator" className="h-6 w-6" />
                </div>
                <h2 className="mt-3 text-[17px] font-semibold text-slate-900">An orchestrator and 3 AI agents will work this case</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
                  They get only the UTR and the complaint. Every fact comes from a live call to core banking, NPCI or the other bank,
                  and nothing moves until the execution engine re-checks it.
                </p>
                <button onClick={start} disabled={!kase || (isCustom && !custom.complaint.trim())}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50">
                  <Icon name="play" className="h-4 w-4" /> Resolve with AI agents
                </button>
                {model && <p className="mt-2 font-mono text-[11px] text-slate-400">model: {model} · about a minute</p>}
              </div>
            </section>
          ) : showReport && run.outcome ? (
            <CaseReport o={run.outcome} run={run} onReplay={setPinned} />
          ) : (
            <>
              {pinned && run.outcome && (
                <button onClick={() => setPinned(null)} className="-mb-1 self-start text-[12px] font-medium text-violet-700 hover:underline">← Back to the case report</button>
              )}
              <AgentFocus node={focus} run={run} model={model} />
            </>
          )}
          {run.phase === 'error' && <div className="rounded-xl bg-rose-50 p-3 text-[12px] text-rose-700">Run failed: {run.error}</div>}
        </main>

        <ResultPanel kase={kase} run={run} live={live} deciding={deciding} onDecide={decide} />
      </div>
    </div>
  )
}
