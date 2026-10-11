'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@/components/meta'

// Clearly labelled illustration of the bank-ledger workflow; not a live or measured run.
const STEPS = [
  { id: 'orchestrator', name: 'Master agent', did: 'Picks the next failed payment from the ledger' },
  { id: 'investigator', name: 'Investigator', did: 'Reconciles remitter, NPCI and receiving bank records' },
  { id: 'policy', name: 'RBI Policy', did: 'Checks the deadline, bank authority and compensation' },
  { id: 'resolver', name: 'Resolver', did: 'Resolves within limits or routes to human review' },
]

export default function SquadHero() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setI(STEPS.length + 1)
      return
    }
    const t = setInterval(() => setI((n) => (n > STEPS.length + 2 ? 0 : n + 1)), 1100)
    return () => clearInterval(t)
  }, [])
  const done = i > STEPS.length

  return (
    <div className="relative rounded-2xl border border-white/10 bg-[#0d1830]/80 p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,.6)] backdrop-blur sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[.16em] text-white/40">
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Illustrated workflow · T01
        </span>
        <span className="font-mono normal-case tracking-normal">Live model shown in desk</span>
      </div>

      <div className="mt-5 rounded-xl border border-white/10 bg-white/[.04] p-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-sky-300">
          <Icon name="complaint" className="h-3.5 w-3.5" /> Bank exception ledger
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-white/90">₹2,450 debited · beneficiary credit missing</p>
      </div>

      <ol className="mt-4 space-y-1.5">
        {STEPS.map((s, n) => {
          const state = i > n + 1 || done ? 'done' : i === n + 1 ? 'running' : 'idle'
          return (
            <li key={s.id}
              className={`flex items-start gap-3 rounded-lg px-3 py-2 transition-all duration-500 ${state === 'running' ? 'bg-blue-500/15 ring-1 ring-blue-400/40' : ''} ${state === 'idle' ? 'opacity-35' : ''}`}>
              <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md ${state === 'done' ? 'bg-emerald-400/15 text-emerald-300' : state === 'running' ? 'bg-blue-400/20 text-blue-200' : 'bg-white/5 text-white/50'}`}>
                <Icon name={state === 'done' ? 'check' : s.id} className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-white">{s.name}{state === 'running' && <span className="ml-2 text-xs font-normal text-blue-300">illustration</span>}</p>
                <p className="text-[12px] leading-5 text-white/50">{s.did}</p>
              </div>
            </li>
          )
        })}
      </ol>

      <div className={`mt-4 rounded-xl border p-4 transition-all duration-700 ${done ? 'border-emerald-400/30 bg-emerald-400/10 opacity-100' : 'border-white/5 bg-white/[.02] opacity-40'}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-display text-2xl font-semibold tracking-tight text-white">Evidence → decision</p>
          <p className="text-sm font-medium text-emerald-300">Mandatory policy gate</p>
        </div>
        <p className="mt-1 text-[12px] text-white/55">Actual run time and model activity are visible in the bank desk</p>
      </div>
    </div>
  )
}
