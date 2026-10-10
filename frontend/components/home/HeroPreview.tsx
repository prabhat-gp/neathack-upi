'use client'

import { useEffect, useState } from 'react'
import { Icon } from '../meta'

// A replay of a real run (scene: the other bank's API is down), compressed to ~9 seconds and looped.
const AGENTS = [
  { id: 'orchestrator', name: 'Orchestrator', tone: 'from-violet-500 to-indigo-600' },
  { id: 'investigator', name: 'Investigator', tone: 'from-sky-400 to-blue-600' },
  { id: 'policy', name: 'Policy', tone: 'from-amber-400 to-orange-600' },
  { id: 'resolver', name: 'Resolver', tone: 'from-emerald-400 to-teal-600' },
]

const LINES: { at: number; agent: number; kind: 'think' | 'call' | 'fail' | 'done'; text: string }[] = [
  { at: 0, agent: 0, kind: 'think', text: 'Complaint, not a sweep. Evidence first: hand to the Investigator.' },
  { at: 1, agent: 1, kind: 'call', text: 'NPCI · status → debit success, credit DEEMED, no TCC' },
  { at: 2, agent: 1, kind: 'fail', text: 'Kaveri Bank · credit confirmation → 504, retrying… 504' },
  { at: 3, agent: 1, kind: 'think', text: 'Their API is down. NPCI is the record of truth: never credited.' },
  { at: 4, agent: 2, kind: 'call', text: 'RBI 4(a) · refund by T+1 23:59 · 10h 28m left · ₹0 owed now' },
  { at: 5, agent: 3, kind: 'call', text: 'Risk 0/100 · re-checked NPCI & ledger · auto-approved' },
  { at: 6, agent: 3, kind: 'done', text: 'Refunded ₹3,500 · chargeback UDIR raised on Kaveri Bank' },
]

export default function HeroPreview() {
  const [t, setT] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setT((x) => (x + 1) % 10), 1100)
    return () => clearInterval(id)
  }, [])
  const shown = LINES.filter((l) => l.at <= t)
  const active = t >= 7 ? -1 : (shown[shown.length - 1]?.agent ?? 0)
  const done = t >= 7

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-10 rounded-[3rem] bg-gradient-to-tr from-violet-600/30 via-indigo-500/10 to-sky-400/20 blur-3xl" />
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0c0e18]/90 shadow-2xl shadow-black/60 backdrop-blur">
        <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-white/10" /><span className="h-2.5 w-2.5 rounded-full bg-white/10" /><span className="h-2.5 w-2.5 rounded-full bg-white/10" />
          <span className="ml-3 text-[11.5px] font-medium text-white/40">UPI exceptions desk</span>
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10.5px] font-medium text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> AI agents live
          </span>
        </div>

        <div className="px-5 pt-4">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-[13.5px] font-medium text-white/90">Neha’s ₹3,500 is stuck and the other bank is down.</p>
            <span className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px] ${done ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}>
              {done ? 'deadline met · 10h 28m spare' : 'T+1 · 10h 28m left'}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-1.5">
            {AGENTS.map((a, i) => {
              const finished = done || (active > i)
              const working = active === i
              return (
                <div key={a.id} className={`rounded-lg border px-2 py-1.5 transition duration-500 ${
                  working ? 'border-violet-400/60 bg-violet-500/10' : finished ? 'border-white/10 bg-white/[0.03]' : 'border-white/5'}`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`grid h-4 w-4 place-items-center rounded bg-gradient-to-br ${a.tone} ${finished || working ? '' : 'opacity-30'}`}>
                      {finished ? <Icon name="check" className="h-2.5 w-2.5 text-white" /> : null}
                    </span>
                    <span className={`truncate text-[10.5px] font-medium ${working ? 'text-white' : finished ? 'text-white/70' : 'text-white/30'}`}>{a.name}</span>
                  </div>
                  <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-white/5">
                    <div className={`h-full rounded-full bg-gradient-to-r ${a.tone} transition-all duration-700 ${finished ? 'w-full' : working ? 'w-1/2' : 'w-0'}`} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <ul className="mt-3 h-[178px] space-y-1.5 overflow-hidden px-5 font-mono text-[11.5px]">
          {shown.slice(-4).map((l) => (
            <li key={l.at} className="step-in flex gap-2">
              <span className={`mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full ${
                l.kind === 'fail' ? 'bg-rose-400' : l.kind === 'done' ? 'bg-emerald-400' : l.kind === 'think' ? 'bg-violet-400' : 'bg-sky-400'}`} />
              <span className={l.kind === 'think' ? 'italic text-white/55' : l.kind === 'fail' ? 'text-rose-300/90' : l.kind === 'done' ? 'text-emerald-300' : 'text-white/75'}>
                <span className="text-white/30">{AGENTS[l.agent].name.toLowerCase()} </span>{l.text}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex items-end justify-between border-t border-white/5 px-5 py-4">
          <div>
            <div className={`font-display text-[44px] font-semibold leading-none tracking-tight transition duration-500 ${done ? 'text-emerald-300' : 'text-white/20'}`}>₹0</div>
            <div className="mt-1 text-[11px] text-white/40">penalty paid</div>
          </div>
          <div className="text-right font-mono text-[10.5px] leading-relaxed text-white/40">
            <div><span className="text-white/80">{Math.min(t + 1, 4)}</span> agents · <span className="text-white/80">{Math.min(t * 2, 14)}</span> system calls</div>
            <div>traced in neatlogs</div>
          </div>
        </div>
      </div>
    </div>
  )
}
