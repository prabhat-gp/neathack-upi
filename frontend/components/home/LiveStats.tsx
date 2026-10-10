'use client'

import { useEffect, useRef, useState } from 'react'
import { API_URL } from '@/lib/run'

type Metrics = { llm_runs: number; deadline_cases: number; deadlines_met: number; penalty_paid_inr: number; avg_seconds_per_case: number | null; avg_party_calls_per_case: number | null }

function CountUp({ to, prefix = '', suffix = '' }: { to: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const t0 = performance.now()
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / 1100)
        setN(Math.round(to * (1 - Math.pow(1 - p, 3))))
        if (p < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    })
    io.observe(el)
    return () => io.disconnect()
  }, [to])
  return <span ref={ref} className="tabular-nums">{prefix}{n.toLocaleString('en-IN')}{suffix}</span>
}

export default function LiveStats() {
  const [m, setM] = useState<Metrics | null>(null)
  useEffect(() => {
    fetch(`${API_URL}/api/metrics`).then((r) => r.json()).then(setM).catch(() => {})
  }, [])
  if (!m || !m.llm_runs) return null
  const items = [
    { v: <CountUp to={m.llm_runs} />, k: 'cases worked end to end by the AI agents' },
    { v: <><CountUp to={m.deadlines_met} /><span className="text-white/30">/{m.deadline_cases}</span></>, k: 'RBI deadlines met' },
    { v: <CountUp to={m.penalty_paid_inr} prefix="₹" />, k: 'compensation paid' },
    { v: <CountUp to={Math.round(m.avg_seconds_per_case ?? 0)} suffix="s" />, k: 'average time per case, start to finish' },
  ]
  return (
    <div className="grid grid-cols-2 gap-y-10 md:grid-cols-4">
      {items.map((it) => (
        <div key={it.k} className="border-l border-white/10 pl-6">
          <div className="font-display text-[44px] font-semibold leading-none tracking-[-0.03em] text-white">{it.v}</div>
          <p className="mt-3 max-w-[13rem] text-[13px] leading-snug text-white/50">{it.k}</p>
        </div>
      ))}
    </div>
  )
}
