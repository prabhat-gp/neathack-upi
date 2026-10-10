'use client'

import { useEffect, useRef } from 'react'

export default function Countdown({ deadline, compact }: { deadline: string; compact?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const tick = () => {
      const s = Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000))
      const d = Math.floor(s / 86400)
      const h = Math.floor((s % 86400) / 3600)
      const m = Math.floor((s % 3600) / 60)
      const pad = (n: number) => String(n).padStart(2, '0')
      if (ref.current) ref.current.textContent = d ? `${d}d ${pad(h)}h${compact ? '' : ` ${pad(m)}m`}` : compact ? `${pad(h)}h ${pad(m)}m` : `${pad(h)}:${pad(m)}:${pad(s % 60)}`
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [deadline, compact])
  return <span ref={ref} className="tabular-nums" />
}
