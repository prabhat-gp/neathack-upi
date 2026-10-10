'use client'

import { useEffect, useRef, useState } from 'react'
import { API_URL } from '@/lib/run'
import { Icon } from '../meta'

type Zone = 'intake' | 'agents' | 'tools' | 'systems' | 'guard' | 'trace' | 'code' | 'plan' | 'host'

const PARTNERS: { id: string; name: string; role: string; how: string; zone: Zone; live: boolean; href?: string; tone: string }[] = [
  { id: 'codex', name: 'OpenAI Codex', role: 'The agents’ brain', zone: 'agents', live: true, tone: 'from-slate-800 to-slate-950',
    how: 'Orchestrator, Investigator, Policy and Resolver each run as a Codex session on our ChatGPT plan, deciding which tool to call next.' },
  { id: 'mcp', name: 'Model Context Protocol', role: 'How agents reach the bank', zone: 'tools', live: true, tone: 'from-violet-600 to-indigo-700',
    how: 'Each agent gets its own MCP endpoint with only its tools. Every call goes through our adapters and guardrails, never straight to a system.' },
  { id: 'neatlogs', name: 'neatlogs', role: 'Every AI turn, traced', zone: 'trace', live: true, tone: 'from-emerald-500 to-teal-600',
    how: 'One trace per case: workflow, each agent, each Codex turn with its tokens, each tool and each bank call. Failures are flagged; every run links to its trace.' },
  { id: 'entire', name: 'Entire', role: 'Every commit, explained', zone: 'code', live: true, tone: 'from-orange-500 to-rose-600', href: 'https://entire.io/gh/prabhat-gp/neathack-upi',
    how: 'Each commit carries a checkpoint of the AI session that wrote it. Graph maps the code, Brain keeps project memory, Trails review every push before prod.' },
  { id: 'cfo', name: 'cfo.ai', role: 'The business plan', zone: 'plan', live: false, tone: 'from-sky-500 to-blue-600',
    how: 'Reads measured unit economics from our MCP server (time, AI turns, deadlines met, penalty) to plan pricing, costs, revenue and runway.' },
  { id: 'aws', name: 'AWS', role: 'Where it runs', zone: 'host', live: false, tone: 'from-amber-500 to-orange-600',
    how: 'One EC2 instance runs the web app, the API and the agents for reviewers.' },
  { id: 'github', name: 'GitHub', role: 'Open source', zone: 'code', live: true, tone: 'from-slate-600 to-slate-800', href: 'https://github.com/prabhat-gp/neathack-upi',
    how: 'Public repository. qa holds work in progress, main is production, merged through an Entire trail.' },
]

const SYSTEMS = [
  { icon: 'cbs', name: 'Core banking' }, { icon: 'npci', name: 'NPCI · UDIR' }, { icon: 'bene', name: 'Other bank' },
  { icon: 'acquirer', name: 'Acquirer' }, { icon: 'ncrp', name: 'Cybercrime portal' },
]
const AGENTS = [
  { icon: 'investigator', name: 'Investigator', g: 'from-sky-500 to-blue-600' },
  { icon: 'policy', name: 'Policy', g: 'from-amber-500 to-orange-600' },
  { icon: 'resolver', name: 'Resolver', g: 'from-emerald-500 to-teal-600' },
]

type Metrics = { llm_runs: number; deadline_cases: number; deadlines_met: number; penalty_paid_inr: number; avg_seconds_per_case: number | null; avg_party_calls_per_case: number | null }

function CountUp({ to, suffix = '', prefix = '' }: { to: number; suffix?: string; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const t0 = performance.now()
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / 900)
        setN(Math.round(to * (1 - Math.pow(1 - p, 3))))
        if (p < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    })
    io.observe(el)
    return () => io.disconnect()
  }, [to])
  return <span ref={ref} className="tabular-nums">{prefix}{n.toLocaleString('en-IN')}{suffix}</span>
}

