'use client'

import { rs, type Case, type Outcome, type RunState, type Snapshot } from '@/lib/run'
import { Icon } from '../meta'
import Countdown from './Countdown'

function changes(b?: Snapshot | null, s?: Snapshot | null): { what: string; from: string; to: string }[] {
  if (!b || !s) return []
  const out: { what: string; from: string; to: string }[] = []
  if (s.role === 'REMITTER' && b.cbs.balance_paise !== s.cbs.balance_paise)
    out.push({ what: `${s.cbs.name}'s balance`, from: rs(b.cbs.balance_paise), to: rs(s.cbs.balance_paise) })
  for (const x of s.cbs.suspense) {
    const was = b.cbs.suspense.find((y) => y.id === x.id)
    if (was && was.status !== x.status) out.push({ what: `Suspense ${x.id}`, from: was.status.toLowerCase(), to: x.status.toLowerCase() })
  }
  if (b.npci.reversal_leg !== s.npci.reversal_leg) out.push({ what: 'NPCI reversal', from: b.npci.reversal_leg.toLowerCase().replace('_', ' '), to: s.npci.reversal_leg.toLowerCase() })
  for (const c of s.npci.complaints.filter((c) => !b.npci.complaints.some((x) => x.id === c.id)))
    out.push({ what: `NPCI ${c.type.toLowerCase().replace(/_/g, ' ')}`, from: 'none', to: c.id })
  if ((s.bene.lien_paise ?? 0) !== (b.bene.lien_paise ?? 0))
    out.push({ what: `Frozen at ${s.bene.bank}`, from: rs(b.bene.lien_paise ?? 0), to: rs(s.bene.lien_paise) })
  for (const r of s.ncrp.our_reports.filter((r) => !b.ncrp.our_reports.some((x) => x.ack_no === r.ack_no))) out.push({ what: 'Cybercrime report', from: 'none', to: r.ack_no })
  for (const v of s.cbs.blocked_vpas.filter((v) => !b.cbs.blocked_vpas.includes(v))) out.push({ what: `Payee ${v}`, from: 'allowed', to: 'blocked' })
  return out
}

