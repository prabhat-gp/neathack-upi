'use client'

import Link from 'next/link'
import type { DeskCase, NodeId, RunState } from '@/lib/run'
import { NODE_META } from '@/components/meta'

/** Optional, in-flow guidance. Never blocks a control or changes the selected agent. */
export default function Tour({
  view,
  onClose,
  kase,
  run,
  active,
}: {
  view: 'customer' | 'bank'
  onClose: () => void
  kase?: DeskCase
  run?: RunState
  active?: NodeId
}) {
  const outcome = run?.outcome?.status
  const ended = run?.phase === 'done' || run?.phase === 'error'
  const needsInfo = outcome === 'NEEDS_INFO' || kase?.status === 'NEEDS_INFO'
  const review = run?.phase === 'awaiting' || kase?.status === 'NEEDS_YOU'
  const interrupted =
    run?.phase === 'error' ||
    ['FAILED', 'ESCALATED'].includes(kase?.status ?? '')
  const stage =
    view === 'customer'
      ? 0
      : ended || review || needsInfo || interrupted
        ? 2
        : 1
  const title =
    view === 'customer'
      ? 'Start with a customer’s problem'
      : needsInfo
        ? 'The agents need one more detail'
        : review
          ? 'A person needs to review the proposed actions'
          : interrupted
            ? 'This case needs further review'
            : ended
              ? 'Check the outcome, then read the customer’s reply'
              : active
                ? `${NODE_META[active].label} is working`
                : kase
                  ? 'Your case is waiting for the agent team'
                  : 'Choose a case to explore its investigation'
  const body =
    view === 'customer'
      ? 'Choose a sandbox story or write your own. Send opens a handoff; the investigation starts when you enter the bank desk.'
      : needsInfo
        ? 'Return to the customer conversation and answer the question. The same case can then continue.'
        : review
          ? 'Review the exact actions and supporting records in the resolution panel. Approve, decline, or escalate there.'
          : interrupted
            ? 'Read the recorded result and any confirmed actions. Further review is required before the case can close.'
            : ended
              ? 'The resolution panel records what happened. Inspect any agent for its evidence or return to the customer conversation.'
              : 'Select an agent to inspect its work. Follow live returns to the current step. This guide follows the actual route, including skipped agents.'
  return (
    <section
      aria-label="Case journey guide"
      className="shrink-0 border-b border-blue-100 bg-blue-50/70 px-5 py-4"
    >
      <div className="flex items-start justify-between gap-3">
        <ol
          aria-label="Case journey"
          className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-semibold uppercase tracking-wider"
        >
          {['Customer', 'Agent investigation', 'Outcome'].map((label, i) => (
            <li
              key={label}
              aria-current={i === stage ? 'step' : undefined}
              className={i === stage ? 'text-blue-700' : 'text-slate-400'}
            >
              {i + 1} · {label}
            </li>
          ))}
        </ol>
        <button
          onClick={onClose}
          className="shrink-0 text-xs text-slate-500 hover:text-slate-900"
        >
          Exit guide
        </button>
      </div>
      <div role="status" aria-live="polite">
        <h2 className="mt-3 text-sm font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
          {body}
        </p>
      </div>
      {view === 'bank' &&
        kase &&
        (ended || needsInfo || interrupted) &&
        kase.channel !== 'RECON' && (
          <Link
            href={`/app?c=${encodeURIComponent(kase.customer_id)}&case=${encodeURIComponent(kase.id)}`}
            className="mt-3 inline-flex text-xs font-semibold text-blue-700"
          >
            {needsInfo
              ? 'Answer the bank’s question →'
              : 'View customer conversation →'}
          </Link>
        )}
    </section>
  )
}
