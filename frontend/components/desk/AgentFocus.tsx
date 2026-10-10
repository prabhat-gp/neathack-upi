'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import type { NodeId, RunState } from '@/lib/run'
import { Icon, NODE_META } from '../meta'
import Feed from './Feed'

const ASK: Partial<Record<NodeId, string>> = {
  intake: 'Reads the customer’s message in any language and works out which payment they mean.',
  orchestrator: 'Reads the case and decides which agent works it next, based only on evidence.',
  investigator: 'Asks NPCI, core banking and the other bank what really happened to the money.',
  policy: 'Applies the RBI rule: the deadline, the time left and what is owed.',
  resolver: 'Scores fraud risk and plans the smallest set of actions that closes the case.',
}

export default function AgentFocus({ node, run, model }: { node: NodeId; run: RunState; model: string | null }) {
  const m = NODE_META[node]
  const steps = run.steps.filter((s) => s.node === node)
  const st = run.nodes[node]
  const usage = run.usage[node]
  const calls = steps.filter((s) => s.kind === 'call').length
  const running = st.status === 'running'

  const scroller = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  useLayoutEffect(() => {
    if (scroller.current && follow.current) scroller.current.scrollTop = scroller.current.scrollHeight
  }, [steps.length, node])
  useEffect(() => {
    follow.current = true
  }, [node])
  useEffect(() => {
    const el = scroller.current
    if (!el || !inner.current) return
    const ro = new ResizeObserver(() => follow.current && (el.scrollTop = el.scrollHeight))
    ro.observe(inner.current)
    return () => ro.disconnect()
  }, [])

  return (
    <section key={node} className="step-in flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <span className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-xl ${m.chip}`}>
          <Icon name={node} className="h-5 w-5" />
          {running && <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-ping rounded-full ${m.dot}`} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-slate-900">{m.label}</h2>
            <span className="rounded bg-violet-600 px-1.5 py-px text-[9px] font-bold tracking-wider text-white">AI AGENT</span>
            {running && <span className="text-[11.5px] font-medium text-violet-600">working…</span>}
          </div>
          <p className="truncate text-[12px] text-slate-500">{ASK[node]}</p>
        </div>
        <div className="hidden shrink-0 text-right sm:block">
          <div className="font-mono text-[11px] font-semibold text-slate-700">{model ?? 'rules engine'}</div>
          <div className="font-mono text-[10.5px] text-slate-400">
            {usage ? `${usage.llm_calls} AI turn${usage.llm_calls === 1 ? '' : 's'} · ` : ''}{calls} system call{calls === 1 ? '' : 's'}
            {st.durationMs != null ? ` · ${(st.durationMs / 1000).toFixed(0)}s` : ''}
          </div>
        </div>
      </header>
      <div ref={scroller} onScroll={(e) => {
        const el = e.currentTarget
        follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
      }} className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div ref={inner} className="mx-auto max-w-3xl space-y-1.5">
          {steps.length === 0 && <div className="py-10 text-center text-[12.5px] text-slate-400">Waiting for the orchestrator to hand over…</div>}
          <Feed steps={steps} llm={!!model} />
        </div>
      </div>
    </section>
  )
}