function Box({ lit, children, className = '' }: { lit: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border bg-white transition duration-300 ${lit ? 'border-violet-400 shadow-lg shadow-violet-100 ring-4 ring-violet-100' : 'border-slate-200'} ${className}`}>
      {children}
    </div>
  )
}

export default function UnderTheHood() {
  const [hover, setHover] = useState<Zone | null>(null)
  const [m, setM] = useState<Metrics | null>(null)
  useEffect(() => {
    fetch(`${API_URL}/api/metrics`).then((r) => r.json()).then(setM).catch(() => {})
  }, [])
  const lit = (z: Zone) => hover === z

  return (
    <section id="built" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-violet-600">Under the hood</p>
        <h2 className="mt-3 max-w-3xl font-serif text-[44px] leading-[1.08] tracking-tight">
          One case, end to end. <span className="text-slate-400">Every step real, traced and reviewable.</span>
        </h2>

        {/* Pipeline */}
        <div className="mt-12 rounded-[2rem] border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-6 md:p-8">
          <div className="grid items-center gap-3 lg:grid-cols-[150px_24px_minmax(0,1fr)_24px_150px_24px_120px]">
            <Box lit={lit('intake')} className="p-4">
              <div className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-400">In</div>
              <div className="mt-1 text-[13.5px] font-semibold">Nightly recon sweep</div>
              <div className="text-[13.5px] font-semibold">+ complaints</div>
              <div className="mt-1 text-[11.5px] text-slate-500">any language, any wording</div>
            </Box>
            <Flow />
            <Box lit={lit('agents')} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 text-white"><Icon name="orchestrator" className="h-4 w-4" /></span>
                  <span className="text-[14px] font-semibold">Orchestrator</span>
                </div>
                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">OpenAI Codex</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {AGENTS.map((a, i) => (
                  <div key={a.name} className="relative rounded-xl border border-slate-200 p-2.5 text-center">
                    <span className={`mx-auto grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br ${a.g} text-white`}><Icon name={a.icon} className="h-4 w-4" /></span>
                    <div className="mt-1.5 text-[12px] font-semibold">{a.name}</div>
                    <span className="hood-pulse absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-violet-500" style={{ animationDelay: `${i * 0.6}s` }} />
                  </div>
                ))}
              </div>
              <div className={`mt-3 rounded-xl border border-dashed px-3 py-2 text-center text-[11.5px] transition ${lit('tools') ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-slate-300 text-slate-500'}`}>
                ↓ tools over <b>MCP</b>, one endpoint per agent ↓
              </div>
              <div className={`mt-2 grid grid-cols-5 gap-1.5 transition ${lit('tools') || lit('systems') ? 'opacity-100' : 'opacity-90'}`}>
                {SYSTEMS.map((s) => (
                  <div key={s.name} className="rounded-lg bg-slate-50 px-1 py-2 text-center">
                    <Icon name={s.icon} className="mx-auto h-4 w-4 text-slate-500" />
                    <div className="mt-1 text-[10px] leading-tight text-slate-600">{s.name}</div>
                  </div>
                ))}
              </div>
            </Box>
            <Flow />
            <Box lit={lit('guard')} className="p-4">
              <div className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-400">Guardrails</div>
              <ul className="mt-1.5 space-y-1 text-[12px] text-slate-700">
                <li>✓ re-check NPCI & ledger</li><li>✓ recompute amounts</li><li>✓ idempotent postings</li><li>✓ human sign-off for risk</li>
              </ul>
            </Box>
            <Flow />
            <div className="rounded-2xl bg-ink p-4 text-center text-white">
              <div className="font-serif text-[44px] leading-none text-emerald-300">₹0</div>
              <div className="mt-1 text-[11px] text-slate-400">penalty, inside T+1 / T+5</div>
            </div>
          </div>

          {/* Rails under the pipeline */}
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <Rail lit={lit('trace')} tone="bg-emerald-500" label="neatlogs" text="traces every case: agent → AI turn → tool → bank call" />
            <Rail lit={lit('code') } tone="bg-orange-500" label="Entire + GitHub" text="every commit checkpointed, reviewed on a trail" />
            <Rail lit={lit('plan') || lit('host')} tone="bg-sky-500" label="cfo.ai · AWS" text="business plan from live numbers · hosted on EC2" />
          </div>
        </div>

        {/* Live numbers */}
        {m && m.llm_runs > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-slate-200 bg-slate-200 md:grid-cols-4">
            <Stat v={<CountUp to={m.llm_runs} />} k="cases worked by the AI agents" />
            <Stat v={<><CountUp to={m.deadlines_met} />/{m.deadline_cases}</>} k="RBI deadlines met" />
            <Stat v={<CountUp to={m.penalty_paid_inr} prefix="₹" />} k="penalty paid" />
            <Stat v={<CountUp to={Math.round(m.avg_party_calls_per_case ?? 0)} />} k="live system calls per case, on average" />
          </div>
        )}
        {m && m.llm_runs > 0 && <p className="mt-2 text-right text-[11px] text-slate-400">Live from the run ledger on this server</p>}

        {/* Partners */}
        <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PARTNERS.map((p) => (
            <div key={p.id} onMouseEnter={() => setHover(p.zone)} onMouseLeave={() => setHover(null)}
              className="group relative rounded-3xl border border-slate-200 bg-white p-5 transition duration-300 hover:-translate-y-1 hover:border-violet-300 hover:shadow-xl hover:shadow-violet-100">
              <div className="flex items-center justify-between">
                <span className={`rounded-xl bg-gradient-to-br ${p.tone} px-2.5 py-1 text-[12.5px] font-bold tracking-tight text-white`}>{p.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.live ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {p.live ? '● live' : 'setting up'}
                </span>
              </div>
              <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{p.role}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{p.how}</p>
              {p.href && (
                <a href={p.href} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-violet-700 hover:underline">
                  See it <Icon name="arrow" className="h-3 w-3 transition group-hover:translate-x-0.5" />
                </a>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-slate-400">Hover a card to see where it sits in the pipeline.</p>
      </div>
    </section>
  )
}

function Flow() {
  return (
    <div className="relative mx-auto h-6 w-[3px] overflow-hidden rounded-full bg-slate-200 lg:h-[3px] lg:w-full">
      <span className="hood-dot absolute left-0 top-0 h-[3px] w-[3px] rounded-full bg-violet-500 lg:h-[3px] lg:w-3" />
    </div>
  )
}

function Rail({ lit, tone, label, text }: { lit: boolean; tone: string; label: string; text: string }) {
  return (
    <div className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition duration-300 ${lit ? 'border-violet-400 bg-violet-50 shadow-md' : 'border-slate-200 bg-white'}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${tone}`} />
      <span className="text-[12.5px]"><b className="font-semibold">{label}</b> <span className="text-slate-500">{text}</span></span>
    </div>
  )
}

function Stat({ v, k }: { v: React.ReactNode; k: string }) {
  return (
    <div className="bg-white px-6 py-6">
      <div className="font-serif text-[40px] leading-none tracking-tight">{v}</div>
      <p className="mt-2 text-[12.5px] leading-snug text-slate-500">{k}</p>
    </div>
  )
}
