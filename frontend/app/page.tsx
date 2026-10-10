import Link from 'next/link'
import HeroPreview from '@/components/home/HeroPreview'
import LiveStats from '@/components/home/LiveStats'
import Partners from '@/components/home/Partners'
import { Icon } from '@/components/meta'

const SOURCES = [
  { n: 1, label: 'NPCI UPI statistics, Sep 2026 (StartupTalky)', url: 'https://startuptalky.com/upi-transactions-september-2026/' },
  { n: 2, label: 'RBI Annual Report of the Ombudsman Scheme 2024-25', url: 'https://website.rbi.org.in/web/rbi/-/publications/annual-report-of-ombudsman-scheme-2024-25' },
  { n: 3, label: 'RBI circular on TAT & compensation for failed transactions (20 Sep 2019)', url: 'https://rbi.org.in/commonman/English/scripts/Notification.aspx?Id=3074' },
  { n: 4, label: 'NPCI circular UPI/OC/213/2024-25 on chargeback auto-acceptance', url: 'https://npci.org.in/PDF/npci/upi/circular/2025/UPI-OC-No-213-FY-2024-25-Auto-Acceptance-Rejection-of-Chargeback.pdf' },
]

const STEPS = [
  { n: '01', agent: 'Orchestrator', title: 'Catch it', text: 'Every settlement file and every complaint becomes a case the moment it lands, routed only on evidence.', icon: 'orchestrator' },
  { n: '02', agent: 'Investigator', title: 'Find the truth', text: 'Live calls to core banking, NPCI and the other bank establish what actually happened to the money.', icon: 'investigator' },
  { n: '03', agent: 'Policy', title: 'Know the deadline', text: 'The exact RBI rule, the T+1 or T+5 deadline and what is owed, computed to the second.', icon: 'policy' },
  { n: '04', agent: 'Resolver', title: 'Fix it in time', text: 'Refund, return, chargeback or freeze, executed through guardrails before any penalty starts.', icon: 'resolver' },
]

const TRUST = [
  { title: 'Nothing moves on a guess', text: 'Before money moves, the execution engine re-checks NPCI and the ledger, recomputes every amount and posts idempotently.', icon: 'guard' },
  { title: 'People stay in charge', text: 'Fraud, high risk or payouts above ₹10,000 wait for one-click approval. Everything else clears itself.', icon: 'human' },
  { title: 'Every decision on the record', text: 'Each case is a neatlogs trace down to every AI turn and bank call. Each line of code links to the Entire session that wrote it.', icon: 'finding' },
]

const Sup = ({ n }: { n: number }) => (
  <a href={`#src-${n}`} className="ml-0.5 align-super text-[10px] font-medium text-slate-400 hover:text-violet-600">{n}</a>
)

