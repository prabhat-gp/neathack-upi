'use client'

import { useEffect, useState } from 'react'
import { API_URL } from '@/lib/run'

type Metrics = {
  llm_runs: number
  deadline_cases: number
  deadlines_met: number
  penalty_paid_inr: number
  refunded_inr: number
  avg_seconds_per_case: number | null
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`

// Read from the run ledger: only cases the agents actually worked.
export default function DeskNumbers() {
  const [m, setM] = useState<Metrics | null>(null)
  useEffect(() => {
    fetch(`${API_URL}/api/metrics`).then((r) => r.json()).then(setM).catch(() => {})
  }, [])
  if (!m || !m.llm_runs) return null
  const items = [
    [String(m.llm_runs), 'cases worked by the AI agents'],
    [`${m.deadlines_met}/${m.deadline_cases}`, 'RBI deadlines met'],
    [inr(m.penalty_paid_inr), 'penalties paid'],
    [inr(m.refunded_inr), 'returned to customers'],
    [m.avg_seconds_per_case ? `${Math.round(m.avg_seconds_per_case)} s` : '—', 'average time per case'],
  ]
  return (
    <div className="border-y border-white/10 bg-[#0b1426]">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-y-6 px-6 py-8 sm:grid-cols-3 lg:grid-cols-5">
        {items.map(([v, k]) => (
          <div key={k} className="lg:border-l lg:border-white/10 lg:pl-6 lg:first:border-0 lg:first:pl-0">
            <p className="font-display text-3xl font-semibold tracking-tight text-white tabular-nums">{v}</p>
            <p className="mt-1 text-xs text-white/45">{k}</p>
          </div>
        ))}
      </div>
      <p className="mx-auto max-w-7xl px-6 pb-5 text-[11px] text-white/30">Live from the desk’s run ledger · sandbox bank</p>
    </div>
  )
}
