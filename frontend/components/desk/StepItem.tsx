'use client'

import { useEffect, useState } from 'react'
import type { PartyId, Step } from '@/lib/run'
import { Icon } from '../meta'

export const PARTY_STYLE: Record<PartyId, { name: string; chip: string; dot: string }> = {
  cbs: { name: 'Core banking', chip: 'bg-indigo-50 text-indigo-700 ring-indigo-200', dot: 'bg-indigo-500' },
  npci: { name: 'NPCI', chip: 'bg-orange-50 text-orange-700 ring-orange-200', dot: 'bg-orange-500' },
  bene: { name: 'Other bank', chip: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500' },
  acquirer: { name: 'Acquirer', chip: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200', dot: 'bg-fuchsia-500' },
  ncrp: { name: 'NCRP', chip: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500' },
  crustdata: { name: 'Crustdata', chip: 'bg-violet-50 text-violet-700 ring-violet-200', dot: 'bg-violet-500' },
}

export function Typewriter({ text, since }: { text: string; since: number }) {
  const msPerChar = Math.max(3, Math.min(14, 800 / Math.max(1, text.length)))
  const reveal = () => Math.min(text.length, Math.floor((Date.now() - since) / msPerChar))
  const [n, setN] = useState(reveal)
  useEffect(() => {
    if (n >= text.length) return
    const id = setInterval(() => {
      const next = reveal()
      setN(next)
      if (next >= text.length) clearInterval(id)
    }, 30)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, since])
  return (
    <>
      {text.slice(0, n)}
      {n < text.length && <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-violet-400 align-middle" />}
    </>
  )
}

const TONE: Record<Step['status'], string> = {
  running: 'text-violet-700', ok: 'text-emerald-700', warn: 'text-amber-700', bad: 'text-rose-700', info: 'text-slate-700',
}
const CARD: Record<Step['status'], string> = {
  running: 'border-violet-200 bg-violet-50', ok: 'border-emerald-200 bg-emerald-50/70', warn: 'border-amber-200 bg-amber-50/70',
  bad: 'border-rose-200 bg-rose-50/70', info: 'border-slate-200 bg-slate-50',
}

function Call({ step }: { step: Step }) {
  const [open, setOpen] = useState(false)
  const p = step.party ? PARTY_STYLE[step.party] : null
  const running = step.status === 'running'
  return (
    <div className={`step-in rounded-lg border px-2.5 py-2 ${running ? 'border-violet-200 shimmer' : 'border-slate-200 bg-white'}`}>
      <button onClick={() => !running && setOpen((v) => !v)} className="block w-full text-left">
        <div className="flex items-center gap-1.5">
          {p && <span className={`rounded px-1.5 py-px text-[10px] font-semibold ring-1 ${p.chip}`}>{p.name}</span>}
          <span className={`font-mono text-[9.5px] font-bold ${step.http?.method === 'POST' ? 'text-orange-600' : 'text-sky-700'}`}>{step.http?.method}</span>
          <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-slate-700">{step.title}</span>
          {running ? (
            <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          ) : (
            <span className="shrink-0 font-mono text-[9.5px] text-slate-400">{step.http?.latency_ms}ms</span>
          )}
        </div>
        {!running && step.result && (
          <div className={`mt-1 line-clamp-2 text-[11.5px] leading-snug ${TONE[step.status]}`}>{step.result}</div>
        )}
      </button>
      {open && (
        <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-ink p-2 font-mono text-[10px] leading-relaxed text-slate-200">
          {`${step.http?.method} ${step.http?.path}\n`}
          {step.http?.body ? `${JSON.stringify(step.http.body, null, 1)}\n→ ` : '→ '}
          {JSON.stringify(step.data, null, 1)}
        </pre>
      )}
    </div>
  )
}

export default function StepItem({ step, llm }: { step: Step; llm: boolean }) {
  if (step.kind === 'call') return <Call step={step} />
  if (step.kind === 'think') {
    return (
      <div className="step-in flex gap-1.5 px-0.5">
        <Icon name="think" className="mt-0.5 h-3 w-3 shrink-0 text-violet-400" />
        <p className="text-[11.5px] italic leading-snug text-slate-500">
          {llm ? null : <span className="not-italic font-medium text-slate-600">{step.title}. </span>}
          <Typewriter text={step.detail ?? ''} since={step.arrivedAt} />
        </p>
      </div>
    )
  }
  if (step.kind === 'check') {
    return (
      <div className="step-in flex items-center gap-1.5 px-0.5 text-[11px]">
        <Icon name={step.status === 'bad' ? 'x' : 'check'} className={`h-3 w-3 shrink-0 ${step.status === 'bad' ? 'text-rose-500' : 'text-emerald-500'}`} />
        <span className="min-w-0 flex-1 truncate text-slate-600">{step.title}</span>
        <span className={`font-mono text-[10px] ${TONE[step.status]}`}>{step.detail}</span>
      </div>
    )
  }
  if (step.kind === 'guard') {
    return (
      <div className="step-in flex items-start gap-1.5 px-0.5 text-[11px]">
        <Icon name="guard" className={`mt-0.5 h-3 w-3 shrink-0 ${step.status === 'bad' ? 'text-rose-500' : 'text-slate-400'}`} />
        <span className="text-slate-600"><b className="font-semibold text-slate-700">{step.title.replace('Guardrail · ', '')}</b> · {step.detail}</span>
      </div>
    )
  }
  const strong = ['finding', 'decision', 'plan', 'draft', 'rule', 'calc'].includes(step.kind)
  return (
    <div className={`step-in rounded-lg border px-2.5 py-2 ${strong ? CARD[step.kind === 'draft' ? 'info' : step.status] : 'border-transparent'}`}>
      <div className={`flex items-center gap-1.5 text-[11.5px] font-semibold ${step.kind === 'draft' ? 'text-indigo-800' : TONE[step.status]}`}>
        <Icon name={step.kind} className="h-3 w-3 shrink-0" />
        <span className="truncate">{step.title}</span>
      </div>
      {step.detail && (
        <p className={`mt-0.5 whitespace-pre-line text-[11.5px] leading-snug ${step.kind === 'rule' ? 'line-clamp-4 text-slate-500' : 'text-slate-700'}`}>
          <Typewriter text={step.detail} since={step.arrivedAt} />
        </p>
      )}
    </div>
  )
}
