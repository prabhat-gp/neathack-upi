'use client'

import type { NodeId, RunState } from '@/lib/run'
import { Icon, NODE_META } from '../meta'
import { TOOL_LABEL } from './Feed'

const SHORT: Partial<Record<NodeId, string>> = {
  orchestrator: 'Orchestrator', investigator: 'Investigator', policy: 'Policy', resolver: 'Resolver', human: 'You', outcome: 'Done',
}
const JOB: Partial<Record<NodeId, string>> = {
  orchestrator: 'Routes the case', investigator: 'Finds what happened', policy: 'Deadline & what is owed',
  resolver: 'Fixes it safely', human: 'Approve or reject', outcome: 'Closed with proof',
}

function orchestratorLine(run: RunState) {
  const last = [...run.steps].reverse().find((s) => s.node === 'orchestrator' && s.kind === 'decision' && s.title.startsWith('Chose '))
  return last ? TOOL_LABEL[last.title.replace('Chose ', '')] : undefined
}

export default function Stepper({ run, focus, onFocus }: { run: RunState; focus: NodeId | null; onFocus: (n: NodeId) => void }) {
  const held = run.phase === 'awaiting' || run.nodes.human.status === 'running' || run.nodes.human.status === 'done'
  const ids: NodeId[] = ['orchestrator', 'investigator', 'policy', 'resolver', ...(held ? (['human'] as NodeId[]) : []), 'outcome']
  const finished = run.phase === 'done'

  return (
    <div className="flex items-stretch">
      {ids.map((id, i) => {
        const st = id === 'outcome' ? (finished ? 'done' : 'idle') : id === 'human' && run.phase === 'awaiting' ? 'running' : run.nodes[id].status
        const m = NODE_META[id]
        const running = st === 'running'
        const done = st === 'done'
        const skipped = st === 'skipped'
        const clickable = id !== 'outcome' && id !== 'human' && (done || running)
        const line = id === 'orchestrator'
          ? (done || running) && orchestratorLine(run)
          : id === 'outcome'
            ? finished && run.outcome?.headline
            : id === 'human' ? running && 'Waiting for your decision' : done ? run.nodes[id].activity : running ? run.nodes[id].activity : undefined
        const next = ids[i + 1]
        const nextActive = next && (next === 'outcome' ? finished : next === 'human' ? held : run.nodes[next].status !== 'idle')
        return (
          <div key={id} className="flex min-w-0 flex-1 items-center">
            <button onClick={() => clickable && onFocus(id)} disabled={!clickable}
              className={`step-in group relative min-w-0 flex-1 rounded-xl border px-2.5 py-2 text-left transition ${
                focus === id ? `bg-white shadow-md ring-2 ${m.ring.replace('border-', 'ring-')} border-transparent`
                  : running ? `border-transparent bg-white ring-1 ${m.ring.replace('border-', 'ring-')} glow-violet`
                    : done ? 'border-slate-200 bg-white hover:shadow-sm' : skipped ? 'border-dashed border-slate-200 bg-transparent' : 'border-slate-200/70 bg-slate-50/60'
              } ${clickable ? 'cursor-pointer' : 'cursor-default'}`}>
              <div className="flex items-center gap-2">
                <span className={`relative grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
                  done ? 'bg-emerald-500 text-white' : running ? `${m.chip}` : skipped ? 'bg-slate-100 text-slate-300' : 'bg-white text-slate-400 ring-1 ring-slate-200'}`}>
                  <Icon name={done ? 'check' : id} className="h-3.5 w-3.5" />
                  {running && <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 animate-ping rounded-full ${m.dot}`} />}
                </span>
                <div className="min-w-0">
                  <div className={`truncate text-[12.5px] font-semibold ${skipped ? 'text-slate-400' : 'text-slate-900'}`}>{SHORT[id]}</div>
                  <div className={`truncate text-[10.5px] ${running ? `${m.text} font-medium` : 'text-slate-400'}`}>
                    {skipped ? 'Not needed' : running ? (id === 'human' ? 'Your turn' : 'Working…') : done ? 'Done' : JOB[id]}
                  </div>
                </div>
              </div>
              {line && <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-slate-600">{line}</p>}
            </button>
            {next && (
              <div className={`mx-1 h-[3px] w-4 shrink-0 rounded-full ${nextActive ? (finished || done ? 'bg-emerald-400' : 'beam-x bg-violet-200') : 'bg-slate-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
