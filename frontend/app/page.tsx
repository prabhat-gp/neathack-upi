import Link from 'next/link'
import { Icon } from '@/components/meta'
import SquadHero from '@/components/home/SquadHero'
import DeskNumbers from '@/components/home/DeskNumbers'

const SQUAD = [
  ['intake', 'Intake', 'Reads the complaint in Hindi, Hinglish or English and finds the exact payment. Asks one question if it can’t.'],
  ['orchestrator', 'Orchestrator', 'Leads the squad. Decides who works the case next, based only on evidence.'],
  ['investigator', 'Investigator', 'Checks core banking, the NPCI switch, the other bank and the cybercrime portal.'],
  ['policy', 'Policy', 'Applies the RBI rule: T+1 or T+5, time left, and exactly what is owed.'],
  ['resolver', 'Resolver', 'Scores fraud risk and plans the smallest set of actions that closes the case.'],
]

const RUNS = [
  { ch: 'UPI app · Hindi', q: '“मेरे खाते से ₹2000 कट गए लेकिन Anita को नहीं मिले”', big: '₹2,000 refunded', sub: '9h 29m before the T+1 deadline', meta: '82 s · refund + chargeback' },
  { ch: 'Chat · Hinglish · no UTR', q: '“kal Kiran ko 3000 bheje the, paisa wapas nahi aaya”', big: 'Already refunded', sub: 'Found the payment, no double refund', meta: '56 s · closed with proof' },
  { ch: 'Nightly recon', q: '₹8,000 inward credit to a closed account, stuck in suspense', big: '₹8,000 returned', sub: '7h 39m before the T+1 deadline', meta: '124 s · other bank API down' },
]

