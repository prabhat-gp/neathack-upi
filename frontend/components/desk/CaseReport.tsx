'use client'

import { rs, type NodeId, type Outcome, type RunState } from '@/lib/run'
import { Icon, NODE_META } from '../meta'

export const ACTION: Record<string, string> = {
  REVERSE_DEBIT: 'Customer refund',
  RAISE_CHARGEBACK: 'Chargeback to the other bank',
  RETURN_TO_REMITTER: 'Return to the sending bank',
  PAY_TAT_COMPENSATION: 'Deadline compensation',
  RAISE_DUPLICATE_REFUND: 'Duplicate refund request',
  REQUEST_LIEN: 'Funds hold (lien)',
  FILE_NCRP_REPORT: 'Cybercrime report (NCRP)',
  RAISE_FRAUD_REPORT: 'NPCI fraud report',
  BLOCK_PAYEE_VPA: 'Payee block',
  SHARE_PROOF_OF_CREDIT: 'Proof of credit',
  MONITOR: 'Monitoring, nothing owed',
}

// Older runs (and an occasional model) label evidence with the tool name; show the system instead.
const SOURCE: Record<string, string> = {
  npci_check_status: 'NPCI',
  get_bank_transaction: 'Core banking',
  get_customer_profile: 'Core banking',
  get_statement_window: 'Core banking',
  get_inward_credit: 'Core banking',
  beneficiary_credit_confirmation: 'Other bank',
  beneficiary_account_profile: 'Other bank',
  merchant_order_lookup: 'Acquirer',
  ncrp_lookup: 'NCRP',
  reconciliation_sweep: 'Recon sweep',
}

function Block({
  n,
  title,
  children,
}: {
  n: number
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="step-in" style={{ animationDelay: `${n * 90}ms` }}>
      <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-900 font-mono text-[10px] text-white">
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  )
}

