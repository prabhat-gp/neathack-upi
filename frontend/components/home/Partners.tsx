import { Icon } from '../meta'

// Each partner gets a small visual of what it actually does for DisputePro. Content mirrors real artefacts:
// a neatlogs trace of the outage case, Entire checkpoints/trail on this repo, and the numbers cfo.ai reads from our MCP.

function Panel({ name, tag, live, title, text, children, accent }: {
  name: string; tag: string; live: boolean; title: string; text: string; children: React.ReactNode; accent: string
}) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white transition duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-slate-200">
      <div className="relative h-56 overflow-hidden border-b border-slate-100 bg-night p-5">
        <div className={`pointer-events-none absolute inset-0 opacity-70 ${accent}`} />
        <div className="relative">{children}</div>
      </div>
      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-center justify-between">
          <span className="font-display text-[22px] font-semibold tracking-[-0.03em]">{name}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${live ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {live ? '● Live' : tag}
          </span>
        </div>
        <h3 className="mt-3 text-[15px] font-semibold text-slate-900">{title}</h3>
        <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500">{text}</p>
      </div>
    </div>
  )
}

const TRACE: [number, string, string, string, string?][] = [
  [0, 'WORKFLOW', 'resolve_upi_dispute', '1m 31s'],
  [1, 'AGENT', 'investigator', '22.5s'],
  [2, 'LLM', 'gpt-6-luna · 94,413 tok', '19.5s'],
  [2, 'TOOL', 'NPCI · transaction status', '86ms'],
  [2, 'TOOL', 'Kaveri Bank · credit confirmation', '504', 'err'],
  [1, 'AGENT', 'policy', '14.1s'],
  [1, 'AGENT', 'resolver', '18.0s'],
]
const KIND: Record<string, string> = { WORKFLOW: 'text-violet-300', AGENT: 'text-sky-300', LLM: 'text-emerald-300', TOOL: 'text-white/50' }

const COMMITS = [
  ['trace codex turns and tool calls in neatlogs', '01M4J7…'],
  ['crustdata tools for investigator, resume agents…', '01M4J7…'],
  ['console redesign: pipeline stepper, one agent…', '01M4J7…'],
]

const PLAN = [
  ['Cost per case', 'measured · DisputePro MCP'],
  ['Pricing', 'per exception cleared'],
  ['Revenue', '13.34L complaints / yr market'],
  ['Runway', 'from costs + pricing'],
]

export default function Partners() {
  return (
    <section id="partners" className="scroll-mt-10 bg-slate-50 py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[12.5px] font-medium text-violet-600">Powered by</p>
            <h2 className="mt-3 max-w-3xl font-display text-[44px] font-semibold leading-[1.03] tracking-[-0.04em]">
              neatlogs, Entire and cfo.ai <span className="font-serif font-normal italic text-slate-400">behind every case.</span>
            </h2>
          </div>
          <p className="max-w-sm text-[15px] leading-relaxed text-slate-500">
            Observability for the agents, memory for the code, and a business plan built on measured numbers.
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          <Panel name="neatlogs" tag="" live accent="bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.25),transparent_60%)]"
            title="Every AI decision, traced"
            text="Each case is one trace: every agent, every Codex turn with its tokens, every tool and bank call. When the other bank failed, the trace showed exactly where.">
            <ul className="space-y-1.5 font-mono text-[11px]">
              {TRACE.map(([d, k, n, t, err], i) => (
                <li key={i} className="step-in flex items-center gap-2" style={{ paddingLeft: d * 14, animationDelay: `${i * 80}ms` }}>
                  <span className={`w-[58px] shrink-0 text-[9.5px] font-semibold ${KIND[k]}`}>{k}</span>
                  <span className={`truncate ${err ? 'text-rose-300' : 'text-white/80'}`}>{n}</span>
                  <span className={`ml-auto shrink-0 ${err ? 'rounded bg-rose-500/20 px-1 text-rose-300' : 'text-white/30'}`}>{t}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel name="Entire" tag="" live accent="bg-[radial-gradient(ellipse_at_top_right,rgba(249,115,22,0.25),transparent_60%)]"
            title="Every line of code, explained"
            text="Each commit links to the AI session that wrote it. Graph maps the codebase, Brain remembers past decisions, and a trail reviews every push before production.">
            <ul className="space-y-2">
              {COMMITS.map(([m, c], i) => (
                <li key={i} className="flex items-center gap-2.5">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-orange-400 ring-4 ring-orange-400/15" />
                  <span className="truncate text-[11.5px] text-white/80">{m}</span>
                  <span className="ml-auto shrink-0 rounded bg-white/10 px-1.5 font-mono text-[9.5px] text-orange-200">{c}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center justify-between text-[11.5px]">
                <span className="font-semibold text-white">Trail #1 · qa → main</span>
                <span className="text-orange-200">reviewing</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {['review', 'risk', 'security', 'drift', 'confidence', 'summary'].map((r) => (
                  <span key={r} className="rounded-full bg-white/10 px-2 py-0.5 text-[9.5px] text-white/70">{r}</span>
                ))}
              </div>
            </div>
          </Panel>

          <Panel name="cfo.ai" tag="Plan in progress" live={false} accent="bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.25),transparent_60%)]"
            title="A business plan on real numbers"
            text="cfo.ai reads our measured unit economics through the DisputePro MCP server and plans pricing, costs, revenue and runway from them, not from guesses.">
            <div className="rounded-xl border border-white/10 bg-white/[0.04]">
              {PLAN.map(([k, v], i) => (
                <div key={k} className={`flex items-center justify-between px-3 py-2.5 text-[11.5px] ${i ? 'border-t border-white/5' : ''}`}>
                  <span className="font-medium text-white">{k}</span>
                  <span className="text-white/45">{v}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 font-mono text-[10.5px] text-sky-200">
              <Icon name="arrow" className="h-3 w-3" /> desk_metrics · recent_runs · market_facts
            </div>
          </Panel>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['OpenAI Codex', 'The brain of all four agents, on our ChatGPT plan', true],
            ['Model Context Protocol', 'How agents reach core banking, NPCI and the other bank', true],
            ['GitHub', 'Open source. qa for work, main for production', true],
            ['AWS', 'One EC2 instance hosts the desk for reviewers', false],
          ].map(([n, t, live]) => (
            <div key={n as string} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-violet-200 hover:shadow-md">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${live ? 'bg-emerald-500' : 'bg-amber-400'}`} />
              <div>
                <div className="font-display text-[15px] font-semibold tracking-tight">{n}</div>
                <p className="mt-0.5 text-[12.5px] leading-snug text-slate-500">{t}{live ? '' : ' (deploying)'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
