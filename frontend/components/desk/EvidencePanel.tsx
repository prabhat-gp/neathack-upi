'use client'
import { useState } from 'react'
import { PARTY_IDS, type PartyId, type RunState } from '@/lib/run'
import { Icon, PARTY_META } from '../meta'
export default function EvidencePanel({ run }: { run: RunState }) {
  const [party, setParty] = useState<PartyId | null>(null)
  const calls = run.steps.filter((s) => s.kind === 'call')
  const evidence = run.outcome?.findings?.evidence ?? []
  return (
    <div className="min-h-0 space-y-5 overflow-auto p-4">
      <div>
        <h3 className="text-xs font-semibold">Follow the evidence</h3>
        <p className="mt-2 text-xs leading-6 text-slate-500">
          Select a system to inspect its recorded responses. No response means
          the fact is still unknown.
        </p>
        <div className="mt-4 space-y-2">
          {PARTY_IDS.map((id) => {
            const records = calls.filter((s) => s.party === id)
            const last = records[records.length - 1]
            return (
              <button
                key={id}
                onClick={() => setParty((p) => (p === id ? null : id))}
                aria-pressed={party === id}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${party === id ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                <span className="rounded-lg bg-slate-100 p-2 text-slate-500">
                  <Icon name={id} />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block text-xs">{PARTY_META[id].short}</b>
                  <span className="mt-1 block truncate text-[10px] text-slate-400">
                    {last?.result || last?.title || 'Not queried'}
                  </span>
                </span>
                <span
                  className={`text-[10px] ${last?.status === 'bad' ? 'text-rose-600' : last?.status === 'running' ? 'text-blue-600' : 'text-slate-400'}`}
                >
                  {last?.status === 'running'
                    ? 'Working'
                    : last?.status === 'bad'
                      ? 'Unavailable'
                      : last
                        ? `${records.length} calls`
                        : 'Unknown'}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      {evidence.length > 0 && (
        <div>
          <h3 className="mb-3 text-xs font-semibold">Established findings</h3>
          {evidence.map((e, i) => (
            <div
              key={i}
              className="mb-2 rounded-lg bg-slate-50 p-3 text-xs leading-6"
            >
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-blue-600">
                {e.source}
              </span>
              {e.fact}
            </div>
          ))}
        </div>
      )}
      <div>
        <div className="mb-3 flex justify-between text-xs font-semibold">
          <span>{party ? PARTY_META[party].short : 'All source calls'}</span>
          {party && (
            <button onClick={() => setParty(null)} className="text-blue-600">
              Clear filter
            </button>
          )}
        </div>
        {calls.length === 0 && (
          <p className="text-xs leading-6 text-slate-400">
            Tool evidence appears here when the investigation starts.
          </p>
        )}
        {calls
          .filter((s) => !party || s.party === party)
          .map((s) => (
            <details key={s.id} className="mb-2 rounded-xl border p-3">
              <summary className="cursor-pointer text-xs font-medium leading-6">
                <span
                  className={
                    s.status === 'bad' ? 'text-rose-600' : 'text-blue-600'
                  }
                >
                  {s.status} ·{' '}
                </span>
                {s.title}
              </summary>
              <p className="mt-2 text-xs leading-6 text-slate-600">
                {s.result || s.detail}
              </p>
              <p className="mt-3 text-[10px] text-slate-400">
                {(s.t / 1000).toFixed(1)}s into run · {s.http?.method}{' '}
                {s.http?.status}{' '}
                {s.http?.latency_ms != null ? `· ${s.http.latency_ms}ms` : ''}
              </p>
              <details className="mt-3">
                <summary className="cursor-pointer text-[10px] text-blue-600">
                  Source response
                </summary>
                <pre className="mt-2 overflow-auto rounded-lg bg-slate-50 p-2 text-[10px]">
                  {JSON.stringify(s.data ?? s.http ?? {}, null, 2)}
                </pre>
              </details>
            </details>
          ))}
      </div>
    </div>
  )
}
