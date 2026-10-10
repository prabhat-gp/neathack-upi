'use client'

import { rs, type Case, type Outcome, type RunState, type Snapshot } from '@/lib/run'
import { Icon } from '../meta'
import { Countdown } from './Orchestrator'

const ACTION: Record<string, string> = {
  REVERSE_DEBIT: 'Refund customer', RAISE_CHARGEBACK: 'Chargeback to other bank', RETURN_TO_REMITTER: 'Return to sender bank (RET)',
  PAY_TAT_COMPENSATION: 'Pay compensation', RAISE_DUPLICATE_REFUND: 'Duplicate refund', REQUEST_LIEN: 'Freeze funds (lien)',
  FILE_NCRP_REPORT: 'Cybercrime report', RAISE_FRAUD_REPORT: 'UDIR fraud report', BLOCK_PAYEE_VPA: 'Block payee', SHARE_PROOF_OF_CREDIT: 'Share proof of credit',
  MONITOR: 'Monitor',
}

const STAKE: Record<string, { title: string; text: string }> = {
  'not-received': { title: 'What’s at stake', text: 'Left unanswered, this becomes a chargeback the other bank must fight, then a complaint to the RBI Ombudsman.' },
  'collect-fraud': { title: 'What’s at stake', text: '₹49,999 sits in a 2-day-old account. Every minute it can move on to the next mule account.' },
}

function changes(b?: Snapshot | null, s?: Snapshot | null): string[] {
  if (!b || !s) return []
  const out: string[] = []
  if (s.role === 'REMITTER' && b.cbs.balance_paise !== s.cbs.balance_paise)
    out.push(`${s.cbs.name}'s balance ${rs(b.cbs.balance_paise)} → ${rs(s.cbs.balance_paise)}`)
  for (const x of s.cbs.suspense) {
    const was = b.cbs.suspense.find((y) => y.id === x.id)
    if (was && was.status !== x.status) out.push(`Suspense ${x.id} ${was.status.toLowerCase()} → ${x.status.toLowerCase()}`)
  }
  if (b.npci.reversal_leg !== s.npci.reversal_leg) out.push(`NPCI reversal leg ${b.npci.reversal_leg} → ${s.npci.reversal_leg}`)
  for (const c of s.npci.complaints.filter((c) => !b.npci.complaints.some((x) => x.id === c.id)))
    out.push(`NPCI ${c.type.toLowerCase().replace('_', ' ')} ${c.id} · ${c.status.toLowerCase().replace('_', ' ')}`)
  if ((s.bene.lien_paise ?? 0) !== (b.bene.lien_paise ?? 0)) out.push(`${s.bene.bank} lien on ${s.bene.holder_name}: ${rs(s.bene.lien_paise)}`)
  for (const r of s.ncrp.our_reports.filter((r) => !b.ncrp.our_reports.some((x) => x.ack_no === r.ack_no))) out.push(`NCRP report ${r.ack_no} filed`)
  for (const v of s.cbs.blocked_vpas.filter((v) => !b.cbs.blocked_vpas.includes(v))) out.push(`${v} blocked for this customer`)
  return out
}

function Hero({ o, kase }: { o: Outcome; kase: Case }) {
  if (o.status === 'AWAITING_APPROVAL') {
    return (
      <div>
        <div className="font-serif text-[44px] leading-none text-amber-600">Held</div>
        <p className="mt-1 text-[13px] text-slate-600">for one-click human approval</p>
      </div>
    )
  }
  if (o.deadline) {
    return (
      <div>
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-[56px] leading-none text-emerald-600">{rs(o.penalty_paid_paise)}</span>
          <span className="text-[13px] font-medium text-slate-500">penalty paid</span>
        </div>
        <p className="mt-1.5 text-[14px] font-semibold text-slate-900">{o.headline}</p>
        <DeadlineBar start={kase.initiated_at!} deadline={o.deadline.deadline_at} />
      </div>
    )
  }
  if (o.frozen_paise) {
    return (
      <div>
        <div className="font-serif text-[52px] leading-none text-emerald-600">{rs(o.frozen_paise)}</div>
        <p className="mt-1 text-[13px] text-slate-600">frozen in the scammer’s account before it moved</p>
      </div>
    )
  }
  return (
    <div>
      <div className="font-serif text-[48px] leading-none text-emerald-600">Closed</div>
      <p className="mt-1 text-[13px] text-slate-600">{o.headline}</p>
    </div>
  )
}

