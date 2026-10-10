export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export type AgentNode = 'orchestrator' | 'investigator' | 'policy' | 'resolver'
export type NodeId = 'complaint' | AgentNode | 'human' | 'outcome'
export type PartyId = 'cbs' | 'npci' | 'bene' | 'acquirer' | 'ncrp' | 'crustdata'
export type NodeStatus = 'idle' | 'running' | 'done' | 'skipped' | 'waiting'
export type EdgeState = 'idle' | 'active' | 'taken' | 'skipped'
export type StepStatus = 'running' | 'ok' | 'warn' | 'bad' | 'info'

export const PARTY_IDS: PartyId[] = ['cbs', 'npci', 'bene', 'acquirer', 'ncrp', 'crustdata']
export const NODE_IDS: NodeId[] = ['complaint', 'orchestrator', 'investigator', 'policy', 'resolver', 'human', 'outcome']
export const FLOW_EDGES = [
  'complaint>orchestrator',
  'orchestrator>investigator',
  'orchestrator>policy',
  'orchestrator>resolver',
  'resolver>human',
  'orchestrator>outcome',
  'resolver>outcome',
  'human>outcome',
] as const

export interface Case {
  id: string
  title: string
  subtitle: string
  trigger: 'sweep' | 'complaint'
  settlement_date?: string
  role: string
  rule: string
  tat_days: number | null
  customer_id: string
  customer_name: string
  utr: string
  amount_paise: number
  complaint: string
  initiated_at: string | null
  deadline_at: string | null
  resolved: string | null
}

export interface Meta {
  brain: 'bedrock' | 'anthropic' | 'rules'
  brain_label: string
  model: string | null
  parties: Record<PartyId, { label: string; role: string }>
  auto_approve_limit_paise: number
  neatlogs: boolean
}

export interface NodeState {
  status: NodeStatus
  activity?: string
  durationMs?: number
}

export interface Step {
  id: string
  node: NodeId
  kind: string
  title: string
  detail?: string | null
  status: StepStatus
  result?: string
  data?: unknown
  party?: PartyId
  http?: { method?: string; path?: string; body?: unknown; status?: number; latency_ms?: number }
  t: number
  arrivedAt: number
  streamed?: boolean
}

export interface Action {
  type: string
  utr: string
  amount_paise: number
  state: 'proposed' | 'done' | 'scheduled' | 'cancelled'
  ref?: string
  note?: string
  reason?: string
  frozen_paise?: number
}

export interface Snapshot {
  role: 'REMITTER' | 'BENEFICIARY'
  cbs: {
    name: string; account_no: string; balance_paise: number; status: string
    postings: { type: string; amount_paise: number; utr_ref: string; id: string }[]
    blocked_vpas: string[]
    suspense: { id: string; amount_paise: number; status: string }[]
  }
  npci: { overall: string; credit_leg: string; tcc: string | null; reversal_leg: string; complaints: { id: string; type: string; status: string; resolution: string | null }[] }
  bene: { bank?: string; holder_name?: string; vpa?: string; available_paise?: number; lien_paise?: number; credit: { status: string; credited_at: string | null; credit_ref: string | null } | null }
  acquirer: { refunds: { id: string; utr: string; amount_paise: number; status: string }[] }
  ncrp: { reports_on_payee: number; our_reports: { ack_no: string; utr: string; amount_paise: number }[] }
}

export interface Outcome {
  status: 'RESOLVED' | 'ACTIONED' | 'CLOSED' | 'MONITORING' | 'AWAITING_APPROVAL' | 'ESCALATED'
  headline: string
  summary: string
  case_type: string
  findings: { case_type: string; summary: string; evidence: { source: string; fact: string }[]; claim_matches_evidence: boolean }
  ruling: { reversal_due_paise: number; compensation_due_paise: number; liability: string; citation: string; reasoning: string } | null
  risk: { score: number; band: 'LOW' | 'MEDIUM' | 'HIGH' } | null
  actions: Action[]
  rejected: Action[]
  human_reason: string | null
  deadline: { tat: string; deadline_at: string; seconds_left: number; met: boolean } | null
  penalty_paid_paise: number
  refunded_paise: number
  frozen_paise: number
  ops: { api_calls: number; parties: string[]; human_touches: number; seconds: number }
  customer_message: string
  citation: string | null
  usage: Record<string, { input_tokens: number; output_tokens: number; llm_calls: number }>
  after: Snapshot | null
}

export interface RunState {
  phase: 'idle' | 'running' | 'awaiting' | 'done' | 'error'
  runId?: string
  brain?: string
  brainLabel?: string
  nodes: Record<NodeId, NodeState>
  edges: Record<string, EdgeState>
  steps: Step[]
  usage: Record<string, { input_tokens: number; output_tokens: number; llm_calls: number }>
  before?: Snapshot | null
  outcome?: Outcome
  error?: string
  elapsedMs: number
}

