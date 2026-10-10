import type { NodeId, PartyId } from '@/lib/run'

const PATHS: Record<string, JSX.Element> = {
  complaint: <path d="M4 5h16v11H9l-5 4z" />,
  intake: <path d="M4 4h16v12H8l-4 4zM8 9h8M8 12h5" />,
  orchestrator: (
    <>
      <circle cx="12" cy="5" r="2.5" />
      <circle cx="5" cy="19" r="2.5" />
      <circle cx="19" cy="19" r="2.5" />
      <circle cx="12" cy="19" r="2.5" />
      <path d="M12 7.5v9M12 11.5 6.5 17M12 11.5l5.5 5.5" />
    </>
  ),
  investigator: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  policy: <path d="M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z" />,
  resolver: (
    <>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  human: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
  outcome: <path d="M5 21V4h12l-2 4 2 4H5" />,
  cbs: <path d="M3 10h18L12 4zM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />,
  npci: (
    <>
      <path d="M4 7h13l-3-3M20 17H7l3 3" />
    </>
  ),
  bene: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </>
  ),
  acquirer: <path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6" />,
  ncrp: (
    <>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
      <path d="M12 8v5M12 16h.01" />
    </>
  ),
  tool: <path d="m5 8 4 4-4 4M12 16h7" />,
  think: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  rule: (
    <>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z" />
      <path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19" />
    </>
  ),
  calc: <path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" />,
  decision: <path d="M5 12h14M13 6l6 6-6 6" />,
  finding: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  guard: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  check: <path d="m5 12 5 5 9-10" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  draft: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  plan: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  play: <path d="M7 4v16l13-8z" />,
  reset: <path d="M4 4v6h6M20 20v-6h-6M5.5 15a7 7 0 0 0 12.5 2M18.5 9A7 7 0 0 0 6 7" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  spark: <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3" />,
}

export function Icon({ name, className = 'h-4 w-4' }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {PATHS[name] ?? PATHS.think}
    </svg>
  )
}

type Tone = { chip: string; dot: string; text: string; ring: string; stroke: string }

const TONES: Record<string, Tone> = {
  slate: { chip: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400', text: 'text-slate-700', ring: 'border-slate-300', stroke: '#64748b' },
  violet: { chip: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500', text: 'text-violet-700', ring: 'border-violet-400', stroke: '#7c3aed' },
  sky: { chip: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500', text: 'text-sky-700', ring: 'border-sky-400', stroke: '#0284c7' },
  amber: { chip: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', text: 'text-amber-700', ring: 'border-amber-400', stroke: '#d97706' },
  teal: { chip: 'bg-teal-100 text-teal-700', dot: 'bg-teal-500', text: 'text-teal-700', ring: 'border-teal-400', stroke: '#0d9488' },
  rose: { chip: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500', text: 'text-rose-700', ring: 'border-rose-400', stroke: '#e11d48' },
  indigo: { chip: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500', text: 'text-indigo-700', ring: 'border-indigo-400', stroke: '#4f46e5' },
}

export const NODE_META: Record<NodeId, Tone & { label: string; role: string; ai: boolean }> = {
  complaint: { ...TONES.slate, label: 'Customer complaint', role: 'Intake', ai: false },
  intake: { ...TONES.indigo, label: 'Intake', role: 'Reads the message, finds the payment', ai: true },
  orchestrator: { ...TONES.violet, label: 'Master Orchestrator', role: 'Master agent · routes on evidence', ai: true },
  investigator: { ...TONES.sky, label: 'Investigator', role: 'Gathers evidence from every party', ai: true },
  policy: { ...TONES.amber, label: 'Policy', role: 'Applies RBI rules · computes what is owed', ai: true },
  resolver: { ...TONES.teal, label: 'Resolver', role: 'Scores risk · plans & executes', ai: true },
  executor: { ...TONES.slate, label: 'Execution engine', role: 'Rechecks guardrails and confirms actions', ai: false },
  human: { ...TONES.rose, label: 'Human approval', role: 'Ops reviewer sign-off', ai: false },
  outcome: { ...TONES.indigo, label: 'Outcome', role: 'Case closed with audit trail', ai: false },
}

export const PARTY_META: Record<PartyId, { label: string; short: string; role: string }> = {
  cbs: { label: 'Sahyadri Bank CBS', short: 'Core banking', role: 'Remitter bank ledger' },
  npci: { label: 'NPCI UPI switch', short: 'NPCI · UDIR', role: 'Txn status & disputes' },
  bene: { label: 'Beneficiary bank', short: 'Beneficiary bank', role: 'Credit & account risk' },
  acquirer: { label: 'Merchant acquirer', short: 'Acquirer', role: 'Orders & refunds' },
  ncrp: { label: 'NCRP portal', short: 'Cybercrime portal', role: 'Fraud reports' },
}
