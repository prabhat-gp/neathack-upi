'use client'

import { rs, type Case } from '@/lib/run'
import { Icon } from '../meta'
import Countdown from './Countdown'

export type CaseStatus = { kind: 'awaiting' } | { kind: 'resolved'; label: string } | { kind: 'running' }

function Card({ c, active, status, onPick, disabled }: { c: Case; active: boolean; status?: CaseStatus; onPick: () => void; disabled: boolean }) {
  return (
    <button onClick={onPick} disabled={disabled}
      className={`group w-full rounded-xl border p-2.5 text-left transition disabled:cursor-not-allowed ${
        active ? 'border-violet-300 bg-white shadow-md shadow-violet-100 ring-1 ring-violet-200' : 'border-transparent hover:-translate-y-px hover:border-slate-200 hover:bg-white hover:shadow-sm'}`}>
      <div className="flex items-center gap-1.5">
        <span className={`rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wider ${c.trigger === 'sweep' ? 'bg-violet-100 text-violet-700' : 'bg-slate-200 text-slate-600'}`}>
          {c.trigger === 'sweep' ? 'Recon' : 'Complaint'}
        </span>
        <span className="ml-auto font-mono text-[11.5px] font-semibold text-slate-800">{rs(c.amount_paise)}</span>
      </div>
      <div className="mt-1 text-[12.5px] font-semibold leading-snug text-slate-900">{c.title}</div>
      <div className="mt-1.5 text-[10.5px]">
        {status?.kind === 'running' ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" /> Agents working
          </span>
        ) : status?.kind === 'awaiting' ? (
          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">Approval needed</span>
        ) : status?.kind === 'resolved' ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800">
            <Icon name="check" className="h-3 w-3" /> {status.label}
          </span>
        ) : c.deadline_at ? (
          <span className="whitespace-nowrap rounded-md bg-amber-50 px-1.5 py-0.5 font-mono font-semibold text-amber-800 ring-1 ring-amber-200">
            {c.rule.split('·')[1]?.trim()} · <Countdown deadline={c.deadline_at} compact /> left
          </span>
        ) : (
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">{c.rule}</span>
        )}
      </div>
    </button>
  )
}

function Group({ title, tone, children }: { title: string; tone: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className={`px-1 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest ${tone}`}>{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

export default function CaseRail({ cases, selected, onPick, disabled, status }: {
  cases: Case[]
  selected: string
  onPick: (id: string) => void
  disabled: boolean
  status: Record<string, CaseStatus>
}) {
  const st = (c: Case): CaseStatus | undefined => status[c.id] ?? (c.resolved ? { kind: 'resolved', label: c.resolved } : undefined)
  const needs = cases.filter((c) => st(c)?.kind === 'awaiting')
  const open = cases.filter((c) => !st(c) || st(c)?.kind === 'running')
    .sort((a, b) => (a.deadline_at ?? '9999').localeCompare(b.deadline_at ?? '9999'))
  const done = cases.filter((c) => st(c)?.kind === 'resolved')
  const card = (c: Case) => <Card key={c.id} c={c} active={c.id === selected} status={st(c)} onPick={() => onPick(c.id)} disabled={disabled} />

  return (
    <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-slate-50/70">
      <div className="px-4 pb-1 pt-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Exceptions</h2>
        <p className="mt-0.5 text-[11px] text-slate-400">Nightly recon sweep + customer complaints</p>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {needs.length > 0 && <Group title={`Needs you · ${needs.length}`} tone="text-amber-600">{needs.map(card)}</Group>}
        {open.length > 0 && <Group title={`Open · ${open.length}`} tone="text-slate-500">{open.map(card)}</Group>}
        {done.length > 0 && <Group title={`Resolved · ${done.length}`} tone="text-emerald-600">{done.map(card)}</Group>}
        <button onClick={() => onPick('custom')} disabled={disabled}
          className={`mt-2 w-full rounded-xl border-2 border-dashed p-2.5 text-left transition disabled:cursor-not-allowed ${
            selected === 'custom' ? 'border-violet-400 bg-violet-50' : 'border-slate-300 hover:border-violet-300 hover:bg-white'}`}>
          <span className="rounded bg-violet-600 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-white">Try it</span>
          <div className="mt-1 text-[12.5px] font-semibold text-slate-900">Write your own complaint</div>
          <div className="text-[11px] text-slate-500">Any customer, any transaction, your words</div>
        </button>
      </div>
    </aside>
  )
}
