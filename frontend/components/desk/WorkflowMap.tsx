'use client'

import { useEffect, useRef, useState } from 'react'
import { type NodeId, type RunState, type DeskCase } from '@/lib/run'
import { Icon, NODE_META } from '../meta'

const POS: Record<NodeId, [number, number]> = {
  complaint: [24, 28],
  intake: [324, 28],
  orchestrator: [324, 208],
  investigator: [24, 400],
  policy: [324, 400],
  resolver: [624, 400],
  executor: [324, 600],
  human: [624, 600],
  outcome: [324, 800],
}
const JOB: Record<NodeId, string> = {
  complaint: 'The original request',
  intake: 'Identify the right payment',
  orchestrator: 'Choose the next step from evidence',
  investigator: 'Establish where the money went',
  policy: 'Determine the rule and amount owed',
  resolver: 'Propose the appropriate actions',
  executor: 'Recheck guardrails · execute · verify',
  human: 'Review actions outside automatic authority',
  outcome: 'Inspect the result and its proof',
}
export default function WorkflowMap({
  run,
  kase,
  selected,
  onSelect,
  onEdge,
  follow,
  model,
  focusTick,
}: {
  run: RunState
  kase: DeskCase
  selected: NodeId | null
  onSelect: (n: NodeId) => void
  onEdge: (edge: string) => void
  follow: boolean
  model: string | null
  focusTick: number
}) {
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(900)
  useEffect(() => {
    if (!container.current) return
    const ro = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    )
    ro.observe(container.current)
    return () => ro.disconnect()
  }, [])
  const compact = width < 500
  const positions: Record<NodeId, [number, number]> = compact
    ? (Object.fromEntries(
        Object.keys(POS).map((n, i) => [n, [24, 28 + i * 180]]),
      ) as Record<NodeId, [number, number]>)
    : POS
  const mapWidth = compact ? 300 : 900
  const mapHeight = compact ? Object.keys(POS).length * 180 + 50 : 970
  const scale = Math.min(1, width / mapWidth)
  useEffect(() => {
    if (!follow || !selected || !container.current) return
    const y = positions[selected][1] * scale
    const host = container.current
    host.scrollTo({
      top: Math.max(0, y - host.clientHeight / 2 + 100),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    })
  }, [follow, selected, scale, compact, focusTick])
  const edges = Object.entries(run.edges).filter(
    ([, state]) => state === 'active' || state === 'taken',
  )
  return (
    <div
      ref={container}
      className="workflow-scroll"
      aria-label="Agent workflow. Select an agent to inspect its evidence."
    >
      <div
        style={{
          height:
            (mapHeight +
              (compact &&
              ['NEEDS_INFO', 'FAILED', 'ESCALATED'].includes(kase.status)
                ? 180
                : 0)) *
            scale,
          width: mapWidth * scale,
          position: 'relative',
          margin: '0 auto',
        }}
      >
        <div
          className="workflow-map"
          style={{
            width: mapWidth,
            height: mapHeight,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <svg
            className="workflow-lines"
            viewBox={`0 0 ${mapWidth} ${mapHeight}`}
            style={{ width: mapWidth, height: mapHeight }}
            aria-label="Recorded routing decisions"
          >
            <defs>
              <marker
                id="route-arrow"
                markerWidth="7"
                markerHeight="7"
                refX="6"
                refY="3.5"
                orient="auto"
              >
                <path d="M0 0 L7 3.5 L0 7" fill="#849ccc" />
              </marker>
            </defs>
            {edges.map(([edge, state]) => {
              const [from, to] = edge.split('>') as NodeId[]
              if (!positions[from] || !positions[to]) return null
              const [x, y] = positions[from],
                [tx, ty] = positions[to]
              const horizontal = y === ty
              const d = horizontal
                ? tx > x
                  ? `M ${x + 250} ${y + 66} L ${tx} ${ty + 66}`
                  : `M ${x} ${y + 110} L ${tx + 250} ${ty + 110}`
                : `M ${x + 125} ${y + 146} C ${x + 125} ${y + 165}, ${tx + 125} ${ty - 35}, ${tx + 125} ${ty}`
              return (
                <g
                  key={edge}
                  role="button"
                  tabIndex={0}
                  aria-label={`Inspect route ${edge}`}
                  onClick={() => onEdge(edge)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onEdge(edge)
                    }
                  }}
                >
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="20"
                  />
                  <path
                    d={d}
                    fill="none"
                    className={
                      state === 'active' ? 'route-active' : 'route-taken'
                    }
                    strokeWidth="2"
                    markerEnd="url(#route-arrow)"
                  />
                  {!compact &&
                    from === 'orchestrator' &&
                    ['investigator', 'policy', 'resolver'].includes(to) && (
                      <text
                        x={(x + tx) / 2 + 125}
                        y={(y + 146 + ty) / 2 - 5}
                        textAnchor="middle"
                        fontSize="10"
                        fill="#61748c"
                        stroke="#f7f8fb"
                        strokeWidth="4"
                        paintOrder="stroke"
                      >
                        {to === 'investigator'
                          ? 'Investigate'
                          : to === 'policy'
                            ? 'Assess policy'
                            : 'Plan resolution'}
                      </text>
                    )}
                  <title>
                    {edge.replace('>', ' → ')} · {state}
                  </title>
                </g>
              )
            })}
          </svg>
          {(Object.keys(POS) as NodeId[]).map((id) => {
            const st = run.nodes[id]
            const [left, top] = positions[id]
            const calls = run.steps.filter(
              (s) => s.node === id && s.kind === 'call',
            )
            const waiting = id === 'human' && run.phase === 'awaiting'
            const label =
              id === 'complaint' ? kase.channel_label : NODE_META[id].label
            const state = waiting ? 'waiting' : st.status
            const outcome = id === 'outcome' && run.outcome
            return (
              <button
                key={id}
                data-tour={`node-${id}`}
                style={{ left, top }}
                onClick={() => onSelect(id)}
                aria-pressed={selected === id}
                className={`agent-card agent-${state} ${selected === id ? 'agent-selected' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <span className="agent-icon">
                    <Icon name={id} />
                  </span>
                  <span className="font-semibold text-[14px]">{label}</span>
                  <span className="ml-auto state-dot" />
                </div>
                {NODE_META[id].ai && (
                  <p className="mt-1 truncate text-[9px] text-slate-400">
                    {run.brain === 'rules'
                      ? 'Rules fallback'
                      : model
                        ? `AI · ${model}`
                        : 'AI runtime connecting'}
                  </p>
                )}
                <p className="mt-1 text-[12px] leading-5 line-clamp-2 text-slate-500">
                  {outcome ? outcome.headline : st.activity || JOB[id]}
                </p>
                <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wider font-semibold">
                  <span>
                    {state === 'idle'
                      ? 'Not started'
                      : state === 'skipped'
                        ? 'Not required'
                        : state === 'done'
                          ? 'Recorded'
                          : state === 'running'
                            ? 'Working'
                            : 'Needs attention'}
                  </span>
                  <span className="text-slate-400">
                    {calls.length ? `${calls.length} calls ↗` : 'Inspect ↗'}
                  </span>
                </div>
              </button>
            )
          })}
          {kase.status === 'NEEDS_INFO' && (
            <button
              className="workflow-branch"
              style={{
                left: compact ? 24 : 624,
                top: compact ? mapHeight - 20 : 208,
              }}
              onClick={() => onSelect('complaint')}
            >
              <Icon name="complaint" />
              <b>Waiting for customer</b>
              <span>
                {run.outcome?.customer_message ||
                  'A detail is needed before investigation can continue.'}
              </span>
            </button>
          )}
          {(kase.status === 'FAILED' || kase.status === 'ESCALATED') && (
            <button
              className="workflow-branch"
              style={{ left: 24, top: compact ? mapHeight - 20 : 600 }}
              onClick={() => onSelect('outcome')}
            >
              <Icon name="guard" />
              <b>
                {kase.status === 'FAILED'
                  ? 'Run interrupted'
                  : 'Specialist review'}
              </b>
              <span>{kase.headline}</span>
            </button>
          )}
          <div className="absolute left-6 bottom-3 text-[11px] text-slate-400">
            Connections show recorded handoffs. Unused agents remain available
            for inspection.
          </div>
        </div>
      </div>
    </div>
  )
}
