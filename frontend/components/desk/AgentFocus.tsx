'use client'
import { useEffect, useRef } from 'react'
import type { NodeId, RunState } from '@/lib/run'
import { Icon, NODE_META, PARTY_META } from '../meta'

export default function AgentFocus({
  node,
  run,
  model,
  follow,
}: {
  node: NodeId
  run: RunState
  model: string | null
  follow: boolean
}) {
  const meta = NODE_META[node],
    state = run.nodes[node],
    usage = run.usage[node]
  const steps = run.steps.filter((s) => s.node === node && s.kind !== 'think')
  const activity = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (follow && activity.current)
      activity.current.scrollTo({
        top: activity.current.scrollHeight,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      })
  }, [follow, steps.length, run.elapsedMs])
  return (
    <section className="flex min-h-0 flex-1 flex-col bg-white">
      <header className="border-b p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
            <Icon
              name={node === 'executor' ? 'guard' : node}
              className="h-5 w-5"
            />
          </span>
          <div>
            <h2 className="text-base font-semibold">{meta.label}</h2>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">
              {meta.ai
                ? model
                  ? `AI · ${model}`
                  : 'Rules fallback'
                : 'Controlled workflow'}{' '}
              ·{' '}
              {state.status === 'idle'
                ? 'Not started'
                : state.status === 'skipped'
                  ? 'Not required'
                  : state.status}
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-500">{meta.role}</p>
        {state.activity && (
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600">
            {state.activity}
          </div>
        )}
        {usage && (
          <p className="mt-3 text-[10px] text-slate-400">
            {model} · {usage.llm_calls} model turns ·{' '}
            {state.durationMs != null
              ? `${(state.durationMs / 1000).toFixed(1)}s`
              : 'In progress'}
          </p>
        )}
      </header>
      <div
        ref={activity}
        className="min-h-0 flex-1 space-y-3 overflow-auto p-4"
      >
        {steps.length === 0 && (
          <p className="py-5 text-sm leading-7 text-slate-400">
            {state.status === 'skipped'
              ? 'This agent was not needed for the route taken.'
              : 'Assignments, findings and tool results appear here as they are recorded.'}
          </p>
        )}
        {steps.map((s) => (
          <details
            key={s.id}
            className={`rounded-xl border p-3 ${s.status === 'bad' ? 'border-rose-200 bg-rose-50/30' : s.kind === 'decision' ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200'}`}
            open={
              s.kind === 'decision' ||
              s.kind === 'finding' ||
              s.status === 'running'
            }
          >
            <summary className="cursor-pointer text-xs font-medium leading-6">
              <span
                className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${s.status === 'bad' ? 'bg-rose-500' : s.status === 'running' ? 'bg-blue-500' : s.status === 'warn' ? 'bg-amber-500' : 'bg-emerald-500'}`}
              />
              {s.kind === 'turn'
                ? `Model ${s.status === 'running' ? 'working' : 'responded'} · ${s.title}`
                : s.title}
            </summary>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-600">
              {s.result || s.detail}
            </p>
            <p className="mt-3 text-[10px] text-slate-400">
              {(s.t / 1000).toFixed(1)}s ·{' '}
              {s.party ? PARTY_META[s.party].short : s.kind} · {s.status}
              {s.http?.status ? ` · HTTP ${s.http.status}` : ''}
            </p>
            {s.data != null && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[10px] font-medium text-blue-600">
                  Inspect source response
                </summary>
                <pre className="mt-2 overflow-auto rounded-lg bg-slate-50 p-3 text-[10px]">
                  {JSON.stringify(s.data, null, 2)}
                </pre>
              </details>
            )}
          </details>
        ))}
      </div>
    </section>
  )
}