function DeadlineBar({ start, deadline }: { start: string; deadline: string }) {
  const s = new Date(start).getTime()
  const d = new Date(deadline).getTime()
  const pct = Math.min(100, Math.max(2, ((Date.now() - s) / (d - s)) * 100))
  return (
    <div className="mt-3">
      <div className="relative h-2 rounded-full bg-slate-100">
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500" style={{ width: `${pct}%` }} />
        <div className="absolute -top-1 h-4 w-1 rounded bg-emerald-700" style={{ left: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-400">
        <span>paid {start.slice(5, 16).replace('T', ' ')}</span>
        <span>deadline {deadline.slice(5, 10)} 23:59</span>
      </div>
    </div>
  )
}

export default function ResultPanel({ kase, run, live, deciding, onDecide }: {
  kase?: Case
  run: RunState
  live: Snapshot | null
  deciding: boolean
  onDecide: (approve: boolean) => void
}) {
  if (!kase) return <aside className="border-l border-slate-200" />
  const o = run.outcome
  const calls = run.steps.filter((s) => s.kind === 'call')
  const parties = new Set(calls.map((c) => c.party)).size
  const stake = STAKE[kase.id]
  const diffs = changes(run.before, live)

  return (
    <aside className="no-scrollbar min-h-0 space-y-3 overflow-y-auto border-l border-slate-200 bg-white p-4">
      {!o && (
        <>
          {kase.deadline_at ? (
            <section className="rounded-2xl bg-ink p-4 text-white">
              <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-widest text-slate-400">
                <span>Penalty clock</span>
                <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono normal-case tracking-normal text-slate-300">{kase.rule}</span>
              </div>
              <div className="mt-3 font-mono text-[40px] font-semibold leading-none tracking-tight text-amber-300">
                <Countdown deadline={kase.deadline_at} />
              </div>
              <p className="mt-1.5 text-[12px] text-slate-400">until the deadline · {kase.deadline_at.slice(0, 10)} 23:59 IST</p>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-[12px]">
                <div><div className="text-slate-400">Penalty so far</div><div className="font-serif text-[26px] leading-tight text-emerald-300">₹0</div></div>
                <div><div className="text-slate-400">After deadline</div><div className="font-serif text-[26px] leading-tight text-rose-300">₹100<span className="font-sans text-[12px] text-slate-400">/day</span></div></div>
              </div>
            </section>
          ) : stake && (
            <section className="rounded-2xl bg-ink p-4 text-white">
              <div className="text-[11px] font-medium uppercase tracking-widest text-slate-400">{stake.title}</div>
              <p className="mt-2 font-serif text-[22px] leading-snug">{stake.text}</p>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 p-4">
            <h4 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{run.phase === 'running' ? 'Agents at work' : 'Without DisputePro'}</h4>
            {run.phase === 'running' ? (
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat v={(run.elapsedMs / 1000).toFixed(1) + 's'} k="elapsed" />
                <Stat v={String(calls.length)} k="API calls" />
                <Stat v={String(parties)} k="parties" />
              </div>
            ) : (
              <ul className="mt-2 space-y-1.5 text-[12.5px] leading-snug text-slate-600">
                {kase.trigger === 'sweep' ? (
                  <>
                    <li>• Surfaces only in the next day’s manual reconciliation</li>
                    <li>• An analyst then checks core banking, NPCI and the other bank by hand</li>
                    <li>• Late fixes pay ₹100/day; late returns lose the chargeback</li>
                  </>
                ) : (
                  <>
                    <li>• Ticket waits in the dispute queue</li>
                    <li>• Analyst logs into 3–4 systems and emails the other bank</li>
                    <li>• Customer chases, escalates, or goes to the Ombudsman</li>
                  </>
                )}
              </ul>
            )}
          </section>
        </>
      )}

      {o && (
        <section className="step-in space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50/80 to-white p-4">
            <Hero o={o} kase={kase} />
          </div>

          {o.status === 'AWAITING_APPROVAL' && (
            <div className="glow-amber rounded-2xl border-2 border-amber-300 bg-amber-50 p-3">
              <p className="text-[12.5px] font-medium text-amber-900">{o.human_reason}. Nothing has moved yet.</p>
              <div className="mt-2.5 flex gap-2">
                <button disabled={deciding} onClick={() => onDecide(true)}
                  className="flex-1 rounded-xl bg-emerald-600 px-3 py-2.5 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  Approve & execute
                </button>
                <button disabled={deciding} onClick={() => onDecide(false)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  Reject
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-4 gap-1.5 text-center">
            <Stat v={`${o.ops.seconds}s`} k="end to end" />
            <Stat v={String(o.ops.api_calls)} k="API calls" />
            <Stat v={String(o.ops.parties.length)} k="parties" />
            <Stat v={String(o.ops.human_touches)} k="analyst touches" />
          </div>

          <div>
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-400">What the agents did</h4>
            <ul className="space-y-1">
              {o.actions.map((a, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${a.state === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    <Icon name={a.state === 'done' ? 'check' : 'guard'} className="h-3 w-3" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium text-slate-800">{ACTION[a.type] ?? a.type}</span>
                    {a.ref && <span className="block truncate font-mono text-[10px] text-slate-400">{a.ref}</span>}
                  </span>
                  {a.amount_paise > 0 && <span className="font-mono text-[11.5px] font-semibold text-slate-700">{rs(a.frozen_paise ?? a.amount_paise)}</span>}
                </li>
              ))}
            </ul>
          </div>

          {diffs.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Changed in live systems</h4>
              <ul className="space-y-1">
                {diffs.map((d) => (
                  <li key={d} className="step-in flex gap-2 text-[12px] text-slate-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />{d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {o.customer_message && (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                {o.customer_message.startsWith('Ops note') ? 'Ops note' : 'Sent to customer'}
              </h4>
              <p className="rounded-xl bg-slate-50 p-3 text-[12.5px] leading-relaxed text-slate-700">{o.customer_message.replace(/^Ops note: /, '')}</p>
            </div>
          )}
          {o.citation && <p className="text-[10.5px] leading-relaxed text-slate-400">{o.citation}</p>}
        </section>
      )}
    </aside>
  )
}

function Stat({ v, k }: { v: string; k: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-1 py-2">
      <div className="font-mono text-[16px] font-semibold text-slate-900">{v}</div>
      <div className="text-[10px] leading-tight text-slate-500">{k}</div>
    </div>
  )
}
