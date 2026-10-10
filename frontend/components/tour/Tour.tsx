'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

export type TourStep = {
  /** data-tour value of the element to highlight; none = centred card */
  target?: string
  title: string
  body: ReactNode
  /** false while the tour waits for something to happen (a live agent, the visitor typing) */
  ready?: boolean
  waiting?: string
  /** the visitor finishes this step by acting in the page, not with Next */
  action?: string
  onEnter?: () => void
  extra?: ReactNode
}

type Rect = { top: number; left: number; width: number; height: number }

export const TOUR_SEEN = 'dp-tour-seen'
export const TOUR_STAGE = 'dp-tour-stage'
export function tourStore(key: string, value?: string | null) {
  try {
    if (value === undefined) return localStorage.getItem(key)
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {}
  return null
}

export default function Tour({ steps, open, onClose, first = 1, total }: {
  steps: TourStep[]
  open: boolean
  onClose: (finished: boolean) => void
  first?: number
  total?: number
}) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [mobile, setMobile] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  const step = steps[Math.min(i, steps.length - 1)]
  const enter = useRef(step?.onEnter)
  enter.current = step?.onEnter

  useEffect(() => {
    if (open) setI(0)
  }, [open])
  useEffect(() => {
    if (!open) return
    enter.current?.()
    const el = step?.target && document.querySelector(`[data-tour="${step.target}"]`)
    if (el) {
      const r = el.getBoundingClientRect()
      if (r.bottom < 0 || r.top > window.innerHeight) el.scrollIntoView({ block: 'nearest' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, open])

  // Follow the target as the page moves (live map, polling, scrolling).
  useEffect(() => {
    if (!open) return
    let raf = 0
    const tick = () => {
      setMobile(window.innerWidth < 640)
      const el = step?.target ? document.querySelector(`[data-tour="${step.target}"]`) : null
      const r = el?.getBoundingClientRect()
      setRect((prev) => {
        if (!r || r.width === 0) return null
        const next = { top: r.top, left: r.left, width: r.width, height: r.height }
        return prev && Math.abs(prev.top - next.top) < 0.5 && Math.abs(prev.left - next.left) < 0.5 && prev.width === next.width && prev.height === next.height ? prev : next
      })
      raf = window.setTimeout(tick, 100) as unknown as number
    }
    tick()
    return () => clearTimeout(raf)
  }, [open, step?.target])

  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(false)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open, onClose])

  if (!open || !step) return null
  const last = i === steps.length - 1
  const ready = step.ready !== false
  const pad = 6

  // The card stays docked in one corner so it never jumps or covers the live agents; the target just glows.
  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" aria-live="polite">
      {rect && (
        <div className="tour-glow absolute rounded-xl"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      )}
      {!step.target && <div className="absolute inset-0 bg-[#0b1426]/40" />}
      <div ref={card} role="dialog" aria-label={`Tour: ${step.title}`}
        className={`pointer-events-auto absolute rounded-2xl border border-slate-200 bg-white p-5 text-[#17243b] shadow-[0_20px_60px_-10px_rgba(11,20,38,.45)] ${mobile ? 'inset-x-3 bottom-3' : step.target ? `bottom-5 w-[340px] ${rect && rect.left + rect.width / 2 < window.innerWidth / 2 ? 'right-5' : 'left-5'}` : 'left-1/2 top-1/2 w-[420px] -translate-x-1/2 -translate-y-1/2'}`}>
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[.16em] text-blue-600">
          <span>Quick tour · {first + i} of {total ?? steps.length}</span>
          <button onClick={() => onClose(false)} className="text-slate-400 hover:text-slate-700">Skip tour</button>
        </div>
        <h3 className="mt-3 font-display text-lg font-semibold tracking-tight">{step.title}</h3>
        <div className="mt-2 text-[13.5px] leading-6 text-slate-600">{step.body}</div>
        {step.extra}
        <div className="mt-4 flex items-center justify-between gap-3">
          <button onClick={() => setI((n) => Math.max(0, n - 1))} disabled={i === 0}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 disabled:invisible">← Back</button>
          {step.action ? (
            <span className="flex items-center gap-2 text-xs font-medium text-blue-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" /> {step.action}
            </span>
          ) : !ready ? (
            <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span className="h-2 w-2 animate-pulse rounded-full bg-violet-500" /> {step.waiting ?? 'Waiting…'}
            </span>
          ) : (
            <button autoFocus onClick={() => (last ? onClose(true) : setI((n) => n + 1))} className="desk-button desk-primary">
              {last ? 'Finish tour' : 'Next →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
