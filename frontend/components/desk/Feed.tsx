'use client'

import { useState } from 'react'
import type { Step } from '@/lib/run'
import { Icon } from '../meta'
import { PARTY_STYLE, Typewriter } from './StepItem'

type Item = { kind: 'step'; step: Step } | { kind: 'group'; type: 'check' | 'guard'; steps: Step[] }

function group(steps: Step[]): Item[] {
  const out: Item[] = []
  for (const s of steps) {
    if (s.kind === 'check' || s.kind === 'guard') {
      const last = out[out.length - 1]
      if (last?.kind === 'group' && last.type === s.kind) last.steps.push(s)
      else out.push({ kind: 'group', type: s.kind, steps: [s] })
    } else out.push({ kind: 'step', step: s })
  }
  return out
}

function Reasoning({ step, llm }: { step: Step; llm: boolean }) {
  if (!llm) {
    return (
      <div className="step-in flex items-start gap-1.5 px-0.5 text-[11px] text-slate-400">
        <Icon name="plan" className="mt-0.5 h-3 w-3 shrink-0" />
        <span><span className="font-medium text-slate-500">{step.title}</span> · {step.detail}</span>
      </div>
    )
  }
  return (
    <div className="step-in rounded-xl rounded-tl-sm bg-violet-50 px-3 py-2">
      <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-violet-600">
        <Icon name="think" className="h-3 w-3" /> Thinking
      </div>
      <p className="whitespace-pre-line text-[12px] leading-relaxed text-slate-800">
        {step.streamed ? step.detail : <Typewriter text={step.detail ?? ''} since={step.arrivedAt} />}
        {step.status === 'running' && <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-violet-500 align-middle" />}
      </p>
    </div>
  )
}

function CallLine({ step }: { step: Step }) {
  const [open, setOpen] = useState(false)
  const p = step.party ? PARTY_STYLE[step.party] : null
  const running = step.status === 'running'
  const tone = step.status === 'bad' ? 'text-rose-600' : step.status === 'warn' ? 'text-amber-700' : 'text-slate-600'
  return (
    <div className="step-in">
      <button onClick={() => !running && setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-50 ${running ? 'shimmer' : ''}`}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${p?.dot ?? 'bg-slate-400'} ${running ? 'animate-ping' : ''}`} />
        <span className="shrink-0 text-[11px] font-semibold text-slate-800">{p?.name}</span>
        <span className={`min-w-0 flex-1 truncate text-[11.5px] ${running ? 'text-violet-600' : tone}`}>
          {running ? step.title + '…' : step.result}
        </span>
      </button>
      {open && (
        <pre className="mx-2 mb-1 max-h-44 overflow-auto rounded-md bg-ink p-2 font-mono text-[10px] leading-relaxed text-slate-200">
          {`${step.http?.method} ${step.http?.path}  ·  ${step.http?.status} in ${step.http?.latency_ms}ms\n`}
          {step.http?.body ? `${JSON.stringify(step.http.body, null, 1)}\n→ ` : '→ '}
          {JSON.stringify(step.data, null, 1)}
        </pre>
      )}
    </div>
  )
}

function Group({ type, steps }: { type: 'check' | 'guard'; steps: Step[] }) {
  const [open, setOpen] = useState(false)
  const flagged = steps.filter((s) => s.status === 'bad')
  const label = type === 'check'
    ? `${steps.length} risk checks · ${flagged.length ? `${flagged.length} flagged` : 'all clear'}`
    : `${steps.length} guardrail checks · ${flagged.length ? `${flagged.length} blocked` : 'all passed'}`
  return (
    <div className="step-in">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50">
        <Icon name={type === 'check' ? 'investigator' : 'guard'} className={`h-3 w-3 shrink-0 ${flagged.length ? 'text-rose-500' : 'text-emerald-500'}`} />
        <span className={`flex-1 text-[11.5px] font-medium ${flagged.length && type === 'check' ? 'text-rose-700' : 'text-slate-600'}`}>{label}</span>
        <span className="text-[10px] text-slate-400">{open ? 'hide' : 'show'}</span>
      </button>
      {open && (
        <ul className="mb-1 ml-7 space-y-0.5">
          {steps.map((s) => (
            <li key={s.id} className={`text-[11px] ${s.status === 'bad' ? 'text-rose-600' : 'text-slate-500'}`}>
              {s.title.replace('Guardrail · ', '')} <span className="font-mono">{s.kind === 'check' ? s.detail : `· ${s.detail}`}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Conclusion({ step }: { step: Step }) {
  const [open, setOpen] = useState(false)
  if (step.kind === 'rule') {
    return (
      <div className="step-in">
        <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50">
          <Icon name="rule" className="h-3 w-3 shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-slate-700">{step.title}</span>
          <span className="text-[10px] text-slate-400">{open ? 'hide' : 'rule text'}</span>
        </button>
        {open && <p className="mx-2 mb-1 rounded-md bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-900">{step.detail}</p>}
      </div>
    )
  }
  const style = {
    finding: 'border-sky-200 bg-sky-50/70 text-sky-900',
    calc: 'border-amber-200 bg-amber-50/70 text-amber-900',
    decision: step.status === 'warn' || step.status === 'bad' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50/70 text-emerald-900',
    plan: 'border-emerald-200 bg-emerald-50/70 text-emerald-900',
    draft: 'border-slate-200 bg-slate-50 text-slate-800',
  }[step.kind] ?? 'border-slate-200 bg-white text-slate-800'
  const title = step.kind === 'calc' ? 'Deadline' : step.kind === 'draft' ? 'Message drafted' : step.title
  return (
    <div className={`step-in rounded-xl border px-3 py-2 ${style}`}>
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider opacity-80">
        <Icon name={step.kind} className="h-3 w-3" /> <span className="truncate">{title}</span>
      </div>
      {step.detail && <p className="mt-1 line-clamp-6 text-[12px] leading-snug"><Typewriter text={step.detail} since={step.arrivedAt} /></p>}
    </div>
  )
}

function TurnLine({ step }: { step: Step }) {
  const running = step.status === 'running'
  return (
    <div className="step-in flex items-center gap-2 px-1 pt-1.5">
      <span className="h-px flex-1 bg-violet-100" />
      <span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] ${running ? 'shimmer text-violet-700' : 'bg-violet-50 text-violet-600'}`}>
        {running && <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />}
        {step.title.replace('Turn', 'AI turn')} · {running ? 'thinking…' : (step.result ?? '').split(' · ')[0]}
      </span>
      <span className="h-px flex-1 bg-violet-100" />
    </div>
  )
}

function Handoff({ step }: { step: Step }) {
  return (
    <div className="step-in rounded-lg border-l-2 border-violet-400 bg-white px-2.5 py-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-600">From the Orchestrator</div>
      <p className="text-[11.5px] italic leading-snug text-slate-700">“{step.detail}”</p>
    </div>
  )
}

// Decisions worth showing in words. Tools that call a bank system are already shown as a call line, so they are skipped.
export const TOOL_LABEL: Record<string, string> = {
  dispatch_investigator: 'Handed the case to the Investigator', dispatch_policy: 'Handed the evidence to Policy',
  dispatch_resolver: 'Handed the ruling to the Resolver', close_case: 'Closed the case', reconciliation_sweep: 'Ran the reconciliation sweep',
  submit_findings: 'Submitted its findings', submit_ruling: 'Submitted its ruling', submit_resolution_plan: 'Submitted the action plan',
  lookup_rbi_rule: 'Looked up the RBI rule', compute_tat_position: 'Computed the deadline', compute_risk_score: 'Scored fraud risk',
}

function ToolChoice({ step }: { step: Step }) {
  const label = TOOL_LABEL[step.title.replace('Chose ', '')]
  if (!label) return null
  return (
    <div className="step-in flex items-center gap-1.5 px-2 text-[11.5px] font-medium text-violet-700">
      <Icon name="decision" className="h-3 w-3 shrink-0" />
      <span>{label}</span>
    </div>
  )
}

export default function Feed({ steps, llm }: { steps: Step[]; llm: boolean }) {
  return (
    <>
      {group(steps).map((it) => {
        if (it.kind === 'group') return <Group key={it.steps[0].id} type={it.type} steps={it.steps} />
        const s = it.step
        if (s.kind === 'think') return <Reasoning key={s.id} step={s} llm={llm} />
        if (s.kind === 'call') return <CallLine key={s.id} step={s} />
        if (s.kind === 'turn') return <TurnLine key={s.id} step={s} />
        if (s.kind === 'handoff') return <Handoff key={s.id} step={s} />
        if (s.kind === 'decision' && s.title.startsWith('Chose ')) return <ToolChoice key={s.id} step={s} />
        return <Conclusion key={s.id} step={s} />
      })}
    </>
  )
}
