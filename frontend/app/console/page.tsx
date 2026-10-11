'use client'
import Link from 'next/link'
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import {
  api,
  followRun,
  initialRunState,
  reduceRun,
  rs,
  type DeskCase,
  type Meta,
  type NodeId,
  type RunEvent,
  type Snapshot,
} from '@/lib/run'
import WorkflowMap from '@/components/desk/WorkflowMap'
import AgentFocus from '@/components/desk/AgentFocus'
import EvidencePanel from '@/components/desk/EvidencePanel'
import CaseReport from '@/components/desk/CaseReport'
import ResultPanel from '@/components/desk/ResultPanel'
import Countdown from '@/components/desk/Countdown'
import { Icon, NODE_META } from '@/components/meta'
import PortalSwitch from '@/components/PortalSwitch'
import Tour from '@/components/tour/Tour'
import { readDraft, saveDraft } from '@/lib/handoff'

const FILTERS = [
  'All cases',
  'Needs approval',
  'Investigating',
  'Waiting',
  'Attention',
  'Completed',
] as const
const STATUS: Record<string, string> = {
  QUEUED: 'Queued',
  WORKING: 'Investigating',
  NEEDS_YOU: 'Needs approval',
  NEEDS_INFO: 'Waiting for customer',
  RESOLVED: 'Completed',
  ESCALATED: 'Specialist review',
  FAILED: 'Run failed',
}
function matches(c: DeskCase, filter: string) {
  return (
    filter === 'All cases' ||
    (filter === 'Needs approval' && c.status === 'NEEDS_YOU') ||
    (filter === 'Investigating' && c.status === 'WORKING') ||
    (filter === 'Waiting' && ['QUEUED', 'NEEDS_INFO'].includes(c.status)) ||
    (filter === 'Attention' && ['FAILED', 'ESCALATED'].includes(c.status)) ||
    (filter === 'Completed' && c.status === 'RESOLVED')
  )
}
type Pilot = { on: boolean; sent: number; max: number }
export default function Desk() {
  const [meta, setMeta] = useState<Meta | null>(null),
    [cases, setCases] = useState<DeskCase[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [detail, setDetail] = useState<DeskCase | null>(null)
  const [run, dispatch] = useReducer(reduceRun, undefined, initialRunState)
  const [node, setNode] = useState<NodeId | null>('orchestrator'),
    [panel, setPanel] = useState<
      'agent' | 'conversation' | 'result' | 'route' | 'evidence' | 'build'
    >('agent')
  const [edge, setEdge] = useState(''),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState<string>('All cases'),
    [follow, setFollow] = useState(true)
  const [note, setNote] = useState<string | null>(null),
    [connected, setConnected] = useState(false),
    [streamError, setStreamError] = useState<string | null>(null),
    [retry, setRetry] = useState(0)
  const [pilot, setPilot] = useState<Pilot | null>(null),
    [busy, setBusy] = useState(false),
    [live, setLive] = useState<Snapshot | null>(null)
  const [events, setEvents] = useState<RunEvent[]>([]),
    [replay, setReplay] = useState<number | null>(null)
  const selectedRef = useRef<string | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  const [tour, setTour] = useState(false)
  const [handoff, setHandoff] = useState<'loading' | 'failed' | null>(null)
  const handoffStarted = useRef(false)
  const handoffPending = useRef(false)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    setTour(q.has('tour'))
    const id = q.get('handoff')
    if (!id || handoffStarted.current) return
    handoffStarted.current = true
    handoffPending.current = true
    setHandoff('loading')
    const start = async () => {
      try {
        const draft = readDraft(id)
        if (!draft)
          throw new Error(
            'No complaint draft was found in this tab. Return to the customer portal to write one.',
          )
        if (draft.state === 'sending')
          throw new Error(
            'Submission was interrupted. Check the case inbox before sending again.',
          )
        setTour(draft.guided)
        let c: DeskCase
        if (draft.state === 'sent' && draft.caseId) {
          c = await api<DeskCase>(`/api/desk/cases/${draft.caseId}`)
        } else {
          saveDraft({ ...draft, state: 'sending' }, id)
          c = await api<DeskCase>(draft.path, draft.body)
          saveDraft({ ...draft, state: 'sent', caseId: c.id }, id)
        }
        setCases((cs) => [c, ...cs.filter((item) => item.id !== c.id)])
        selectedRef.current = c.id
        setSelected(c.id)
        setDetail(c)
        setFollow(true)
        setNode('intake')
        setPanel('agent')
        setHandoff(null)
      } catch (e) {
        setNote((e as Error).message)
        setHandoff('failed')
      } finally {
        handoffPending.current = false
      }
    }
    // Let the bank workspace paint before admitting the complaint to the automatic queue.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void start()
      }),
    )
  }, [])
  const kase =
    detail?.id === selected ? detail : cases.find((c) => c.id === selected)
  const poll = useCallback(async () => {
    try {
      const [cs, ap] = await Promise.all([
        api<DeskCase[]>('/api/desk/cases'),
        api<Pilot>('/api/desk/autopilot'),
      ])
      setCases(cs)
      setPilot(ap)
      setConnected(true)
      setSelected((s) =>
        handoffPending.current
          ? s
          : selectedRef.current && !cs.some((c) => c.id === selectedRef.current)
            ? s
            : s && cs.some((c) => c.id === s)
              ? s
              : ((
                  cs.find((c) => c.status === 'NEEDS_YOU') ??
                  cs.find((c) => c.status === 'WORKING') ??
                  cs[0]
                )?.id ?? null),
      )
    } catch {
      setConnected(false)
    }
  }, [])
  useEffect(() => {
    setSelected(new URLSearchParams(window.location.search).get('case'))
    api<Meta>('/api/meta')
      .then(setMeta)
      .catch(() => {})
    poll()
    const t = setInterval(poll, 2500)
    return () => clearInterval(t)
  }, [poll])
  useEffect(() => {
    selectedRef.current = selected
    setReplay(null)
    setFollow(true)
  }, [selected])
  useEffect(() => {
    if (selected && !handoffPending.current)
      window.history.replaceState(
        null,
        '',
        `/console?case=${encodeURIComponent(selected)}${tour ? '&tour=1' : ''}`,
      )
  }, [selected, tour])
  const stamp = cases.find((c) => c.id === selected)?.updated_at
  useEffect(() => {
    if (!selected) {
      setDetail(null)
      return
    }
    let cancelled = false
    api<DeskCase>(`/api/desk/cases/${selected}`)
      .then((c) => {
        if (!cancelled) setDetail(c)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [selected, stamp])
  const runId = kase?.run_id
  const isWorking = kase?.status === 'WORKING'
  useEffect(() => {
    dispatch({ type: 'reset', t: 0 })
    setEvents([])
    setStreamError(null)
    setReplay(null)
    if (!runId) return
    const ctrl = new AbortController()
    followRun(
      runId,
      (ev) => {
        if (!ctrl.signal.aborted) {
          dispatch(ev)
          setEvents((es) => [...es, ev])
        }
      },
      ctrl.signal,
    ).catch((e) => {
      if (!ctrl.signal.aborted) setStreamError(e.message)
    })
    return () => ctrl.abort()
  }, [runId, retry, isWorking])
  const shown = useMemo(
    () =>
      replay === null
        ? run
        : events.slice(0, replay + 1).reduce(reduceRun, initialRunState()),
    [run, events, replay],
  )
  const active = (
    [
      'intake',
      'investigator',
      'policy',
      'executor',
      'resolver',
      'orchestrator',
    ] as NodeId[]
  ).find((n) => shown.nodes[n].status === 'running')
  useEffect(() => {
    if (follow && active) {
      setNode(active)
      setPanel('agent')
    }
    if (follow && (shown.phase === 'done' || shown.phase === 'error')) {
      setNode('outcome')
      setPanel('result')
    }
    if (follow && shown.phase === 'awaiting') {
      setNode('human')
      setPanel('result')
    }
  }, [follow, active, shown.phase, focusTick])
  const posts = run.steps.filter(
    (s) =>
      s.kind === 'call' && s.http?.method === 'POST' && s.status !== 'running',
  ).length
  useEffect(() => {
    setLive(null)
    if (!kase?.utr) return
    let cancelled = false
    api<Snapshot>(
      `/sandbox/snapshot?customer_id=${encodeURIComponent(kase.customer_id)}&utr=${encodeURIComponent(kase.utr)}`,
    )
      .then((s) => {
        if (!cancelled) setLive(s)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [kase?.utr, kase?.customer_id, posts, run.outcome])
  async function act(fn: () => Promise<unknown>) {
    setBusy(true)
    setNote(null)
    try {
      await fn()
      await poll()
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function decide(approve: boolean, reason?: string, escalate?: boolean) {
    await act(async () => {
      await api(`/api/runs/${runId}/decision`, {
        approve,
        reason: reason ?? '',
        escalate: !!escalate,
      })
      setRetry((r) => r + 1)
    })
  }
  function pickNode(n: NodeId) {
    setFollow(false)
    setNode(n)
    setPanel(
      n === 'complaint'
        ? 'conversation'
        : n === 'human' || n === 'outcome'
          ? 'result'
          : 'agent',
    )
  }
  const visible = cases
    .filter(
      (c) =>
        matches(c, filter) &&
        `${c.customer_name} ${c.id} ${c.utr ?? ''} ${c.message}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => {
      const rank = (c: DeskCase) =>
        c.status === 'NEEDS_YOU'
          ? 0
          : ['FAILED', 'ESCALATED'].includes(c.status)
            ? 1
            : c.status === 'RESOLVED'
              ? 4
              : 2
      return (
        rank(a) - rank(b) ||
        (a.deadline_at ?? '9999').localeCompare(b.deadline_at ?? '9999')
      )
    })
  return (
    <div className="desk-shell flex flex-col lg:h-screen lg:overflow-hidden">
      <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-4 bg-[#111d32] px-5 py-3 text-white">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="rounded-lg bg-blue-500 p-2">
            <Icon name="orchestrator" />
          </span>
          DisputePro
        </Link>
        <span className="hidden sm:block">
          <PortalSwitch
            dark
            current="bank"
            customerHref={
              kase && kase.channel !== 'RECON'
                ? `/app?c=${kase.customer_id}&case=${kase.id}`
                : '/app'
            }
          />
        </span>
        <span className="rounded border border-white/15 px-2 py-1 text-[10px] uppercase tracking-widest text-white/60">
          Sahyadri · Sandbox
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span
            className={`text-xs ${connected ? 'text-emerald-300' : 'text-amber-300'}`}
          >
            ● {connected ? 'Connected' : 'Reconnecting'}
          </span>
          <button
            onClick={() => setTour(true)}
            className="text-xs text-white/60 hover:text-white"
          >
            Guide me
          </button>

          <button
            onClick={() => {
              setPanel('build')
              setFollow(false)
            }}
            className="text-xs text-white/60 hover:text-white"
          >
            Build evidence
          </button>
        </div>
      </header>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-5 py-3">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-2 text-xs font-medium transition ${filter === f ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            {f}
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
              {cases.filter((c) => matches(c, f)).length}
            </span>
          </button>
        ))}
        <details className="relative ml-auto">
          <summary className="cursor-pointer text-xs text-slate-500">
            Sandbox controls
          </summary>
          <div className="absolute right-0 top-8 z-30 grid w-64 gap-2 rounded-xl border bg-white p-4 shadow-xl">
            <p className="text-xs text-slate-500">
              Synthetic arrivals are independent of case processing.
            </p>
            <button
              className="desk-button"
              disabled={busy}
              onClick={() => act(() => api('/api/desk/recon', {}))}
            >
              Run reconciliation
            </button>
            <button
              className="desk-button"
              disabled={busy}
              onClick={() =>
                act(() => api('/api/desk/autopilot', { on: !pilot?.on }))
              }
            >
              {pilot?.on ? 'Stop' : 'Start'} synthetic arrivals
            </button>
            <span className="text-[11px] text-slate-400">
              {pilot?.sent ?? 0} / {pilot?.max ?? 0} generated this session
            </span>
          </div>
        </details>
      </div>
      {(!connected || note || streamError) && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 bg-amber-50 px-5 py-2 text-xs text-amber-900"
        >
          {note ||
            streamError ||
            'Bank connection unavailable. Displaying the last received state.'}
          {streamError && (
            <button
              className="underline"
              onClick={() => setRetry((r) => r + 1)}
            >
              Reconnect event stream
            </button>
          )}
          {note && <button onClick={() => setNote(null)}>Dismiss</button>}
        </div>
      )}
      <div className="grid min-h-0 flex-1 lg:grid-cols-[245px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_350px] 2xl:grid-cols-[245px_minmax(0,1fr)_380px]">
        <aside
          data-tour="inbox"
          className="flex max-h-72 flex-col border-r border-slate-200 bg-white lg:max-h-none"
        >
          <div className="p-4">
            <div className="mb-3 flex justify-between">
              <h2 className="text-sm font-semibold">Case inbox</h2>
              <span className="text-xs text-slate-400">{visible.length}</span>
            </div>
            <input
              aria-label="Search cases"
              placeholder="Search name, case, UTR…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
            />
          </div>
          <div className="min-h-0 overflow-auto px-2 pb-4">
            {visible.length === 0 && (
              <p className="p-4 text-xs leading-6 text-slate-400">
                {cases.length
                  ? 'No cases match this view.'
                  : 'New complaints and recon exceptions appear here.'}
              </p>
            )}
            {visible.map((c) => (
              <button
                key={c.id}
                data-tour={selected === c.id ? 'inbox-active' : undefined}
                onClick={() => {
                  setHandoff(null)
                  setSelected(c.id)
                  setDetail(null)
                  setPanel('agent')
                }}
                className={`mb-1 w-full rounded-xl border p-3 text-left transition ${selected === c.id ? 'border-blue-200 bg-blue-50/70' : 'border-transparent hover:bg-slate-50'}`}
              >
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>
                    {c.id} · {c.channel}
                  </span>
                  <span>{rs(c.amount_paise)}</span>
                </div>
                <p className="mt-2 text-sm font-semibold">{c.customer_name}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                  {c.headline || c.message}
                </p>
                <div
                  className={`mt-3 text-[11px] font-medium ${c.status === 'NEEDS_YOU' ? 'text-amber-700' : c.status === 'FAILED' || c.status === 'ESCALATED' ? 'text-rose-700' : c.status === 'RESOLVED' ? 'text-emerald-700' : 'text-blue-700'}`}
                >
                  ● {STATUS[c.status]}
                </div>
                {c.deadline_at && c.status !== 'RESOLVED' && (
                  <div className="mt-1 text-[10px] text-slate-400">
                    <Countdown deadline={c.deadline_at} compact /> · deadline
                  </div>
                )}
              </button>
            ))}
          </div>
        </aside>
        <main className="flex min-h-0 min-w-0 flex-col">
          {tour && (
            <Tour
              view="bank"
              kase={kase}
              run={run}
              active={active}
              onClose={() => setTour(false)}
            />
          )}
          {handoff ? (
            <div className="grid min-h-[350px] flex-1 place-items-center p-8 text-center">
              <div>
                <h1 className="text-xl font-semibold">
                  {handoff === 'loading'
                    ? 'The bank desk is ready'
                    : 'Your complaint needs attention'}
                </h1>
                <p role="status" className="mt-3 text-sm text-slate-500">
                  {handoff === 'loading'
                    ? 'Submitting your complaint. The investigation will appear here.'
                    : note}
                </p>
                {handoff === 'failed' && (
                  <Link className="desk-button mt-5" href="/app">
                    Return to customer portal →
                  </Link>
                )}
              </div>
            </div>
          ) : kase ? (
            <>
              <div className="border-b bg-white px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[.15em] text-blue-600">
                    {kase.id} / {kase.channel_label}
                  </span>
                  <span className="text-xs text-slate-400">
                    {shown.brain === 'rules' ||
                    (!shown.brain && meta?.brain === 'rules')
                      ? 'Rules engine · fallback'
                      : `AI agents · ${shown.model || meta?.model || 'Connecting'}`}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <h1 className="text-xl font-semibold tracking-tight">
                    {kase.customer_name}{' '}
                    <span className="font-normal text-slate-400">·</span>{' '}
                    {rs(kase.amount_paise)}
                  </h1>
                  <div className="flex items-center gap-2">
                    {kase.status === 'QUEUED' && (
                      <button
                        className="desk-button desk-primary"
                        disabled={busy}
                        onClick={() =>
                          act(() => api(`/api/desk/cases/${kase.id}/start`, {}))
                        }
                      >
                        <Icon name="play" className="h-3 w-3" /> Start agents
                      </button>
                    )}
                    <button
                      className={`desk-button ${follow && replay === null ? 'text-blue-700 bg-blue-50' : ''}`}
                      aria-pressed={follow && replay === null}
                      onClick={() => {
                        setReplay(null)
                        setFollow(true)
                        setFocusTick((n) => n + 1)
                      }}
                    >
                      <Icon name="play" className="h-3 w-3" />
                      {run.phase === 'done' || run.phase === 'error'
                        ? 'Latest outcome'
                        : follow && replay === null
                          ? 'Following live'
                          : 'Follow live'}
                    </button>
                    <details className="relative">
                      <summary className="desk-button cursor-pointer">
                        Case details
                      </summary>
                      <div className="absolute right-0 top-11 z-30 grid w-48 gap-1 rounded-xl border bg-white p-2 shadow-xl">
                        {(
                          [
                            ['conversation', 'Customer thread'],
                            ['result', 'Actions & receipt'],
                            ['evidence', 'Evidence'],
                          ] as const
                        ).map(([target, label]) => (
                          <button
                            key={target}
                            className="rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-50"
                            onClick={(e) => {
                              setPanel(target)
                              setFollow(false)
                              e.currentTarget
                                .closest('details')
                                ?.removeAttribute('open')
                            }}
                          >
                            {label}
                          </button>
                        ))}
                        {run.traceUrl && (
                          <a
                            href={run.traceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-2 text-xs text-blue-600"
                          >
                            neatlogs trace ↗
                          </a>
                        )}
                      </div>
                    </details>
                  </div>
                </div>
                <p
                  className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500"
                  title={kase.message}
                >
                  {kase.message}
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <WorkflowMap
                  follow={follow && replay === null}
                  focusTick={focusTick}
                  model={
                    shown.model ??
                    (meta?.brain === 'rules' ? null : meta?.model) ??
                    null
                  }
                  run={shown}
                  kase={kase}
                  selected={node}
                  onSelect={pickNode}
                  onEdge={(e) => {
                    setEdge(e)
                    setPanel('route')
                    setFollow(false)
                  }}
                />
              </div>
              <div className="shrink-0 border-t bg-white px-5 py-3">
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-semibold">
                    {replay === null
                      ? 'Recorded activity'
                      : 'Replay · recorded events'}
                  </span>
                  <span className="text-slate-400">
                    {shown.steps.length} events ·{' '}
                    {(shown.elapsedMs / 1000).toFixed(0)}s
                  </span>
                  {events.length > 0 && run.phase !== 'running' && (
                    <button
                      className="ml-auto text-blue-600"
                      onClick={() => {
                        setReplay(replay === null ? 0 : null)
                        setFollow(false)
                      }}
                    >
                      {replay === null ? 'Inspect replay' : 'Return to latest'}
                    </button>
                  )}
                </div>
                {replay !== null && (
                  <input
                    aria-label="Replay recorded events"
                    type="range"
                    className="mt-3 w-full accent-blue-600"
                    min={0}
                    max={Math.max(0, events.length - 1)}
                    value={replay}
                    onChange={(e) => setReplay(Number(e.target.value))}
                  />
                )}
                <p className="mt-2 truncate text-xs text-slate-500">
                  {[...shown.steps]
                    .reverse()
                    .find(
                      (s) =>
                        s.kind === 'decision' ||
                        s.kind === 'finding' ||
                        s.kind === 'call',
                    )?.title || 'Waiting for the next recorded event'}
                </p>
              </div>
            </>
          ) : (
            <div className="grid min-h-[500px] flex-1 place-items-center p-8">
              <div className="max-w-md text-center">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                  <Icon name="orchestrator" className="h-8 w-8" />
                </span>
                <p className="mt-6 text-xs uppercase tracking-widest text-blue-600">
                  Your resolution team is ready
                </p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                  A problem arrives.
                  <br />
                  The agents take it from here.
                </h1>
                <p className="mt-4 text-sm leading-7 text-slate-500">
                  Send a customer complaint or reconcile the sandbox bank.
                  Follow the evidence, decisions, and verified outcome in one
                  workspace.
                </p>
                <div className="mt-6 flex justify-center gap-3">
                  <Link href="/app" className="desk-button desk-primary">
                    Try customer help ↗
                  </Link>
                  <button
                    className="desk-button"
                    disabled={busy}
                    onClick={() => act(() => api('/api/desk/recon', {}))}
                  >
                    Run reconciliation
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
        <aside
          data-tour="resolution"
          className="workspace-panel flex min-h-[380px] min-w-0 flex-col border-l bg-white lg:col-span-2 lg:max-h-[480px] xl:col-span-1 xl:max-h-none"
          key={`${panel}-${node}`}
        >
          <div className="flex items-center justify-between border-b px-4 py-3 text-xs font-semibold">
            <span>
              {panel === 'agent' && node
                ? NODE_META[node].label
                : panel === 'conversation'
                  ? 'Customer conversation'
                  : panel === 'route'
                    ? 'Routing decision'
                    : panel === 'build'
                      ? 'Build evidence'
                      : panel === 'evidence'
                        ? 'Source evidence'
                        : 'Actions & resolution'}
            </span>
            <span className="text-[10px] font-normal text-slate-400">
              {replay !== null ? 'Historical state' : 'Case context'}
            </span>
          </div>
          {panel === 'build' ? (
            <div className="space-y-6 p-5 text-sm">
              <div>
                <h3 className="font-semibold">neatlogs / execution</h3>
                <p className="mt-2 text-slate-500">
                  Agent and tool spans for each traced case.
                </p>
                {run.traceUrl ? (
                  <a
                    className="mt-2 block text-blue-600"
                    href={run.traceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open this case’s trace ↗
                  </a>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">
                    No trace link available for this case.
                  </p>
                )}
              </div>
              <div>
                <h3 className="font-semibold">Entire / build provenance</h3>
                <a
                  className="mt-2 block text-blue-600"
                  href="https://entire.io/gh/prabhat-gp/neathack-upi/trails/1"
                  target="_blank"
                  rel="noreferrer"
                >
                  Checkpoints and review trail ↗
                </a>
              </div>
              <div>
                <h3 className="font-semibold">cfo.ai / business plan</h3>
                <p className="mt-2 text-slate-500">
                  Integration pending. The DisputePro MCP exposes measured desk
                  metrics for the planned business analysis.
                </p>
              </div>
            </div>
          ) : !kase ? (
            <p className="p-5 text-sm text-slate-400">
              Select a case to inspect the team’s work.
            </p>
          ) : panel === 'agent' && node ? (
            <AgentFocus
              node={node}
              run={shown}
              model={
                shown.brain === 'rules'
                  ? null
                  : (shown.model ??
                    (meta?.brain === 'rules' ? null : meta?.model) ??
                    null)
              }
              follow={follow && replay === null}
            />
          ) : panel === 'conversation' ? (
            <div className="space-y-4 overflow-auto p-4">
              <p className="text-xs text-slate-400">
                {kase.channel_label} · {kase.id}
              </p>
              {(kase.messages ?? []).map((m) => (
                <div
                  key={m.id}
                  className={`rounded-xl p-3 text-sm leading-6 ${m.sender === 'customer' ? 'ml-5 bg-blue-50' : 'mr-5 bg-slate-50'}`}
                >
                  <div className="mb-1 text-[10px] font-semibold uppercase text-slate-400">
                    {m.sender === 'customer'
                      ? kase.customer_name
                      : 'Sahyadri Bank'}{' '}
                    · {m.channel}
                  </div>
                  {m.text}
                  <time className="mt-2 block text-[10px] text-slate-400">
                    {new Date(m.created_at).toLocaleString('en-IN')}
                  </time>
                </div>
              ))}
              <Link
                className="desk-button"
                href={`/app?c=${kase.customer_id}&case=${kase.id}`}
              >
                Open customer case ↗
              </Link>
            </div>
          ) : panel === 'route' ? (
            <div className="space-y-4 overflow-auto p-5">
              <p className="text-sm font-semibold">
                {edge
                  .split('>')
                  .map((n) => NODE_META[n as NodeId]?.label ?? n)
                  .join(' → ')}
              </p>
              <p className="text-xs text-slate-500">
                Recorded handoff: {shown.edges[edge] ?? 'intake processing'}.
                Related routing records appear below.
              </p>
              {shown.steps
                .filter(
                  (s) => s.node === 'orchestrator' && s.kind === 'decision',
                )
                .map((s) => (
                  <div key={s.id} className="rounded-xl border p-3">
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-500">
                      {s.detail}
                    </p>
                  </div>
                ))}
            </div>
          ) : panel === 'evidence' ? (
            <EvidencePanel run={shown} />
          ) : (
            <div className="min-h-0 overflow-auto">
              {shown.outcome &&
                shown.outcome.status !== 'AWAITING_APPROVAL' && (
                  <CaseReport
                    o={shown.outcome}
                    run={shown}
                    onReplay={pickNode}
                  />
                )}
              <ResultPanel
                kase={kase}
                run={shown}
                live={replay === null ? live : (shown.outcome?.after ?? null)}
                deciding={
                  busy ||
                  replay !== null ||
                  !connected ||
                  kase.status !== 'NEEDS_YOU'
                }
                onDecide={decide}
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