export default function CaseReport({
  o,
  run,
  onReplay,
}: {
  o: Outcome
  run: RunState
  onReplay: (n: NodeId) => void
}) {
  const agents: NodeId[] = ['investigator', 'policy', 'resolver']
  const held = o.status === 'AWAITING_APPROVAL'
  if (o.status === 'NEEDS_INFO') {
    return (
      <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-amber-600">
          Waiting on the customer
        </div>
        <h2 className="mt-1 font-display text-[26px] font-semibold tracking-[-0.03em]">
          The Intake agent asked one question
        </h2>
        <p className="mt-3 rounded-xl bg-violet-50 p-3 text-[13.5px] text-violet-900">
          “{o.customer_message}”
        </p>
        <p className="mt-3 text-[13px] text-slate-500">
          When the customer replies, the case goes back into the queue and the
          agents pick it up again.
        </p>
        <button
          onClick={() => onReplay('intake')}
          className="mt-4 text-[12.5px] font-medium text-violet-700 hover:underline"
        >
          See how Intake decided →
        </button>
      </div>
    )
  }
  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="step-in">
          <div
            className={`text-[11px] font-semibold uppercase tracking-widest ${held ? 'text-amber-600' : 'text-emerald-600'}`}
          >
            {held
              ? 'Resolution record · waiting for approval'
              : 'Resolution record'}
          </div>
          <h2 className="mt-1 font-display font-semibold tracking-[-0.03em] text-[28px] leading-tight text-slate-900">
            {o.headline}
          </h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-slate-600">
            {o.findings.summary}
          </p>
        </div>

        <Block n={1} title="What the agents found">
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {o.findings.evidence.map((e, i) => (
              <li key={i} className="flex gap-3 px-3 py-2">
                <span className="w-28 shrink-0 break-words text-[11.5px] font-semibold text-slate-500">
                  {SOURCE[e.source] ?? e.source}
                </span>
                <span className="text-[12.5px] text-slate-800">{e.fact}</span>
              </li>
            ))}
          </ul>
          {!o.findings.claim_matches_evidence && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              The records do not support the claim as stated.
            </p>
          )}
        </Block>

        {o.ruling && (
          <Block n={2} title="Rule applied">
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-[12.5px] leading-relaxed text-slate-800">
                {o.ruling.reasoning}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-md bg-white px-2 py-0.5 font-medium text-slate-700 ring-1 ring-amber-200">
                  Owed now: {rs(o.ruling.reversal_due_paise)}
                </span>
                <span className="rounded-md bg-white px-2 py-0.5 font-medium text-slate-700 ring-1 ring-amber-200">
                  Compensation: {rs(o.ruling.compensation_due_paise)}
                </span>
                {o.deadline && (
                  <span className="rounded-md bg-white px-2 py-0.5 font-medium text-slate-700 ring-1 ring-amber-200">
                    Deadline {o.deadline.tat} ·{' '}
                    {o.deadline.deadline_at.slice(0, 10)} 23:59
                  </span>
                )}
              </div>
              <p className="mt-2 text-[10.5px] text-slate-500">
                {o.ruling.citation}
              </p>
            </div>
          </Block>
        )}

        <Block
          n={o.ruling ? 3 : 2}
          title={held ? 'Actions waiting for approval' : 'Action results'}
        >
          <ul className="space-y-1.5">
            {o.actions.map((a, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2"
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${a.state === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
                >
                  <Icon
                    name={a.state === 'done' ? 'check' : 'guard'}
                    className="h-3.5 w-3.5"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-slate-800">
                    {ACTION[a.type] ?? a.type}{' '}
                    <span className="text-[10px] uppercase text-slate-400">
                      · {a.state}
                    </span>
                  </span>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[11px] font-medium text-blue-600">
                      Why this action · inspect record
                    </summary>
                    <p className="mt-2 text-xs leading-6 text-slate-500">
                      {a.reason}
                    </p>
                    <p className="text-xs leading-6 text-slate-500">{a.note}</p>
                    {a.ref && (
                      <p className="mt-2 break-all font-mono text-[10px] text-slate-500">
                        Reference: {a.ref}
                      </p>
                    )}
                    {o.ruling && (
                      <p className="mt-2 text-[10px] text-slate-400">
                        Policy source: {o.ruling.citation}
                      </p>
                    )}
                  </details>
                </span>
                {a.amount_paise > 0 && (
                  <span className="font-mono text-[12.5px] font-semibold text-slate-800">
                    {rs(a.frozen_paise ?? a.amount_paise)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {o.rejected.length > 0 && (
            <p className="mt-2 text-[11.5px] text-slate-500">
              Blocked by guardrails:{' '}
              {o.rejected
                .map((a) => `${ACTION[a.type] ?? a.type} (${a.note})`)
                .join('; ')}
            </p>
          )}
        </Block>

        {o.customer_message && (
          <Block
            n={o.ruling ? 4 : 3}
            title={
              o.customer_message.startsWith('Ops note')
                ? 'Note for the ops team'
                : 'Message to the customer'
            }
          >
            <p className="rounded-xl bg-slate-50 p-3 text-[13px] leading-relaxed text-slate-700">
              {o.customer_message.replace(/^Ops note: /, '')}
            </p>
          </Block>
        )}

        {run.steps.some((s) => s.node === 'human' && s.kind === 'decision') && (
          <Block n={5} title="Reviewer decisions">
            <ul className="space-y-2">
              {run.steps
                .filter((s) => s.node === 'human' && s.kind === 'decision')
                .map((s) => (
                  <li
                    key={s.id}
                    className="rounded-xl border p-3 text-xs leading-6"
                  >
                    <b>{s.title}</b>
                    <p>{s.detail}</p>
                  </li>
                ))}
            </ul>
          </Block>
        )}
        <section className="step-in border-t border-slate-100 pt-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            Agent records · select to inspect
          </h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {agents.map((n) => {
              const st = run.nodes[n]
              const u = run.usage[n]
              const skipped = st.status === 'skipped' || st.status === 'idle'
              return (
                <button
                  key={n}
                  disabled={skipped}
                  onClick={() => onReplay(n)}
                  className="rounded-xl border border-slate-200 p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-md ${NODE_META[n].chip}`}
                    >
                      <Icon name={n} className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-[12.5px] font-semibold text-slate-900">
                      {NODE_META[n].label}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[11.5px] text-slate-600">
                    {skipped ? 'Not needed for this case' : st.activity}
                  </p>
                  {u && (
                    <p className="mt-1 font-mono text-[10px] text-slate-400">
                      {u.llm_calls} AI turns
                      {st.durationMs != null
                        ? ` · ${(st.durationMs / 1000).toFixed(0)}s`
                        : ''}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