function Hero({ o }: { o: Outcome }) {
  if (o.status === 'AWAITING_APPROVAL') return null
  const big = o.deadline ? rs(o.penalty_paid_paise) : o.frozen_paise ? rs(o.frozen_paise) : 'Closed'
  const sub = o.deadline ? 'penalty paid' : o.frozen_paise ? 'frozen before it moved' : ''
  return (
    <section className="step-in rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white p-4">
      <div className="flex items-baseline gap-2">
        <span className="font-serif text-[52px] leading-none text-emerald-600">{big}</span>
        <span className="text-[13px] font-medium text-slate-500">{sub}</span>
      </div>
      <p className="mt-1.5 text-[14px] font-semibold text-slate-900">{o.headline}</p>
      {o.deadline && (
        <p className="mt-1 text-[12px] text-slate-500">
          Deadline {o.deadline.tat} · {o.deadline.deadline_at.slice(0, 10)} 23:59 · <b className="text-emerald-700">met</b>
        </p>
      )}
    </section>
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
  const diffs = changes(run.before, live)
  const turns = Object.values(run.usage).reduce((n, u) => n + u.llm_calls, 0)
  const tokens = Object.values(run.usage).reduce((n, u) => n + u.input_tokens + u.output_tokens, 0)
  const calls = run.steps.filter((s) => s.kind === 'call').length
  const started = run.phase !== 'idle'

  return (
    <aside className="no-scrollbar min-h-0 space-y-3 overflow-y-auto border-l border-slate-200 bg-slate-50/50 p-4">
      {!o && (kase.deadline_at ? (
        <section className="rounded-2xl bg-ink p-4 text-white">
          <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-widest text-slate-400">
            <span>Penalty clock</span>
            <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono normal-case tracking-normal text-slate-300">{kase.rule}</span>
          </div>
          <div className="mt-3 font-mono text-[38px] font-semibold leading-none tracking-tight text-amber-300"><Countdown deadline={kase.deadline_at} /></div>
          <p className="mt-1.5 text-[12px] text-slate-400">left · deadline {kase.deadline_at.slice(0, 10)} 23:59 IST</p>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-[12px]">
            <div><div className="text-slate-400">Penalty so far</div><div className="font-serif text-[24px] text-emerald-300">₹0</div></div>
            <div><div className="text-slate-400">After deadline</div><div className="font-serif text-[24px] text-rose-300">₹100<span className="font-sans text-[12px] text-slate-400">/day</span></div></div>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl bg-ink p-4 text-white">
          <div className="text-[11px] font-medium uppercase tracking-widest text-slate-400">What’s at stake</div>
          <p className="mt-2 font-serif text-[20px] leading-snug">
            {kase.id === 'collect-fraud' ? `${rs(kase.amount_paise)} sits in a 2-day-old account. Every minute it can move to the next mule.`
              : 'Left unanswered this becomes a chargeback the other bank must fight, then an RBI Ombudsman complaint.'}
          </p>
        </section>
      ))}

      {o && <Hero o={o} />}

      {o?.status === 'AWAITING_APPROVAL' && (
        <section className="step-in glow-amber rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-amber-700">Needs your approval</div>
          <p className="mt-1 text-[13px] font-medium leading-snug text-amber-950">{o.human_reason}. Nothing has moved yet.</p>
          <ul className="mt-2 space-y-0.5 text-[12px] text-amber-900">
            {o.actions.map((a, i) => <li key={i}>• {a.type.toLowerCase().replace(/_/g, ' ')}{a.amount_paise ? ` ${rs(a.amount_paise)}` : ''}</li>)}
          </ul>
          <div className="mt-3 flex gap-2">
            <button disabled={deciding} onClick={() => onDecide(true)}
              className="flex-1 rounded-xl bg-emerald-600 px-3 py-2.5 text-[13px] font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50">
              Approve & execute
            </button>
            <button disabled={deciding} onClick={() => onDecide(false)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50">
              Reject
            </button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h4 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">What changed in the bank’s systems</h4>
        {diffs.length ? (
          <ul className="mt-2 space-y-1.5">
            {diffs.map((d) => (
              <li key={d.what} className="step-in text-[12px]">
                <div className="font-medium text-slate-700">{d.what}</div>
                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                  <span className="text-slate-400 line-through">{d.from}</span>
                  <Icon name="arrow" className="h-3 w-3 text-emerald-500" />
                  <span className="font-semibold text-emerald-700">{d.to}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[12px] text-slate-400">{started ? 'Nothing has moved yet. Agents only act after the facts are re-checked.' : 'Real records: balances, suspense, NPCI legs, liens. Changes appear here live.'}</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h4 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Proof it’s AI, not a script</h4>
        <div className="mt-2 grid grid-cols-2 gap-1.5 text-center">
          <Stat v={String(turns)} k="AI turns" />
          <Stat v={`${(run.elapsedMs / 1000).toFixed(0)}s`} k="elapsed" />
          <Stat v={String(calls)} k="system calls" />
          <Stat v={tokens ? `${Math.round(tokens / 1000)}k` : '0'} k="tokens" />
        </div>
        {run.traceUrl ? (
          <a href={run.traceUrl} target="_blank" rel="noreferrer"
            className="mt-3 flex items-center justify-between rounded-xl bg-slate-900 px-3 py-2.5 text-[12.5px] font-semibold text-white transition hover:bg-slate-700">
            Open this run’s trace in neatlogs <span aria-hidden>↗</span>
          </a>
        ) : (
          <p className="mt-3 text-[11.5px] text-slate-400">{started ? 'Trace link appears when tracing is on.' : 'Every run is traced turn by turn in neatlogs.'}</p>
        )}
      </section>
    </aside>
  )
}

function Stat({ v, k }: { v: string; k: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-1 py-2">
      <div key={v} className="pop font-mono text-[17px] font-semibold text-slate-900">{v}</div>
      <div className="text-[10px] text-slate-500">{k}</div>
    </div>
  )
}
