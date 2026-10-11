import Link from 'next/link'
import { Icon } from '@/components/meta'
import SquadHero from '@/components/home/SquadHero'
import ProofGallery from '@/components/home/ProofGallery'
import ExposureCalculator from '@/components/home/ExposureCalculator'

const AGENTS = [
  ['orchestrator', 'Master agent', 'Picks the next failed payment from the ledger and coordinates three specialists, one case at a time.'],
  ['investigator', 'Investigator', 'Checks payment records across the bank, payment network and receiving bank.'],
  ['policy', 'RBI Policy', 'A mandatory gate checks T+1 or T+5, bank authority and compensation before financial action.'],
  ['resolver', 'Resolver', 'Assesses risk and recommends the next action, with evidence for the reviewer.'],
]
const PRODUCT_PROOF = [
  { src: '/proof/bank-desk-oct11.png', title: 'The product · A bank desk built around agents', caption: 'The failed-payment ledger, the payment chain, a master agent with three specialists, and RBI governance with the outcome side by side.' },
  { src: '/proof/bank-resolution-oct11.png', title: 'The outcome · A human stays in control', caption: 'A ₹11,200 refund above the auto-approval limit: the RBI policy gate passed, and the proposed actions wait for a reviewer before any money moves.' },
]
const SPONSOR_PROOF = [
  { src: '/proof/neatlogs-trace.png', title: 'neatlogs · Inspect the actual agent work', caption: 'A recorded investigation trace exposes model calls, tool responses and token usage. Live cases link to their own trace when available.' },
  { src: '/proof/entire-checkpoint.png', title: 'Entire · Follow the build back to its session', caption: 'A genuine development checkpoint connects an AI session with its code changes. Build evidence, separate from payment evidence.' },
  { src: '/proof/cfo-model.jpg', title: 'cfo.ai · A business model beyond the demo', caption: 'The native workspace contains a 12-month operating plan and base, downside and upside scenarios. Forecast assumptions are labelled.' },
  { src: '/proof/crustdata-research.png', title: 'Crustdata · Research with the source attached', caption: 'Actual company-identification responses support bank-market research. Ambiguous matches stay visible; company data is never treated as payment proof.' },
]
const SPONSORS = [
  ['neatlogs', 'Agent observability', 'Connected', 'See what each agent did, which tools it called and where a run slowed down.'],
  ['Entire', 'Build history', 'Connected', 'Follow the AI sessions, checkpoints and commits that shaped the product.'],
  ['cfo.ai', 'Business planning', 'Model verified', 'An editable 12-month model with pricing, delivery costs, cash flow and three scenarios.'],
  ['Crustdata', 'Company intelligence', 'API verified', 'Live company research feeds the business plan. Ambiguous matches stay visible for review.'],
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
              <p className="home-eyebrow text-blue-300">Our mission · faster recovery for banks</p>
              <h1 className="mt-5 font-display text-[clamp(2.8rem,5.5vw,4.8rem)] font-semibold leading-[1.05] tracking-[-.045em]">Resolve failed UPI transactions.<br /><span className="text-blue-300">Target: under 60 seconds.</span></h1>
              <p className="mt-6 max-w-lg text-base leading-8 text-slate-300">Turn a stuck payment into a verified resolution. AI agents trace the failure, apply RBI rules and carry out eligible recovery actions—with your team in control of approvals.</p>
              <div className="mt-8"><Actions /></div>
              <p className="mt-5 text-xs leading-6 text-slate-400">Under 60 seconds is our goal. Measured real-model sandbox runs: 62–85 seconds. Human review and external responses can take longer.</p>
              <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-xs text-slate-400"><span>Evidence behind decisions</span><span>Human approval when needed</span><span>Sandbox demo</span></div>
            </div>
            <SquadHero />
          </section>
          <div className="home-container grid grid-cols-2 gap-6 border-t border-white/10 py-8 md:grid-cols-4">{[['22','seeded ledger cases'],['1 + 3','master + specialists'],['<60s','our resolution target'],['RBI','mandatory policy gate']].map(([v,l])=><div key={v}><strong className="font-display text-2xl font-semibold">{v}</strong><p className="mt-2 text-xs text-slate-400">{l}</p></div>)}</div>
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
          <ExposureCalculator />
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
          <div className="home-section-heading"><div><p className="home-eyebrow text-blue-300">Built at neatHack</p><h2>An agentic AI solution.<br />Built at neatHack.</h2></div><p className="!text-slate-400">Thank you to the sponsors for helping us turn a difficult banking problem into a better solution. Your tools made the agents observable, the build traceable and the business plan more grounded.</p></div>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{SPONSORS.map(([name, role, status, copy]) => <article key={name} className="rounded-2xl border border-white/10 bg-white/[.03] p-5"><p className="text-xs text-slate-400">{role}</p><h3 className="mt-3 font-display text-2xl font-semibold">{name}</h3><span className={`mt-4 inline-block rounded-full px-2.5 py-1 text-xs ${['Connected', 'Model verified', 'API verified'].includes(status) ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-200'}`}>{status}</span><p className="mt-4 text-sm leading-6 text-slate-400">{copy}</p>{(name === 'cfo.ai' || name === 'Crustdata') && <Link href={name === 'cfo.ai' ? '/evidence#cfo' : '/evidence#crustdata'} className="mt-5 inline-block text-sm font-medium text-blue-300">Inspect verified work ↗</Link>}</article>)}</div>
          <div id="sponsor-proof" className="mt-12 border-t border-white/10 pt-10">
            <div className="home-section-heading"><div><p className="home-eyebrow text-blue-300">Proof of sponsors in DisputePro</p><h2>Each sponsor, at work<br />in this project.</h2></div><p className="!text-slate-400">Unedited screenshots from DisputePro’s own neatlogs, Entire, cfo.ai and Crustdata accounts. Open any of them to inspect the details.</p></div>
            <ProofGallery images={SPONSOR_PROOF} />
            <div className="home-proof-links"><Link href="/evidence#cfo">Inspect the cfo.ai model ↗</Link><Link href="/evidence#crustdata">Read the Crustdata responses ↗</Link><a href="https://entire.io/gh/prabhat-gp/neathack-upi/trails/1" target="_blank" rel="noreferrer">Follow the Entire review trail ↗</a></div>
          </div>
          <div id="product-proof" className="mt-12 border-t border-white/10 pt-10">
            <div className="home-section-heading"><div><p className="home-eyebrow text-blue-300">Build evidence · updated 11 October 2026</p><h2>See what works.<br />Inspect what proves it.</h2></div><p className="!text-slate-400">The latest bank desk and a recorded resolution, with the measured numbers behind them. Screenshots open here, so you can inspect the details without losing your place.</p></div>
            <div className="home-proof-metrics">{[['21','backend tests passed','Includes approvals, duplicate protection and changed-evidence holds.'],['62.1s','measured outward refund','A real four-agent sandbox run; under 60 seconds remains the goal.'],['64.1s','measured inward return','Funds returned from suspense with seven source calls.']].map(([v,title,copy])=><div key={v}><strong>{v}</strong><h3>{title}</h3><p>{copy}</p></div>)}</div>
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
