'use client'

import { rs, type Case } from '@/lib/run'
import { Icon } from '../meta'
import { Countdown } from './Orchestrator'

export default function CaseRail({ cases, selected, onPick, disabled, resolved }: {
  cases: Case[]
  selected: string
  onPick: (id: string) => void
  disabled: boolean
  resolved: Record<string, string>
}) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-slate-50/70">
      <div className="px-4 pb-2 pt-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Exceptions queue</h2>
        <p className="mt-0.5 text-[11.5px] text-slate-500">Sorted by deadline · from sweep & complaints</p>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
        {cases.map((c, i) => {
          const active = c.id === selected
          const done = resolved[c.id] ?? c.resolved
          return (
            <button key={c.id} onClick={() => onPick(c.id)} disabled={disabled}
              className={`group w-full rounded-xl border p-3 text-left transition disabled:cursor-not-allowed ${
                active ? 'border-violet-300 bg-white shadow-md shadow-violet-100 ring-1 ring-violet-200' : 'border-transparent hover:border-slate-200 hover:bg-white'
              }`}>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] text-slate-400">{String(i + 1).padStart(2, '0')}</span>
                <span className={`rounded px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wider ${
                  c.trigger === 'sweep' ? 'bg-violet-100 text-violet-700' : 'bg-slate-200 text-slate-600'
                }`}>{c.trigger === 'sweep' ? 'Recon sweep' : 'Complaint'}</span>
                <span className="ml-auto font-mono text-[11px] font-semibold text-slate-700">{rs(c.amount_paise)}</span>
              </div>
              <div className="mt-1.5 text-[13px] font-semibold leading-snug text-slate-900">{c.title}</div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-slate-500">{c.subtitle}</div>
              <div className="mt-2 flex items-center gap-1.5 text-[10.5px]">
                {done ? (
                  <span className="flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800">
                    <Icon name="check" className="h-3 w-3" /> {done}
                  </span>
                ) : c.deadline_at ? (
                  <span className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-amber-50 px-1.5 py-0.5 font-mono font-semibold text-amber-800 ring-1 ring-amber-200">
                    {c.rule.split('·')[1]?.trim()} · <Countdown deadline={c.deadline_at} compact /> left
                  </span>
                ) : (
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">{c.rule}</span>
                )}
                <span className="truncate text-slate-400">{c.role}</span>
              </div>
            </button>
          )
        })}
        <button onClick={() => onPick('custom')} disabled={disabled}
          className={`w-full rounded-xl border-2 border-dashed p-3 text-left transition disabled:cursor-not-allowed ${
            selected === 'custom' ? 'border-violet-400 bg-violet-50' : 'border-slate-300 hover:border-violet-300 hover:bg-white'}`}>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] text-slate-400">{String(cases.length + 1).padStart(2, '0')}</span>
            <span className="rounded bg-violet-600 px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wider text-white">Try it</span>
          </div>
          <div className="mt-1.5 text-[13px] font-semibold text-slate-900">Write your own complaint</div>
          <div className="mt-0.5 text-[11.5px] leading-snug text-slate-500">Any customer, any transaction, your words</div>
        </button>
      </div>
    </aside>
  )
}