export function initialRunState(): RunState {
  return {
    phase: 'idle',
    nodes: Object.fromEntries(NODE_IDS.map((n) => [n, { status: 'idle' }])) as Record<NodeId, NodeState>,
    edges: Object.fromEntries(FLOW_EDGES.map((e) => [e, 'idle'])),
    steps: [],
    usage: {},
    elapsedMs: 0,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RunEvent = { type: string; t: number; [k: string]: any }

export function reduceRun(state: RunState, ev: RunEvent): RunState {
  const elapsedMs = Math.max(state.elapsedMs, ev.t ?? 0)
  switch (ev.type) {
    case 'reset':
      return initialRunState()
    case 'resume':
      return { ...state, phase: 'running' }
    case 'run_started':
      return { ...initialRunState(), phase: 'running', runId: ev.run_id, brain: ev.brain, brainLabel: ev.brain_label, before: ev.before }
    case 'node': {
      const prev = state.nodes[ev.node as NodeId]
      return {
        ...state,
        elapsedMs,
        nodes: { ...state.nodes, [ev.node]: { ...prev, status: ev.status, activity: ev.activity ?? prev.activity, durationMs: ev.duration_ms ?? prev.durationMs } },
      }
    }
    case 'edge':
      return { ...state, elapsedMs, edges: { ...state.edges, [ev.edge]: ev.state } }
    case 'usage':
      return { ...state, usage: { ...state.usage, [ev.node]: { input_tokens: ev.input_tokens, output_tokens: ev.output_tokens, llm_calls: ev.llm_calls } } }
    case 'step': {
      const step: Step = {
        id: ev.id, node: ev.node, kind: ev.kind, title: ev.title, detail: ev.detail, status: ev.status,
        party: ev.party, http: ev.http, t: ev.t, arrivedAt: Date.now(), streamed: ev.streamed,
      }
      const node = state.nodes[step.node]
      const activity =
        step.kind === 'call' ? `→ ${step.title}` : step.kind === 'check' ? `Checking: ${step.title}` : step.kind === 'think' ? 'Thinking…' : step.kind === 'turn' ? `Calling the model · ${step.title}` : step.title
      return { ...state, elapsedMs, steps: [...state.steps, step], nodes: { ...state.nodes, [step.node]: { ...node, activity } } }
    }
    case 'step_delta':
      return { ...state, steps: state.steps.map((s) => (s.id === ev.id ? { ...s, detail: (s.detail ?? '') + ev.text } : s)) }
    case 'step_update':
      return {
        ...state,
        elapsedMs,
        steps: state.steps.map((s) =>
          s.id === ev.id ? { ...s, status: ev.status, result: ev.result ?? s.result, data: ev.data ?? s.data, http: { ...s.http, ...ev.http } } : s,
        ),
      }
    case 'run_finished': {
      const awaiting = ev.outcome.status === 'AWAITING_APPROVAL'
      const edges = { ...state.edges }
      const nodes = { ...state.nodes }
      if (!awaiting) {
        for (const k of Object.keys(edges)) if (edges[k] === 'idle') edges[k] = 'skipped'
        for (const k of NODE_IDS) if (nodes[k].status === 'idle') nodes[k] = { ...nodes[k], status: 'skipped' }
      }
      return { ...state, elapsedMs, edges, nodes, outcome: ev.outcome, phase: awaiting ? 'awaiting' : 'done' }
    }
    case 'run_failed':
      return { ...state, phase: 'error', error: ev.error }
    default:
      return state
  }
}

export interface PartyLink {
  agent: NodeId
  party: PartyId
  calls: number
  inflight: number
}

export function partyLinks(steps: Step[]): PartyLink[] {
  const map = new Map<string, PartyLink>()
  for (const s of steps) {
    if (s.kind !== 'call' || !s.party) continue
    const key = `${s.node}>${s.party}`
    const link = map.get(key) ?? { agent: s.node, party: s.party, calls: 0, inflight: 0 }
    link.calls += 1
    if (s.status === 'running') link.inflight += 1
    map.set(key, link)
  }
  return [...map.values()]
}

export async function streamEvents(path: string, body: unknown, onEvent: (ev: RunEvent) => void, signal?: AbortSignal) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Request failed (${res.status}) ${detail}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      const line = chunk.split('\n').find((l) => l.startsWith('data: '))
      if (line) onEvent(JSON.parse(line.slice(6)))
    }
  }
}

export function timeLeft(seconds: number) {
  if (seconds <= 0) return 'passed'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const sec = Math.floor(seconds % 60)
  if (d) return `${d}d ${h}h ${m}m`
  return `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`
}

export function rs(p: number | null | undefined) {
  if (p == null) return '—'
  return '₹' + (p / 100).toLocaleString('en-IN', { maximumFractionDigits: p % 100 ? 2 : 0 })
}
