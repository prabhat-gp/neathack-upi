import Link from 'next/link'
import UnderTheHood from '@/components/home/UnderTheHood'
import { Icon } from '@/components/meta'

const SOURCES = [
  { n: 1, label: 'NPCI UPI statistics, Sep 2026 (StartupTalky)', url: 'https://startuptalky.com/upi-transactions-september-2026/' },
  { n: 2, label: 'RBI Annual Report of the Ombudsman Scheme 2024-25', url: 'https://website.rbi.org.in/web/rbi/-/publications/annual-report-of-ombudsman-scheme-2024-25' },
  { n: 3, label: 'RBI circular on TAT & compensation for failed transactions (20 Sep 2019)', url: 'https://rbi.org.in/commonman/English/scripts/Notification.aspx?Id=3074' },
  { n: 4, label: 'NPCI circular UPI/OC/213/2024-25 on chargeback auto-acceptance', url: 'https://npci.org.in/PDF/npci/upi/circular/2025/UPI-OC-No-213-FY-2024-25-Auto-Acceptance-Rejection-of-Chargeback.pdf' },
]

const S = ({ n }: { n: number }) => (
  <a href={`#src-${n}`} className="ml-0.5 align-super font-sans text-[10px] font-semibold text-violet-500 hover:underline">{n}</a>
)

const TODAY = [
  { step: 'Settlement file', note: 'NPCI raw data lands after each cycle' },
  { step: 'Reconciliation', note: 'Matched against switch & core banking' },
  { step: 'Exception list', note: 'Deemed, unmatched, suspense items' },
  { step: 'Analyst', note: 'Checks CBS, NPCI, the other bank' },
  { step: 'Emails & forms', note: 'Returns, chargebacks, postings' },
  { step: 'Deadline missed', note: '₹100/day, chargeback lost', bad: true },
]

const ROWS = [
  ['Finding the exception', 'Next-day manual reconciliation of settlement files', 'Agents sweep every settlement file as it lands'],
  ['Investigating', 'An analyst checks 3–4 systems and emails the other bank', 'Investigator queries every party in parallel, in seconds'],
  ['Deciding', 'Someone reads the circular and counts days', 'Policy engine computes the deadline and what is owed'],
  ['Acting', 'Manual postings, returns and dispute forms', 'Resolver executes through guardrails; risky cases need one click'],
  ['Result', 'Penalties, lost chargebacks, Ombudsman escalations', 'Closed inside the deadline. ₹0 penalty'],
]

const AGENTS = [
  { icon: 'orchestrator', name: 'Orchestrator', grad: 'from-violet-600 to-indigo-700', line: 'Picks up every exception and routes it on evidence, skipping agents a case doesn’t need.' },
  { icon: 'investigator', name: 'Investigator', grad: 'from-sky-500 to-blue-600', line: 'Asks core banking, NPCI, the other bank and the merchant’s acquirer what really happened.' },
  { icon: 'policy', name: 'Policy', grad: 'from-amber-500 to-orange-600', line: 'Applies the exact RBI rule and computes the deadline. Amounts are never guessed.' },
  { icon: 'resolver', name: 'Resolver', grad: 'from-emerald-500 to-teal-600', line: 'Refunds, returns, raises chargebacks or freezes fraud, through a guardrailed engine.' },
]

const HANDLES = ['Deemed payments with no credit confirmation', 'Inward credits stuck in suspense', 'Merchant never got confirmation', '“Recipient says not received”', 'Collect-request fraud', 'The other bank’s systems going down']

