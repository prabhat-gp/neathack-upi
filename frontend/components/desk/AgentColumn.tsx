'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import type { EdgeState, NodeState, Step } from '@/lib/run'
import { Icon } from '../meta'
import Feed from './Feed'
import ModelChip from './ModelChip'

const AGENTS = {
  investigator: { name: 'Investigator', job: 'Finds what really happened', grad: 'from-sky-500 to-blue-600', ring: 'ring-sky-300', text: 'text-sky-700' },
  policy: { name: 'Policy', job: 'Sets the deadline & what is owed', grad: 'from-amber-500 to-orange-600', ring: 'ring-amber-300', text: 'text-amber-700' },
  resolver: { name: 'Resolver', job: 'Acts before the clock runs out', grad: 'from-emerald-500 to-teal-600', ring: 'ring-emerald-300', text: 'text-emerald-700' },
} as const

export default function AgentColumn({ id, state, edge, steps, usage, model, waitingHuman }: {
  id: keyof typeof AGENTS
  state: NodeState
  edge: EdgeState
  steps: Step[]
  usage?: { input_tokens: number; output_tokens: number; llm_calls: number }
  model: string | null
  waitingHuman?: boolean
}) {
  const a = AGENTS[id]
  const scroller = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  const last = steps[steps.length - 1]

  useLayoutEffect(() => {
    const el = scroller.current
    if (el && follow.current) el.scrollTop = el.scrollHeight
  }, [steps.length, last?.status])
  useEffect(() => {
    if (!steps.length) follow.current = true
  }, [steps.length])
  useEffect(() => {
    const el = scroller.current
    if (!el || !inner.current) return
    const ro = new ResizeObserver(() => {
      if (follow.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(inner.current)
    return () => ro.disconnect()
  }, [])

  const running = state.status === 'running'
  const done = state.status === 'done'
  const skipped = state.status === 'skipped'
  const calls = steps.filter((s) => s.kind === 'call').length

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      {/* dispatch connector */}
      <div className="flex h-6 justify-center">
        <div className={`w-[3px] rounded-full ${
          edge === 'active' ? 'beam bg-violet-200' : edge === 'taken' ? 'bg-emerald-400' : edge === 'skipped' ? 'border-l-2 border-dashed border-slate-300 bg-transparent' : 'bg-slate-200'
        }`} />
      </div>
      <section className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-white transition-all ${
        running ? `border-transparent ring-2 ${a.ring} glow-violet shadow-lg` : skipped ? 'border-dashed border-slate-300 bg-slate-50/60' : done ? 'border-slate-200 shadow-sm' : 'border-slate-200'
      }`}>
        <header className="flex items-center gap-2.5 border-b border-slate-100 px-3 py-2.5">
          <span className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${a.grad} text-white shadow-sm ${skipped ? 'opacity-40 grayscale' : ''}`}>
            <Icon name={id} className="h-4 w-4" />
            {running && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-ping rounded-full bg-violet-500" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className={`text-[14px] font-semibold ${skipped ? 'text-slate-400' : 'text-slate-900'}`}>{a.name}</h3>
              <span className="rounded bg-violet-600 px-1 py-px text-[8.5px] font-bold tracking-wider text-white">AI AGENT</span>
            </div>
            <div className="mt-0.5"><ModelChip model={model} usage={usage} /></div>
          </div>
          {done && <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Icon name="check" className="h-3.5 w-3.5" /></span>}
        </header>
        <div className={`truncate border-b border-slate-100 px-3 py-1.5 text-[11.5px] ${running ? `${a.text} font-medium` : 'text-slate-500'}`}>
          {running ? state.activity : skipped ? 'Not needed for this case' : done ? `→ ${state.activity}` : a.job}
        </div>

        <div ref={scroller} onScroll={(e) => {
          const el = e.currentTarget
          follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }} className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5">
          <div ref={inner} className="space-y-1">
            {steps.length === 0 && (
              <div className="grid h-40 place-items-center text-center text-[12px] text-slate-400">
                {skipped ? 'The orchestrator closed the case without this agent.' : 'Waiting for the orchestrator…'}
              </div>
            )}
            <Feed steps={steps} llm={!!model} />
            {waitingHuman && (
              <div className="glow-amber rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11.5px] font-medium text-amber-900">
                Plan held. Waiting for a human to approve →
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center gap-3 border-t border-slate-100 px-3 py-1.5 font-mono text-[10px] text-slate-400">
          <span>{calls} party calls</span>
          {state.durationMs != null && <span>{(state.durationMs / 1000).toFixed(1)}s</span>}
          {usage && <span className="ml-auto text-violet-500">{usage.input_tokens.toLocaleString()} in · {usage.output_tokens.toLocaleString()} out</span>}
        </footer>
      </section>
    </div>
  )
}
