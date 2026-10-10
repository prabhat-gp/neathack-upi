'use client'

import { useEffect, useRef } from 'react'
import { PARTY_IDS, type NodeState, type PartyId, type Step } from '@/lib/run'
import { Icon } from '../meta'
import ModelChip from './ModelChip'
import { PARTY_STYLE, Typewriter } from './StepItem'

export function OrchestratorBar({ state, steps, usage, model }: {
  state: NodeState
  steps: Step[]
  usage?: { input_tokens: number; output_tokens: number; llm_calls: number }
  model: string | null
}) {
  const strip = useRef<HTMLDivElement>(null)
  useEffect(() => {
    strip.current?.scrollTo({ left: strip.current.scrollWidth, behavior: 'smooth' })
  }, [steps.length])
  const running = state.status === 'running'
  const latest = [...steps].reverse().find((s) => s.kind !== 'call')
  return (
    <section className={`relative overflow-hidden rounded-2xl border bg-gradient-to-r from-violet-50 via-white to-indigo-50 px-3 py-2.5 ${
      running ? 'border-violet-300 glow-violet' : 'border-slate-200'
    }`}>
      <div className="flex items-center gap-3">
        <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow">
          <Icon name="orchestrator" className="h-5 w-5" />
          {running && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-ping rounded-full bg-violet-500" />}
        </span>
        <div className="w-64 min-w-0 shrink-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[14px] font-semibold text-slate-900">Master Orchestrator</h3>
            <span className="rounded bg-violet-600 px-1 py-px text-[8.5px] font-bold tracking-wider text-white">AI AGENT</span>
          </div>
          <div className="mt-0.5"><ModelChip model={model} usage={usage} /></div>
        </div>
        <div ref={strip} className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {steps.filter((s) => s.kind !== 'call' && s.kind !== 'think').map((s, i) => (
            <span key={s.id} className="step-in flex shrink-0 items-center gap-1.5">
              {i > 0 && <Icon name="arrow" className="h-3 w-3 text-slate-300" />}
              <span className={`max-w-[260px] truncate rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                s.kind === 'finding' ? 'border-amber-200 bg-amber-50 text-amber-800' : s.kind === 'decision' ? 'border-slate-200 bg-white text-slate-700' : 'border-violet-200 bg-white text-violet-800'
              }`} title={s.detail ?? ''}>
                {s.title}
              </span>
            </span>
          ))}
        </div>
      </div>
      {state.status !== 'idle' && (
        <p className="mt-1.5 truncate pl-[52px] text-[11.5px] font-medium text-violet-700">{state.activity}</p>
      )}
      {latest?.detail && running && model && (
        <p className="mt-1.5 truncate pl-[52px] text-[11.5px] italic text-slate-500">
          <Typewriter text={latest.detail} since={latest.arrivedAt} />
        </p>
      )}
    </section>
  )
}

export function PartyBus({ steps, labels }: { steps: Step[]; labels: Record<PartyId, string> }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white px-3 py-2 no-scrollbar">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Live connections</span>
      {PARTY_IDS.map((p) => {
        const calls = steps.filter((s) => s.kind === 'call' && s.party === p)
        const inflight = calls.some((c) => c.status === 'running')
        const st = PARTY_STYLE[p]
        return (
          <span key={p} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] ring-1 transition ${
            inflight ? `${st.chip} glow-violet` : calls.length ? st.chip : 'bg-slate-50 text-slate-400 ring-slate-200'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${calls.length ? st.dot : 'bg-slate-300'} ${inflight ? 'animate-ping' : ''}`} />
            <Icon name={p} className="h-3.5 w-3.5" />
            <span className="font-medium">{labels[p]}</span>
            <span className="font-mono text-[10px] opacity-70">{calls.length}</span>
          </span>
        )
      })}
    </div>
  )
}

export function Countdown({ deadline, frozenAt, compact }: { deadline: string; frozenAt?: number; compact?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const tick = () => {
      const now = frozenAt ?? Date.now()
      const s = Math.max(0, Math.floor((new Date(deadline).getTime() - now) / 1000))
      const d = Math.floor(s / 86400)
      const h = Math.floor((s % 86400) / 3600)
      const m = Math.floor((s % 3600) / 60)
      const sec = s % 60
      const pad = (n: number) => String(n).padStart(2, '0')
      if (ref.current) ref.current.textContent = d ? (compact ? `${d}d ${pad(h)}h` : `${d}d ${pad(h)}h ${pad(m)}m`) : compact ? `${pad(h)}h ${pad(m)}m` : `${pad(h)}:${pad(m)}:${pad(sec)}`
    }
    tick()
    if (frozenAt) return
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [deadline, frozenAt, compact])
  return <span ref={ref} className="tabular-nums" />
}
