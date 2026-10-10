'use client'

import { rs, type DeskCase, type DeskStatus } from '@/lib/run'
import { Icon } from '../meta'
import Countdown from './Countdown'

export const CHANNEL: Record<string, { label: string; tone: string }> = {
  UDIR: { label: 'UPI app', tone: 'bg-sky-100 text-sky-700' },
  CHAT: { label: 'Chat', tone: 'bg-emerald-100 text-emerald-700' },
  RECON: { label: 'Recon', tone: 'bg-violet-100 text-violet-700' },
}

const GROUPS: { title: string; tone: string; statuses: DeskStatus[] }[] = [
  { title: 'Needs you', tone: 'text-amber-600', statuses: ['NEEDS_YOU'] },
  { title: 'Agents working', tone: 'text-violet-600', statuses: ['WORKING'] },
  { title: 'Waiting on customer', tone: 'text-slate-500', statuses: ['NEEDS_INFO'] },
  { title: 'Queued', tone: 'text-slate-500', statuses: ['QUEUED'] },
  { title: 'Needs attention', tone: 'text-rose-600', statuses: ['ESCALATED', 'FAILED'] },
  { title: 'Resolved', tone: 'text-emerald-600', statuses: ['RESOLVED'] },
]

function Card({ c, active, onPick }: { c: DeskCase; active: boolean; onPick: () => void }) {
  const ch = CHANNEL[c.channel]
  const done = ['RESOLVED', 'ESCALATED', 'FAILED'].includes(c.status)
  return (
    <button onClick={onPick}
      className={`step-in w-full rounded-xl border p-2.5 text-left transition ${active ? 'border-violet-300 bg-white shadow-md shadow-violet-100 ring-1 ring-violet-200' : 'border-transparent hover:border-slate-200 hover:bg-white'}`}>
      <div className="flex items-center gap-1.5">
        <span className={`rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wider ${ch.tone}`}>{ch.label}</span>
        <span className="font-mono text-[10px] text-slate-400">{c.id}</span>
        {c.amount_paise ? <span className="ml-auto font-mono text-[11.5px] font-semibold text-slate-800">{rs(c.amount_paise)}</span> : null}
      </div>
      <div className="mt-1 truncate text-[12.5px] font-semibold text-slate-900">{c.customer_name}</div>
      <div className="line-clamp-1 text-[11.5px] text-slate-500">{c.channel === 'RECON' ? c.message : `“${c.message.split('\n')[0]}”`}</div>
      <div className="mt-1.5 text-[10.5px]">
        {c.status === 'WORKING' ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" /> Agents working
          </span>
        ) : c.status === 'NEEDS_YOU' ? (
          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">Approval needed</span>
        ) : c.status === 'NEEDS_INFO' ? (
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">Asked customer a question</span>
        ) : done ? (
          <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold ${c.status === 'RESOLVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'}`}>
            <Icon name={c.status === 'RESOLVED' ? 'check' : 'x'} className="h-3 w-3" /> <span className="truncate">{c.headline}</span>
          </span>
        ) : c.deadline_at ? (
          <span className="whitespace-nowrap rounded-md bg-amber-50 px-1.5 py-0.5 font-mono font-semibold text-amber-800 ring-1 ring-amber-200">
            T+{c.tat_days} · <Countdown deadline={c.deadline_at} compact /> left
          </span>
        ) : (
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">Queued</span>
        )}
      </div>
    </button>
  )
}

export default function CaseRail({ cases, selected, onPick }: { cases: DeskCase[]; selected: string | null; onPick: (id: string) => void }) {
  const open = cases.filter((c) => !['RESOLVED', 'ESCALATED', 'FAILED'].includes(c.status)).length
  return (
    <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-slate-50/70">
      <div className="px-4 pb-1 pt-4">
        <h2 className="font-display text-[15px] font-semibold tracking-tight text-slate-900">Case queue</h2>
        <p className="mt-0.5 text-[11px] text-slate-400">{open} open · fed by UPI app, chat and the nightly recon</p>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {cases.length === 0 && <p className="px-1 pt-6 text-[12px] leading-relaxed text-slate-400">No cases yet. Switch on autopilot, run the recon sweep, or complain as a customer.</p>}
        {GROUPS.map((g) => {
          const items = cases.filter((c) => g.statuses.includes(c.status))
            .sort((a, b) => g.title === 'Queued' ? (a.deadline_at ?? '9').localeCompare(b.deadline_at ?? '9') : b.updated_at.localeCompare(a.updated_at))
          if (!items.length) return null
          return (
            <div key={g.title}>
              <h3 className={`px-1 pb-1 pt-3 text-[10px] font-bold uppercase tracking-widest ${g.tone}`}>{g.title} · {items.length}</h3>
              <div className="space-y-1">{items.map((c) => <Card key={c.id} c={c} active={c.id === selected} onPick={() => onPick(c.id)} />)}</div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