export default function Home() {
  return (
    <div className="bg-white text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-100/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-700 text-white">
              <Icon name="orchestrator" className="h-4 w-4" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">DisputePro</span>
          </Link>
          <nav className="hidden gap-6 text-[13.5px] text-slate-500 md:flex">
            <a href="#today" className="hover:text-slate-900">The problem</a>
            <a href="#how" className="hover:text-slate-900">How it works</a>
            <a href="#built" className="hover:text-slate-900">Under the hood</a>
          </nav>
          <Link href="/console" className="ml-auto flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white hover:bg-slate-800">
            Open the desk <Icon name="arrow" className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-violet-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -left-40 top-40 h-[420px] w-[420px] rounded-full bg-sky-100/60 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 pb-20 pt-16 lg:grid-cols-[1.15fr_1fr] lg:pt-24">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-violet-600">AI agents for UPI exceptions</p>
            <h1 className="mt-5 font-serif text-[52px] leading-[1.02] tracking-tight sm:text-[68px]">
              Banks pay penalties on UPI failures they fix too late.{' '}
              <em className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">Our agents fix them first.</em>
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-slate-600">
              DisputePro catches deemed, stuck and disputed UPI payments, investigates them across core banking, NPCI and the other bank,
              and resolves them before the RBI deadline. No queue. No penalty.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/console" className="flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3.5 text-[14px] font-semibold text-white shadow-xl shadow-violet-200 hover:brightness-110">
                <Icon name="play" className="h-4 w-4" /> Watch agents clear an exception
              </Link>
              <a href="#today" className="text-[14px] font-semibold text-slate-600 hover:text-slate-900">See the problem ↓</a>
            </div>
          </div>

          <div className="relative">
            <div className="rounded-3xl bg-ink p-6 text-white shadow-2xl shadow-slate-300">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-slate-400">
                <span>Deemed payment · ₹5,000</span>
                <span className="rounded-full bg-amber-400/15 px-2 py-0.5 font-mono normal-case tracking-normal text-amber-300">T+1 · tonight 23:59</span>
              </div>
              <ol className="mt-5 space-y-3.5">
                {[
                  ['from-violet-500 to-indigo-600', 'Orchestrator', 'Reconciliation sweep flags UTR …8871'],
                  ['from-sky-500 to-blue-600', 'Investigator', 'NPCI: deemed. Kaveri Bank: never credited'],
                  ['from-amber-500 to-orange-600', 'Policy', 'RBI 4(a): refund by T+1. 21h left'],
                  ['from-emerald-500 to-teal-600', 'Resolver', '₹5,000 refunded · chargeback raised'],
                ].map(([g, who, what]) => (
                  <li key={who} className="flex items-center gap-3">
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${g}`}><Icon name="check" className="h-3.5 w-3.5" /></span>
                    <span className="text-[13.5px]"><b className="font-semibold">{who}</b> <span className="text-slate-400">· {what}</span></span>
                  </li>
                ))}
              </ol>
              <div className="mt-6 flex items-end justify-between border-t border-white/10 pt-5">
                <div>
                  <div className="font-serif text-[64px] leading-none text-emerald-300">₹0</div>
                  <div className="mt-1 text-[12px] text-slate-400">penalty paid</div>
                </div>
                <div className="text-right font-mono text-[12px] leading-relaxed text-slate-400">
                  <div><span className="text-white">21h</span> to spare</div>
                  <div><span className="text-white">0</span> analyst touches</div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-center text-[11.5px] text-slate-400">From a run on the sandbox bank</p>
          </div>
        </div>
      </section>

      {/* Numbers */}
      <section className="border-y border-slate-100">
        <div className="mx-auto grid max-w-6xl divide-slate-100 px-6 sm:grid-cols-3 sm:divide-x">
          {[
            ['24.07 bn', 'UPI transactions in a single month (Sep 2026)', 1],
            ['13.34 lakh', 'complaints to the RBI Ombudsman in FY25, up 13.55%', 2],
            ['₹100 / day', 'owed for each failed payment not fixed by T+1 (T+5 for merchants)', 3],
          ].map(([v, l, n]) => (
            <div key={v as string} className="py-10 sm:px-8 first:sm:pl-0">
              <div className="font-serif text-[44px] leading-none tracking-tight">{v}</div>
              <p className="mt-2 max-w-[16rem] text-[13.5px] leading-snug text-slate-500">{l}<S n={n as number} /></p>
            </div>
          ))}
        </div>
      </section>

      {/* Today */}
      <section id="today" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24">
        <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-violet-600">How banks handle it today</p>
        <h2 className="mt-3 max-w-3xl font-serif text-[44px] leading-[1.08] tracking-tight">
          Exceptions are cleared by people, files and email. <span className="text-slate-400">The clock doesn’t wait.</span>
        </h2>

        <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-slate-200 bg-slate-200 md:grid-cols-3">
          {[
            ['Status unknown for a day', 'When the other bank times out, NPCI marks the payment “deemed” and settles it as a success. The truth only appears when reconciliation teams match the next settlement files against their switch and core banking.'],
            ['An analyst per exception', 'Every exception means checking core banking, NPCI and the other bank, often by email. Then come manual postings, returns and dispute forms. Teams grow with UPI volume.'],
            ['Late means paying', <>Miss T+1 or T+5 and ₹100 a day is owed, credited suo moto.<S n={3} /> NPCI notes chargebacks “closed on deemed acceptance basis along with RBI penalty” when returns came too late.<S n={4} /></>],
          ].map(([t, d], i) => (
            <div key={i} className="bg-white p-8">
              <span className="font-mono text-[12px] text-slate-400">0{i + 1}</span>
              <h3 className="mt-3 text-[18px] font-semibold tracking-tight">{t}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-slate-600">{d}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 overflow-x-auto rounded-3xl border border-slate-200 p-6">
          <div className="flex min-w-[760px] items-start">
            {TODAY.map((t, i) => (
              <div key={t.step} className="flex flex-1 items-start">
                <div className="flex-1">
                  <div className="flex items-center">
                    <span className={`h-3 w-3 shrink-0 rounded-full ${t.bad ? 'bg-rose-500 ring-4 ring-rose-100' : 'bg-slate-300'}`} />
                    {i < TODAY.length - 1 && <span className="h-px flex-1 bg-slate-200" />}
                  </div>
                  <div className={`mt-3 pr-3 text-[13.5px] font-semibold ${t.bad ? 'text-rose-600' : 'text-slate-800'}`}>{t.step}</div>
                  <div className="pr-3 text-[12px] leading-snug text-slate-500">{t.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* With DisputePro */}
      <section id="how" className="scroll-mt-20 bg-slate-50 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-violet-600">With DisputePro</p>
          <h2 className="mt-3 max-w-3xl font-serif text-[44px] leading-[1.08] tracking-tight">
            The same work, done by agents, <em className="text-violet-600">inside the deadline.</em>
          </h2>

          <div className="mt-12 overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <div className="grid grid-cols-[1fr_1.3fr_1.3fr] border-b border-slate-200 bg-slate-50/80 px-6 py-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              <span />
              <span>Today</span>
              <span className="text-violet-600">DisputePro</span>
            </div>
            {ROWS.map(([k, a, b], i) => (
              <div key={k} className={`grid grid-cols-[1fr_1.3fr_1.3fr] items-center gap-4 px-6 py-4 ${i < ROWS.length - 1 ? 'border-b border-slate-100' : ''}`}>
                <span className="text-[14px] font-semibold">{k}</span>
                <span className="text-[13.5px] text-slate-500">{a}</span>
                <span className={`flex items-start gap-2 text-[13.5px] ${i === ROWS.length - 1 ? 'font-semibold text-emerald-700' : 'text-slate-800'}`}>
                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{b}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-16 grid gap-4 md:grid-cols-4">
            {AGENTS.map((a) => (
              <div key={a.name} className="rounded-3xl border border-slate-200 bg-white p-6">
                <span className={`grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br ${a.grad} text-white shadow-md`}>
                  <Icon name={a.icon} className="h-5 w-5" />
                </span>
                <div className="mt-5 flex items-center gap-2">
                  <h3 className="text-[17px] font-semibold tracking-tight">{a.name}</h3>
                  <span className="rounded bg-violet-600 px-1 py-px text-[8.5px] font-bold tracking-wider text-white">AI AGENT</span>
                </div>
                <p className="mt-2 text-[13.5px] leading-relaxed text-slate-600">{a.line}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[12px] font-semibold uppercase tracking-widest text-slate-400">Handles</span>
            {HANDLES.map((h) => (
              <span key={h} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-700">{h}</span>
            ))}
          </div>
        </div>
      </section>

      <UnderTheHood />

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="relative overflow-hidden rounded-[2rem] bg-ink px-10 py-16 text-white">
          <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-violet-600/30 blur-3xl" />
          <h2 className="relative max-w-2xl font-serif text-[48px] leading-[1.05] tracking-tight">
            Watch AI agents clear real exceptions, <em className="text-emerald-300">₹0 penalty each.</em>
          </h2>
          <p className="relative mt-4 max-w-xl text-[15px] text-slate-400">
            Six cases on a sandbox bank with live APIs for core banking, NPCI, the other bank, the acquirer and the cybercrime portal,
            or write your own complaint. Every AI turn and every call is shown.
          </p>
          <Link href="/console" className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-[14px] font-semibold text-ink hover:bg-slate-100">
            <Icon name="play" className="h-4 w-4" /> Open the exceptions desk
          </Link>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl border-t border-slate-100 px-6 py-10 text-[12px] text-slate-500">
        <ol className="space-y-1">
          {SOURCES.map((s) => (
            <li key={s.n} id={`src-${s.n}`}>{s.n}. <a href={s.url} target="_blank" rel="noreferrer" className="hover:text-violet-600 hover:underline">{s.label}</a></li>
          ))}
        </ol>
        <p className="mt-6 text-slate-400">DisputePro · NeatHack 2026 · Sahyadri, Kaveri and Narmada are fictional sandbox banks.</p>
      </footer>
    </div>
  )
}
