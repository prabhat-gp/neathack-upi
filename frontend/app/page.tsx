import Link from 'next/link'
import { Icon } from '@/components/meta'
import SquadHero from '@/components/home/SquadHero'
import ProofGallery from '@/components/home/ProofGallery'
import SponsorShowcase from '@/components/home/SponsorShowcase'

const AGENTS = [
  ['orchestrator', 'Master agent', 'Picks the next failed payment from the ledger and coordinates three specialists, one case at a time.'],
  ['investigator', 'Investigator', 'Checks payment records across the bank, payment network and receiving bank.'],
  ['policy', 'RBI Policy', 'A mandatory gate checks T+1 or T+5, bank authority and compensation before financial action.'],
  ['resolver', 'Resolver', 'Assesses risk and recommends the next action, with evidence for the reviewer.'],
]
const PRODUCT_PROOF = [
  { src: '/proof/desk-t02-oct12.webp', title: 'The product · T02 resolved on the live desk', caption: 'The deployed desk on 12 October: the agents located an NPCI routing timeout and refunded ₹1,800 in 37 seconds, with 1 day 7 hours to spare before the T+1 deadline.' },
  { src: '/proof/desk-t21-approval-oct12.webp', title: 'The outcome · A human stays in control', caption: 'T21 needs a ₹12,600 payout, above the ₹10,000 auto-approval limit. The RBI gate has passed, but no money moves until a reviewer approves.' },
]
const GITHUB = 'https://github.com/prabhat-gp/neathack-upi'
const FIX_COMMIT = 'b30b9d27d1cb7f8a792b10579503b0f7582c7d10'
// Each row links to proof a judge can open: the live desk, public pages, the public repo, or a saved copy where the
// sponsor page needs a login.
const PROOF_ROWS = [
  ['Live', 'The agents resolve real cases', 'T02 resolved on the deployed desk in 37.7 s.', 'Open the bank desk', '/console'],
  ['Screenshot', 'neatlogs found a real incident', '90 model calls over 100,000 tokens, traced to our Codex loop.', 'The investigation', '/proof/sponsors/neatlogs-investigation.webp'],
  ['Public', 'We shipped the fix neatlogs suggested', 'Prompt caching with a test: $0.132 down to $0.103 a case.', 'b30b9d2', `${GITHUB}/commit/${FIX_COMMIT}`],
  ['Public', 'Entire recorded the build', '39 checkpoints across 45 commits, linked to their sessions.', 'The fix on Entire', `https://entire.io/gh/prabhat-gp/neathack-upi/commit/${FIX_COMMIT}`],
  ['Public', 'cfo.ai priced the business', '₹1 lakh a month per bank with 1,000 cases included, on the measured ₹10 a case.', 'The plan in cfo.ai', 'https://cfo.ai/s/CRMsGa9CnYduMy2H'],
  ['Saved', 'Crustdata picked the first bank', 'AU Small Finance Bank, 10,001+ employees.', 'The API results', '/evidence#crustdata'],
  ['Public', 'Tested, not just demoed', '30 backend tests: approvals, duplicates, policy before money moves.', 'The tests', `${GITHUB}/tree/main/backend/tests`],
  ['Public', 'Built at neatHack', 'First commit 10 October, 11:18 IST. All of the code is public.', 'aa8f7b5', `${GITHUB}/commit/aa8f7b5`],
]
function Actions() {
  return <div className="flex flex-wrap gap-3">
    <Link href="/console" className="home-action home-action-primary">Open bank desk <span aria-hidden="true">→</span></Link>
  </div>
}
export default function Home() {
  return (
    <div className="home-page bg-[#f6f7f9] text-[#17243b]">
      <div className="home-hero text-white">
        <header className="relative border-b border-white/10">
          <nav aria-label="Main navigation" className="home-container flex items-center justify-between gap-4 py-5">
            <Link href="/" aria-label="DisputePro home" className="flex items-center gap-2.5 font-display text-lg font-semibold"><span className="rounded-lg bg-blue-500 p-2"><Icon name="orchestrator" /></span>DisputePro</Link>
            <div className="hidden items-center gap-7 text-sm text-slate-300 md:flex"><a href="#journey">For banks</a><a href="#squad">The agents</a><a href="#sponsors">Sponsor proof</a></div>
            <Link href="/console" className="home-nav-cta">Open bank desk <span aria-hidden="true">→</span></Link>
          </nav>
        </header>
        <main>
          <section className="home-container relative grid items-center gap-12 py-14 lg:grid-cols-2 lg:gap-16 lg:py-20">
            <div className="home-enter">
              <a href="#sponsors" className="home-built-badge"><span aria-hidden="true">★</span> Built at neatHack 2026</a>
              <p className="home-eyebrow mt-6 text-blue-300">Our mission · faster recovery for banks</p>
              <h1 className="mt-5 font-display text-[clamp(2.8rem,5.5vw,4.8rem)] font-semibold leading-[1.05] tracking-[-.045em]">Resolve failed UPI transactions.<br /><span className="text-blue-300">In under a minute.</span></h1>
              <p className="mt-6 max-w-lg text-base leading-8 text-slate-300">Turn a stuck payment into a verified resolution. AI agents trace the failure, apply RBI rules and carry out eligible recovery actions—with your team in control of approvals.</p>
              <div className="mt-8"><Actions /></div>
              <p className="mt-5 text-xs leading-6 text-slate-400">Measured on the live desk on 12 October: 36.8–45.3 seconds a case with Claude Sonnet 4.6. Cases held for human approval take longer.</p>
              <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-xs text-slate-400"><span>Evidence behind decisions</span><span>Human approval when needed</span><span>Sandbox demo</span></div>
            </div>
            <SquadHero />
          </section>
          <div className="home-container grid grid-cols-2 gap-6 border-t border-white/10 py-8 md:grid-cols-4">{[['22','seeded ledger cases'],['1 + 3','master + specialists'],['37.7s','T02 on the live desk'],['RBI','mandatory policy gate']].map(([v,l])=><div key={v}><strong className="font-display text-2xl font-semibold">{v}</strong><p className="mt-2 text-xs text-slate-400">{l}</p></div>)}</div>
        </main>
      </div>

      <section id="journey" className="home-section home-container">
        <div className="home-section-heading"><div><p className="home-eyebrow text-blue-600">Who is it for?</p><h2>For the bank teams<br />behind every failed payment.</h2></div><p>DisputePro gives payment operations, reconciliation and exception-handling teams one desk to investigate the payments that need intervention—and a clear record of how each case was handled.</p></div>
        <div className="home-scale-panel">
          <div><p className="home-eyebrow text-blue-600">A small percentage. An enormous workload.</p><h3>UPI operates at<br /><strong>nearly 800 million</strong><br />transactions a day.</h3><p>NPCI reports 24.51 billion transactions in August 2026—about 790.6 million a day on average.</p><a href="https://www.npci.org.in/product/upi/product-statistics" target="_blank" rel="noreferrer">Source: NPCI · August 2026 ↗</a></div>
          <div className="home-scale-math"><span className="home-scenario-label">ILLUSTRATIVE SCALE · ASSUMED FAILURE RATE</span><div><strong>800M</strong><span>daily transactions</span></div><i>×</i><div><strong>1%</strong><span>assumed technical failures</span></div><i>=</i><div className="home-scale-answer"><strong>8 million</strong><span>failed attempts in a day</span></div><p>This is a scale illustration, not a verified network-wide failure rate. Failures that auto-reverse do not all become manual cases; the unresolved exceptions are the work this desk targets.</p></div>
        </div>
      </section>

      <section id="why-agents" className="home-section border-y border-slate-200 bg-white">
        <div className="home-container">
          <div className="home-section-heading"><div><p className="home-eyebrow text-blue-600">Why banks need agents</p><h2>Every unresolved payment<br />has a deadline.</h2></div><p>A backlog means more than extra work. Once an eligible failed payment crosses its RBI turnaround limit, compensation starts adding up. Agents help banks act sooner, with the policy checks and evidence still in place.</p></div>
          <div className="home-deadlines">
            <article><div><span>PERSON-TO-PERSON · P2P</span><strong>T+1</strong></div><h3>Debited. Never credited.</h3><p>For a UPI funds transfer where the account is debited but the beneficiary is not credited, the beneficiary bank must reverse the funds by T+1 if it cannot credit the account.</p><footer><b>₹100 per day</b><span>for delay beyond T+1</span></footer></article>
            <article><div><span>PAYMENT TO MERCHANT · P2M</span><strong>T+5</strong></div><h3>Debited. Merchant unconfirmed.</h3><p>For a UPI merchant payment where the account is debited but confirmation does not reach the merchant, the auto-reversal deadline is T+5.</p><footer><b>₹100 per day</b><span>for delay beyond T+5</span></footer></article>
          </div>
          <p className="home-policy-source">T is the calendar date of the transaction. Eligible compensation must be credited automatically, without waiting for a customer complaint. This is customer compensation under RBI’s framework, not a flat fine on every failed attempt. <a href="https://rbi.org.in/commonman/English/scripts/Notification.aspx?Id=3074" target="_blank" rel="noreferrer">Read the RBI circular · UPI rows 4(a) and 4(b) ↗</a></p>
          <div className="home-agent-value"><Icon name="policy"/><p><strong>Speed is useful. Governed speed is the product.</strong> Agents collect the evidence and prepare the remedy. Mandatory policy checks, fresh ledger verification and approval limits decide what can execute.</p></div>
        </div>
      </section>

      <section id="squad" className="home-section border-y border-slate-200 bg-white">
        <div className="home-container">
          <div className="home-section-heading"><div><p className="home-eyebrow text-blue-600">Meet the agents</p><h2>Meet your payment<br />recovery team.</h2></div><p>One master agent coordinates three specialists. Each has a defined job, visible model activity and source-backed findings. Your analysts handle the cases that need judgment.</p></div>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{AGENTS.map(([id, title, copy]) => <article key={id} className="home-card !bg-slate-50 !p-5"><span className="home-icon"><Icon name={id} /></span><h3 className="mt-5 font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-500">{copy}</p></article>)}</div>
          <div className="mt-5 grid gap-5 rounded-2xl bg-blue-50 p-6 md:grid-cols-3">{[
            ['Checks before action', 'The execution engine checks the payment and ledger again before acting.'],
            ['Approval for sensitive cases', 'Fraud cases and payouts over ₹10,000 wait for a human decision.'],
            ['An auditable case receipt', 'The desk preserves the ruling, executed actions and references for bank analysts.'],
          ].map(([title, copy]) => <div key={title}><h3 className="text-sm font-semibold text-blue-950">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p></div>)}</div>
        </div>
      </section>

      <section id="sponsors" className="home-section bg-[#0b1426] text-white">
        <div className="home-container">
          <div className="home-section-heading"><div><p className="home-eyebrow text-blue-300">Built at neatHack 2026</p><h2>Four sponsor tools.<br />Four decisions they changed.</h2></div><p className="!text-slate-400">Not logos on a slide. neatlogs found a real incident in our agents, Entire recorded how we fixed it, cfo.ai priced the business on what a case really costs, and Crustdata picked the first bank to pitch. Thank you to all four.</p></div>
          <SponsorShowcase />
          <div id="proof-rows" className="mt-16 border-t border-white/10 pt-12">
            <div className="home-section-heading"><div><p className="home-eyebrow text-blue-300">For judges</p><h2>Eight claims.<br />Each one opens to proof.</h2></div><p className="!text-slate-400"><b className="font-semibold text-slate-200">Live</b> is the running product, <b className="font-semibold text-slate-200">Public</b> opens without a login, <b className="font-semibold text-slate-200">Saved</b> is our copy of a sponsor result, and a <b className="font-semibold text-slate-200">Screenshot</b> stands in where the sponsor page needs a login.</p></div>
            <ol className="proof-rows">{PROOF_ROWS.map(([kind, title, fact, label, href], i) => (
              <li key={title}>
                <span className="proof-check" aria-hidden="true">✓</span>
                <div><h3><span>{i + 1}</span>{title}</h3><p>{fact}</p></div>
                <span className={`proof-kind proof-kind-${kind.toLowerCase()}`}>{kind}</span>
                <a href={href} {...(href.startsWith('http') || href.endsWith('.webp') ? { target: '_blank', rel: 'noreferrer' } : {})}>{label} <span aria-hidden="true">{href.startsWith('/') && !href.endsWith('.webp') ? '→' : '↗'}</span></a>
              </li>
            ))}</ol>
          </div>
          <div id="product-proof" className="mt-12 border-t border-white/10 pt-10">
            <div className="home-section-heading"><div><p className="home-eyebrow text-blue-300">Build evidence · 12 October 2026</p><h2>See what works.<br />Inspect what proves it.</h2></div><p className="!text-slate-400">The live bank desk on 12 October, a resolved case and a case held for approval, with the measured numbers behind them. Screenshots open here, so you can inspect the details without losing your place.</p></div>
            <div className="home-proof-metrics">{[['30','backend tests passed','Includes approvals, duplicate protection, prompt caching and changed-evidence holds.'],['37.7s','T02 on the live desk','Claude Sonnet 4.6 · 12 October · 25 steps traced in neatlogs.'],['$0.103','model cost per case','With prompt caching, measured on the deployed desk. $0.132 before the fix.']].map(([v,title,copy])=><div key={v}><strong>{v}</strong><h3>{title}</h3><p>{copy}</p></div>)}</div>
            <ProofGallery images={PRODUCT_PROOF} />
            <p className="mt-5 text-xs leading-6 text-slate-400">Model runs use sandbox bank and network adapters. Business forecasts are assumptions, not measured revenue. Sponsor research and build history are separate from transaction evidence.</p>
          </div>
        </div>
      </section>

      <section className="home-section home-container"><div className="home-closing"><div><p className="home-eyebrow text-blue-600">Try the full journey</p><h2 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Let the agents take<br />the next case.</h2><p className="mt-4 max-w-lg text-sm leading-7 text-slate-500">Open the bank desk. Follow a failed payment from investigation to policy check, action and receipt. See the work, not just the result.</p></div><Actions /></div></section>
      <footer className="border-t border-slate-200"><div className="home-container flex flex-wrap justify-between gap-4 py-7 text-xs leading-6 text-slate-500"><span>DisputePro · neatHack 2026 · Sandbox demo.</span><span>Made with coffee, stubbornness and agents who never say “Monday?” by <a href="https://prabhatgp.me" target="_blank" rel="noreferrer" className="font-semibold text-blue-600 hover:underline">Prabhat ↗</a></span><a href="https://github.com/prabhat-gp/neathack-upi" target="_blank" rel="noreferrer" className="hover:text-blue-600">Source & build log ↗</a></div></footer>
    </div>
  )
}