const SPONSORS = [
  {
    name: 'neatlogs', role: 'Agent observability', status: 'Live',
    what: 'Every case is one trace: each agent, each Codex turn with its tokens, each tool and bank call. When the other bank’s API failed, the trace showed exactly where and what the agent did next.',
    link: ['Open a case trace from the desk', '/console'],
  },
  {
    name: 'Entire', role: 'Build provenance', status: 'Live',
    what: 'Every commit is linked to the AI session that wrote it. Graph maps the codebase, Brain keeps project memory, and a Trail reviews qa → main before anything reaches production.',
    link: ['Explore the build trail', 'https://entire.io/gh/prabhat-gp/neathack-upi/trails/1'],
  },
  {
    name: 'cfo.ai', role: 'Business plan', status: 'In progress',
    what: 'Pricing, costs, revenue and runway, built from the desk’s measured cost per case through the DisputePro MCP server instead of guesses.',
    link: null,
  },
] as const

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f6f7f9] text-[#17243b]">
      {/* Hero */}
      <div className="relative overflow-hidden bg-[#0b1426] text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_500px_at_85%_20%,rgba(49,92,231,.28),transparent_60%),radial-gradient(600px_400px_at_0%_100%,rgba(16,185,129,.10),transparent_60%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[.07] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_60%_30%,#000,transparent_70%)]" />
        <header className="relative">
          <nav className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-5">
            <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-semibold">
              <span className="rounded-lg bg-blue-500 p-2"><Icon name="orchestrator" /></span>
              DisputePro
            </Link>
            <div className="ml-auto hidden items-center gap-6 text-[13px] text-white/60 md:flex">
              <a href="#squad" className="hover:text-white">The squad</a>
              <a href="#results" className="hover:text-white">Real runs</a>
              <a href="#sponsors" className="hover:text-white">Sponsors</a>
              <Link href="/app?tour=1" className="hover:text-white">Take the tour</Link>
            </div>
            <Link href="/console" className="ml-auto rounded-lg bg-white/10 px-4 py-2 text-[13px] font-semibold hover:bg-white/20 md:ml-0">
              Open agent desk ↗
            </Link>
          </nav>
        </header>

        <section className="relative mx-auto grid max-w-7xl items-center gap-14 px-6 pb-20 pt-12 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-blue-300/25 bg-blue-400/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.18em] text-blue-200">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-300" /> The UPI dispute resolution squad
            </p>
            <h1 className="mt-7 font-display text-5xl font-semibold leading-[1.02] tracking-[-.045em] sm:text-7xl">
              Payment stuck?
              <br />
              <span className="bg-gradient-to-r from-blue-300 to-sky-200 bg-clip-text text-transparent">The squad’s on it.</span>
            </h1>
            <p className="mt-7 max-w-xl text-[17px] leading-8 text-slate-300/80">
              Five AI agents investigate every stuck UPI payment across core banking, NPCI and the other bank, and resolve it
              before RBI’s deadline. <span className="text-white">₹0 in penalties. Any language. Every decision traced.</span>
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/app?tour=1" className="desk-button desk-primary !px-6 !py-3.5 !text-sm">
                Start the tour <Icon name="arrow" />
              </Link>
              <Link href="/console" className="rounded-lg border border-white/20 px-6 py-3.5 text-sm font-medium hover:bg-white/5">
                Watch the squad work
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-white/45">
              <span>✓ Not a chatbot, a dispute desk</span>
              <span>✓ Humans approve fraud and payouts over ₹10,000</span>
              <span>✓ Sahyadri Bank sandbox</span>
            </div>
          </div>
          <SquadHero />
        </section>
        <DeskNumbers />
      </div>

      {/* Problem */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-blue-600">Why banks need it</p>
            <h2 className="mt-4 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              The clock starts the second the money leaves.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ['₹100/day', 'compensation per transaction once a bank misses T+1 (T+5 for merchant payments).', 'RBI DPSS.CO.PD No.629'],
              ['13.3 lakh', 'complaints to the RBI Ombudsman in FY25, up 13.55% in a year.', 'RBI Ombudsman report 2024-25'],
              ['3 systems', 'per case: core banking, the NPCI switch and the other bank, worked by hand today.', 'Ops workflow'],
            ].map(([v, d, s]) => (
              <div key={v} className="rounded-2xl border border-slate-200 bg-white p-6">
                <p className="font-display text-3xl font-semibold tracking-tight text-[#17243b]">{v}</p>
                <p className="mt-3 text-sm leading-6 text-slate-500">{d}</p>
                <p className="mt-4 text-[10px] uppercase tracking-wider text-slate-400">{s}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Squad */}
      <section id="squad" className="scroll-mt-6 border-y border-slate-200 bg-white py-24">
        <div className="mx-auto max-w-7xl px-6">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-blue-600">Meet the squad</p>
          <h2 className="mt-4 max-w-2xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Five agents. One job: <span className="text-slate-400">the customer’s money, back in time.</span>
          </h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {SQUAD.map(([id, name, copy], i) => (
              <div key={id} className="group rounded-2xl border border-slate-200 bg-[#f9fafc] p-5 transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:bg-white hover:shadow-xl hover:shadow-blue-100/60">
                <div className="flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600 transition group-hover:bg-blue-600 group-hover:text-white">
                    <Icon name={id} className="h-5 w-5" />
                  </span>
                  <span className="font-mono text-[10px] text-slate-300">0{i + 1}</span>
                </div>
                <h3 className="mt-6 font-display text-base font-semibold">{name}</h3>
                <p className="mt-2 text-[13px] leading-6 text-slate-500">{copy}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {[
              ['executor', 'Guardrailed execution engine', 'The only code that moves money. Re-checks NPCI and the ledger, recomputes every amount, never pays twice.'],
              ['human', 'Human in the loop', 'Fraud cases and payouts over ₹10,000 wait for one-click approval, with the evidence attached.'],
              ['complaint', 'Reply on the same channel', 'The customer hears back in the app, chat or SMS, in their own language.'],
            ].map(([id, t, d]) => (
              <div key={t} className="flex gap-4 rounded-2xl border border-slate-200 p-5">
                <Icon name={id} className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                <div>
                  <h3 className="text-sm font-semibold">{t}</h3>
                  <p className="mt-1.5 text-[13px] leading-6 text-slate-500">{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Real runs */}
      <section id="results" className="mx-auto max-w-7xl scroll-mt-6 px-6 py-24">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-blue-600">Real runs, real agents</p>
        <h2 className="mt-4 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Solved before the deadline.</h2>
        <p className="mt-4 max-w-2xl text-slate-500">Three cases the squad worked on OpenAI Codex. Nothing scripted: the agents found the payment and chose the action from the evidence.</p>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {RUNS.map((r) => (
            <div key={r.big} className="flex flex-col rounded-2xl bg-[#0b1426] p-6 text-white">
              <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-blue-300">{r.ch}</p>
              <p className="mt-4 text-[15px] leading-relaxed text-white/80">{r.q}</p>
              <div className="mt-auto pt-10">
                <p className="font-display text-3xl font-semibold tracking-tight">{r.big}</p>
                <p className="mt-1 text-sm text-emerald-300">{r.sub}</p>
                <p className="mt-4 border-t border-white/10 pt-4 font-mono text-[11px] text-white/40">{r.meta}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Sponsors */}
      <section id="sponsors" className="scroll-mt-6 bg-[#0b1426] py-24 text-white">
        <div className="mx-auto max-w-7xl px-6">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-blue-300">Built at #neatHack</p>
          <h2 className="mt-4 max-w-3xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Thank you to the sponsors <span className="text-white/40">who made this squad possible.</span>
          </h2>
          <p className="mt-5 max-w-2xl text-white/55">
            DisputePro was built over the neatHack weekend. These tools aren’t logos on a slide: each one is wired into how the
            agents run or how the product was built.
          </p>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {SPONSORS.map((s) => (
              <div key={s.name} className="flex flex-col rounded-2xl border border-white/10 bg-white/[.04] p-7 transition hover:border-blue-300/30 hover:bg-white/[.06]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-white/40">{s.role}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${s.status === 'Live' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'}`}>
                    {s.status === 'Live' ? '● Live' : s.status}
                  </span>
                </div>
                <h3 className="mt-6 font-display text-4xl font-semibold tracking-tight">{s.name}</h3>
                <p className="mt-4 text-[14px] leading-7 text-white/60">{s.what}</p>
                {s.link && (
                  <a href={s.link[1]} target={s.link[1].startsWith('http') ? '_blank' : undefined} rel="noreferrer"
                    className="mt-auto pt-6 text-[13px] font-semibold text-blue-300 hover:text-blue-200">
                    {s.link[0]} ↗
                  </a>
                )}
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-[12px] text-white/40">
            <span>Agents on <b className="font-semibold text-white/70">OpenAI Codex</b></span>
            <span>Tools over <b className="font-semibold text-white/70">MCP</b></span>
            <span>Open source on <b className="font-semibold text-white/70">GitHub</b></span>
            <span>Hosted on <b className="font-semibold text-white/70">AWS</b> (deploying)</span>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 py-24 text-center">
        <h2 className="mx-auto max-w-3xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          Raise a complaint. <span className="text-blue-600">Watch the squad solve it.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-slate-500">Write in any language as a Sahyadri Bank customer, then follow the agents live on the bank’s desk.</p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href="/app?tour=1" className="desk-button desk-primary !px-6 !py-3.5 !text-sm">Start the tour <Icon name="arrow" /></Link>
          <Link href="/console" className="desk-button !px-6 !py-3.5 !text-sm">Open the agent desk</Link>
        </div>
      </section>

      <footer className="border-t border-slate-200 px-6 py-8">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-4 text-xs text-slate-400">
          <span>DisputePro · built at neatHack 2026 · Sahyadri Bank is a fictional sandbox bank</span>
          <a href="https://github.com/prabhat-gp/neathack-upi" target="_blank" rel="noreferrer" className="hover:text-blue-600">Source & build log ↗</a>
        </div>
      </footer>
    </div>
  )
}