export default function Home() {
  return (
    <div className="bg-white text-slate-900">
      {/* Hero */}
      <section className="relative overflow-hidden bg-night text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_70%_0%,rgba(124,58,237,0.28),transparent_60%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />

        <header className="relative mx-auto flex max-w-6xl items-center gap-10 px-6 py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-night"><Icon name="orchestrator" className="h-4 w-4" /></span>
            <span className="font-display text-[16px] font-semibold tracking-tight">DisputePro</span>
          </Link>
          <nav className="hidden gap-7 text-[13.5px] text-white/55 md:flex">
            <a href="#partners" className="transition hover:text-white">Powered by</a>
            <a href="#how" className="transition hover:text-white">How it works</a>
            <a href="#trust" className="transition hover:text-white">Trust</a>
          </nav>
          <Link href="/console" className="group ml-auto flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-night transition hover:bg-white/90">
            Open the live desk <Icon name="arrow" className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
          </Link>
        </header>

        <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-6 pb-24 pt-14 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
          <div className="step-in">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[12px] text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> AI agents for bank UPI desks
            </span>
            <h1 className="mt-6 font-display text-[48px] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[64px]">
              ₹0 in RBI penalties. <span className="font-serif font-normal italic tracking-[-0.02em] text-violet-300">Every</span> UPI exception cleared in time.
            </h1>
            <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-white/60">
              DisputePro’s agents investigate failed and stuck UPI payments across core banking, NPCI and the other bank,
              and resolve them inside the deadline. Your bank pays ₹0 in compensation.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/console" className="group flex items-center gap-2 rounded-full bg-violet-500 px-6 py-3 text-[14px] font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:bg-violet-400">
                <Icon name="play" className="h-4 w-4" /> Run a live case
              </Link>
              <a href="#how" className="rounded-full px-5 py-3 text-[14px] font-medium text-white/70 transition hover:text-white">How it works →</a>
            </div>
          </div>
          <HeroPreview />
        </div>

        <div className="relative border-t border-white/10 bg-white/[0.02]">
          <div className="mx-auto max-w-6xl px-6 py-10"><LiveStats /></div>
        </div>
      </section>

      <Partners />

      {/* Problem */}
      <section className="mx-auto max-w-6xl px-6 py-28">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="text-[12.5px] font-medium text-violet-600">The problem</p>
            <h2 className="mt-3 font-display text-[40px] font-semibold leading-[1.05] tracking-[-0.035em]">
              A failed payment is a ticking cost.
            </h2>
            <p className="mt-4 max-w-sm text-[15.5px] leading-relaxed text-slate-500">
              Today exceptions are found a day late in reconciliation files and worked by hand across three or four systems.
              Miss the deadline and the bank pays, every day.
            </p>
          </div>
          <div className="grid gap-px overflow-hidden rounded-3xl border border-slate-200 bg-slate-200 sm:grid-cols-3">
            {[
              ['24.07bn', 'UPI payments in a single month', 1],
              ['13.34L', 'complaints to the RBI Ombudsman last year', 2],
              ['₹100', 'per day, per payment, once T+1 passes', 3],
            ].map(([v, k, n]) => (
              <div key={k as string} className="bg-white p-7">
                <div className="font-display text-[38px] font-semibold leading-none tracking-[-0.04em]">{v}</div>
                <p className="mt-3 text-[13.5px] leading-snug text-slate-500">{k}<Sup n={n as number} /></p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-10 border-y border-slate-100 bg-slate-50/60 py-28">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-[12.5px] font-medium text-violet-600">How it works</p>
          <h2 className="mt-3 max-w-2xl font-display text-[40px] font-semibold leading-[1.05] tracking-[-0.035em]">
            Four agents. One case. <span className="font-serif font-normal italic text-slate-400">About a minute.</span>
          </h2>
          <div className="mt-14 grid gap-4 md:grid-cols-4">
            {STEPS.map((s, i) => (
              <div key={s.n} className="group relative rounded-3xl border border-slate-200 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/70">
                <div className="flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white transition group-hover:bg-violet-600"><Icon name={s.icon} className="h-[18px] w-[18px]" /></span>
                  <span className="font-mono text-[11px] text-slate-300">{s.n}</span>
                </div>
                <h3 className="mt-6 font-display text-[19px] font-semibold tracking-[-0.02em]">{s.title}</h3>
                <p className="mt-0.5 text-[12px] font-medium text-violet-600">{s.agent} agent</p>
                <p className="mt-3 text-[14px] leading-relaxed text-slate-500">{s.text}</p>
                {i < STEPS.length - 1 && <span className="absolute -right-3 top-11 z-10 hidden h-px w-6 bg-slate-300 md:block" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section id="trust" className="mx-auto max-w-6xl scroll-mt-10 px-6 py-28">
        <p className="text-[12.5px] font-medium text-violet-600">Built for a bank</p>
        <h2 className="mt-3 max-w-2xl font-display text-[40px] font-semibold leading-[1.05] tracking-[-0.035em]">
          Autonomous where it’s safe. <span className="font-serif font-normal italic text-slate-400">Accountable everywhere.</span>
        </h2>
        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {TRUST.map((t) => (
            <div key={t.title}>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-600"><Icon name={t.icon} className="h-[18px] w-[18px]" /></span>
              <h3 className="mt-5 font-display text-[19px] font-semibold tracking-[-0.02em]">{t.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-slate-500">{t.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Live proof */}
      <section id="proof" className="scroll-mt-10 px-4 pb-6">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-night px-8 py-16 text-white md:px-14">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_100%_100%,rgba(124,58,237,0.25),transparent_60%)]" />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-[12.5px] font-medium text-violet-300">Try it</p>
              <h2 className="mt-3 max-w-xl font-display text-[40px] font-semibold leading-[1.05] tracking-[-0.035em]">
                Pick a case, or write your own complaint. <span className="font-serif font-normal italic text-white/50">Watch the agents work.</span>
              </h2>
            </div>
            <Link href="/console" className="group flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[14px] font-semibold text-night transition hover:bg-white/90">
              Run one yourself <Icon name="arrow" className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-14">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-night text-white"><Icon name="orchestrator" className="h-3.5 w-3.5" /></span>
            <span className="font-display text-[15px] font-semibold tracking-tight">DisputePro</span>
          </div>
          <ol className="max-w-xl space-y-1 text-[12px] text-slate-400">
            {SOURCES.map((s) => (
              <li key={s.n} id={`src-${s.n}`}>{s.n}. <a href={s.url} target="_blank" rel="noreferrer" className="transition hover:text-violet-600">{s.label}</a></li>
            ))}
          </ol>
        </div>
        <p className="mt-10 text-[12px] text-slate-400">neatHack 2026 · Sahyadri, Kaveri and Narmada are fictional sandbox banks · <a href="https://github.com/prabhat-gp/neathack-upi" className="hover:text-violet-600">Source on GitHub</a></p>
      </footer>
    </div>
  )
}
