'use client'

import Link from 'next/link'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import AgentFocus from '@/components/desk/AgentFocus'
import CaseRail, { CHANNEL } from '@/components/desk/CaseRail'
import CaseReport from '@/components/desk/CaseReport'
import ResultPanel from '@/components/desk/ResultPanel'
import Stepper from '@/components/desk/Stepper'
import { Icon } from '@/components/meta'
import { API_URL, api, followRun, initialRunState, reduceRun, rs, type DeskCase, type Meta, type NodeId, type Snapshot } from '@/lib/run'

type Autopilot = { on: boolean; sent: number; max: number; interval_sec: number; active_runs: number }

export default function Desk() {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [cases, setCases] = useState<DeskCase[]>([])
  const [detail, setDetail] = useState<DeskCase | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [run, dispatch] = useReducer(reduceRun, undefined, initialRunState)
  const [live, setLive] = useState<Snapshot | null>(null)
  const [pilot, setPilot] = useState<Autopilot | null>(null)
  const [pinned, setPinned] = useState<NodeId | null>(null)
  const [deciding, setDeciding] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const following = useRef<{ id: string; ctrl: AbortController } | null>(null)

  const llm = !!meta && meta.brain !== 'rules'
  const model = llm ? meta?.model ?? null : null
  const kase = (detail && detail.id === selected ? detail : null) ?? cases.find((c) => c.id === selected) ?? null

  const poll = useCallback(async () => {
    try {
      const [cs, ap] = await Promise.all([api<DeskCase[]>('/api/desk/cases'), api<Autopilot>('/api/desk/autopilot')])
      setCases(cs)
      setPilot(ap)
      setSelected((s) => s ?? (cs.find((c) => c.status === 'WORKING') ?? cs.find((c) => c.status === 'NEEDS_YOU') ?? cs[0])?.id ?? null)
    } catch { /* API down: the banner says so */ }
  }, [])

  useEffect(() => {
    api<Meta>('/api/meta').then(setMeta).catch(() => setNote('Can’t reach the DisputePro API.'))
    poll()
    const id = setInterval(poll, 2000)
    return () => clearInterval(id)
  }, [poll])

  // Selected case: details + conversation, refreshed whenever it changes.
  const stamp = cases.find((c) => c.id === selected)?.updated_at
  useEffect(() => {
    if (!selected) return
    api<DeskCase>(`/api/desk/cases/${selected}`).then(setDetail).catch(() => {})
  }, [selected, stamp, run.nodes.intake.status, run.outcome])

  // Follow the case's run live, or replay it if it already finished.
  const runId = kase?.run_id ?? null
  useEffect(() => {
    if (following.current?.id === runId) return
    following.current?.ctrl.abort()
    dispatch({ type: 'reset', t: 0 })
    setPinned(null)
    if (!runId) { following.current = null; return }
    const ctrl = new AbortController()
    following.current = { id: runId, ctrl }
    followRun(runId, dispatch, ctrl.signal).catch(() => {})
  }, [runId])

  // Live records of the systems involved, refreshed whenever an agent writes to one.
  const posts = run.steps.filter((s) => s.kind === 'call' && s.http?.method === 'POST' && s.status !== 'running').length
  useEffect(() => {
    if (!kase?.utr) { setLive(null); return }
    fetch(`${API_URL}/sandbox/snapshot?customer_id=${kase.customer_id}&utr=${kase.utr}`)
      .then((r) => (r.ok ? r.json() : null)).then(setLive).catch(() => {})
  }, [kase?.utr, kase?.customer_id, posts, run.outcome])

  async function act(fn: () => Promise<unknown>, ok?: string) {
    setNote(null)
    try { await fn(); if (ok) setNote(ok); poll() } catch (e) { setNote((e as Error).message) }
  }

  async function decide(approve: boolean) {
    const id = run.runId
    if (!id) return
    setDeciding(true)
    await act(() => api(`/api/runs/${id}/decision`, { approve }))
    following.current?.ctrl.abort()
    const ctrl = new AbortController()
    following.current = { id, ctrl }
    dispatch({ type: 'reset', t: 0 })
    followRun(id, dispatch, ctrl.signal).catch(() => {}).finally(() => setDeciding(false))
  }

  async function resetBank() {
    await api('/api/desk/autopilot', { on: false })
    await fetch(`${API_URL}/sandbox/reset`, { method: 'POST' })
    setSelected(null)
    setDetail(null)
  }

  const working = run.phase === 'running'
  const active = (['intake', 'investigator', 'policy', 'resolver'] as NodeId[]).find((n) => run.nodes[n].status === 'running') ?? 'orchestrator'
  const showReport = !pinned && run.outcome && !working
  const focus: NodeId = pinned ?? active
  const ch = kase ? CHANNEL[kase.channel] : null
  const [first, ...more] = (kase?.message ?? '').split('\n')

  return (
    <div className="flex h-screen flex-col bg-white">
      <header className="flex h-14 shrink-0 items-center gap-3 bg-night px-4 text-white">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-night"><Icon name="orchestrator" className="h-4 w-4" /></span>
          <span className="font-display text-[16px] font-semibold tracking-tight">DisputePro</span>
        </Link>
        <span className="text-[13px] text-white/20">/</span>
        <span className="text-[13px] font-medium text-white/80">Ops desk</span>
        <span className="hidden text-[12px] text-white/40 md:inline">Sahyadri Bank · sandbox</span>
        {meta && (
          <span title={meta.brain_label} className={`ml-1 hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium xl:flex ${llm ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${llm ? 'animate-pulse bg-emerald-400' : 'bg-amber-400'}`} />
            {llm ? `AI agents live · ${meta.model}` : 'Rules engine (no AI login)'}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => act(() => api('/api/desk/recon', {}), 'Recon sweep done: exceptions found in tonight’s settlement data are queued.')}
            className="hidden h-9 items-center gap-1.5 rounded-full border border-white/15 px-3.5 text-[12.5px] font-medium text-white/75 transition hover:bg-white/5 hover:text-white md:flex">
            <Icon name="reset" className="h-3.5 w-3.5" /> Run recon sweep
          </button>
          <button onClick={() => act(() => api('/api/desk/autopilot', { on: !pilot?.on }))}
            title="Runs the recon sweep, then has customers write in every few minutes. Capped per session."
            className={`flex h-9 items-center gap-2 rounded-full px-3.5 text-[12.5px] font-semibold transition ${pilot?.on ? 'bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/40' : 'border border-white/15 text-white/75 hover:bg-white/5'}`}>
            <span className={`relative h-4 w-7 rounded-full transition ${pilot?.on ? 'bg-emerald-400' : 'bg-white/20'}`}>
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${pilot?.on ? 'left-3.5' : 'left-0.5'}`} />
            </span>
            Autopilot{pilot?.on ? ` · ${pilot.sent}/${pilot.max}` : ''}
          </button>
          <Link href="/app" target="_blank" className="flex h-9 items-center gap-1.5 rounded-full bg-violet-500 px-4 text-[12.5px] font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:bg-violet-400">
            Complain as a customer <Icon name="arrow" className="h-3.5 w-3.5" />
          </Link>
          <details className="relative">
            <summary className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-full border border-white/15 text-white/60 hover:bg-white/5">⋯</summary>
            <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1.5 text-slate-900 shadow-lg">
              <button onClick={() => act(resetBank, 'Sandbox reset: a fresh day at the bank.')}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-slate-50">
                <Icon name="reset" className="h-3.5 w-3.5" /> Reset the sandbox bank
              </button>
            </div>
          </details>
        </div>
      </header>
      {note && <div className="flex items-center justify-between bg-violet-50 px-4 py-1.5 text-[12px] text-violet-900">{note}<button onClick={() => setNote(null)} className="text-violet-500">✕</button></div>}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_330px]">
        <CaseRail cases={cases} selected={selected} onPick={(id) => { setSelected(id); setDetail(null) }} />

        <main className="flex min-h-0 flex-col gap-3 bg-slate-50/40 p-4">
          {!kase ? (
            <section className="grid flex-1 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white">
              <div className="max-w-md p-6 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-night text-white"><Icon name="orchestrator" className="h-6 w-6" /></div>
                <h2 className="mt-3 font-display text-[22px] font-semibold tracking-[-0.03em]">The desk is quiet</h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-slate-500">
                  Cases arrive the way they do at a bank: customers complaining in the UPI app or chat, and exceptions the nightly
                  reconciliation finds in the settlement data.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Link href="/app" target="_blank" className="rounded-full bg-violet-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-violet-400">Complain as a customer</Link>
                  <button onClick={() => act(() => api('/api/desk/autopilot', { on: true }))} className="rounded-full border border-slate-300 px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">Switch on autopilot</button>
                </div>
              </div>
            </section>
          ) : (
            <>
              <section key={kase.id} className="step-in">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {ch && <span className={`rounded px-1.5 py-0.5 font-bold uppercase tracking-wider ${ch.tone}`}>{kase.channel_label}</span>}
                  <span className="font-mono text-slate-400">{kase.id}</span>
                  {kase.role && <span className="rounded bg-white px-1.5 py-0.5 font-medium text-slate-600 ring-1 ring-slate-200">We are the {kase.role.toLowerCase()}</span>}
                  {kase.amount_paise ? <span className="rounded bg-white px-1.5 py-0.5 font-mono font-semibold text-slate-800 ring-1 ring-slate-200">{rs(kase.amount_paise)}</span> : null}
                  {kase.utr && <span className="font-mono text-slate-400">UTR {kase.utr}</span>}
                </div>
                <h1 className="mt-2 font-display text-[22px] font-semibold leading-snug tracking-[-0.03em] text-slate-900">
                  {kase.channel === 'RECON'
                    ? <>Reconciliation found a broken payment for {kase.customer_name}. <span className="text-slate-500">{kase.message}.</span></>
                    : <>{kase.customer_name} wrote in: <span className="font-serif font-normal italic text-slate-600">“{first}”</span></>}
                </h1>
                {more.length > 0 && <p className="mt-1 text-[12.5px] text-slate-500">Then replied: “{more.join(' ').replace(/Customer adds: /g, '')}”</p>}
              </section>

              <Stepper run={run} focus={showReport || run.phase === 'idle' ? null : focus} onFocus={setPinned} />

              {run.phase === 'idle' ? (
                <section className="grid flex-1 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white">
                  <div className="max-w-md p-6 text-center">
                    <h2 className="font-display text-[18px] font-semibold tracking-tight">{kase.status === 'QUEUED' ? 'Queued for the agents' : 'Nothing to replay'}</h2>
                    <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
                      {kase.status !== 'QUEUED' ? 'This case ran before the server restarted. Its outcome is on the queue card.'
                        : kase.channel === 'RECON' && !pilot?.on ? 'Reconciliation exceptions start when autopilot is on, or right now if you start it.'
                          : 'Customer complaints start on their own as soon as an agent is free.'}
                    </p>
                    {kase.status === 'QUEUED' && (
                      <button onClick={() => act(() => api(`/api/desk/cases/${kase.id}/start`, {}))}
                        className="mt-4 inline-flex items-center gap-2 rounded-full bg-violet-500 px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:bg-violet-400">
                        <Icon name="play" className="h-4 w-4" /> Start now
                      </button>
                    )}
                  </div>
                </section>
              ) : showReport && run.outcome ? (
                <CaseReport o={run.outcome} run={run} onReplay={setPinned} />
              ) : (
                <>
                  {pinned && run.outcome && <button onClick={() => setPinned(null)} className="-mb-1 self-start text-[12px] font-medium text-violet-700 hover:underline">← Back to the case report</button>}
                  <AgentFocus node={focus} run={run} model={model} />
                </>
              )}
              {run.phase === 'error' && <div className="rounded-xl bg-rose-50 p-3 text-[12px] text-rose-700">Run failed: {run.error}</div>}
            </>
          )}
        </main>

        <ResultPanel kase={kase ?? undefined} run={run} live={live} deciding={deciding} onDecide={decide} />
      </div>
    </div>
  )
}
