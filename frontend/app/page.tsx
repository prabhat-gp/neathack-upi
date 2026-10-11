import Link from 'next/link'
import { Icon } from '@/components/meta'
import SquadHero from '@/components/home/SquadHero'
import DeskNumbers from '@/components/home/DeskNumbers'
import ProofGallery from '@/components/home/ProofGallery'

const AGENTS = [
  ['intake', 'Intake', 'Understands the complaint and finds the payment. Asks for a missing detail when needed.'],
  ['orchestrator', 'Orchestrator', 'Chooses the next agent based on what the case needs. Keeps the investigation moving.'],
  ['investigator', 'Investigator', 'Checks payment records across the bank, payment network and receiving bank.'],
  ['policy', 'Policy', 'Checks the deadline and works out the refund and any compensation owed.'],
  ['resolver', 'Resolver', 'Assesses risk and recommends the next action, with evidence for the reviewer.'],
]
const PROOF = [
  { src: '/proof/neatlogs-trace.png', title: 'neatlogs · Inside an investigation', caption: 'Recorded agent steps, model calls, token usage and bank calls in a single case trace.' },
  { src: '/proof/entire-checkpoint.png', title: 'Entire · From session to commit', caption: 'A development checkpoint links the code change to the AI session behind it.' },
  { src: '/proof/entire-commits.jpg', title: 'Entire · Build history', caption: 'Attributed commits on the qa branch show how the project developed.' },
  { src: '/proof/entire-trail.jpg', title: 'Entire · Review trail', caption: 'The qa → main trail records the review path for the project.' },
]
const SPONSORS = [
  ['neatlogs', 'Agent observability', 'Connected', 'See what each agent did, which tools it called and where a run slowed down.'],
  ['Entire', 'Build history', 'Connected', 'Follow the AI sessions, checkpoints and commits that shaped the product.'],
  ['cfo.ai', 'Business planning', 'Model verified', 'An editable 12-month model with pricing, delivery costs, cash flow and three scenarios.'],
  ['Crustdata', 'Company intelligence', 'API verified', 'Live company research feeds the business plan. Ambiguous matches stay visible for review.'],
]
function Actions({ dark = false }: { dark?: boolean }) {
  return <div className="flex flex-wrap gap-3">
    <Link href="/app?tour=1" className="home-action home-action-primary">Quick tour <span aria-hidden="true">→</span></Link>
    <Link href="/app" className={`home-action ${dark ? 'home-action-dark' : 'home-action-secondary'}`}>Customer portal <span aria-hidden="true">↗</span></Link>
  </div>
}
export default function Home() {
  return (
    <div className="home-page bg-[#f6f7f9] text-[#17243b]">
      <div className="home-hero text-white">
        <header className="relative border-b border-white/10">
          <nav aria-label="Main navigation" className="home-container flex items-center justify-between gap-4 py-5">
            <Link href="/" aria-label="DisputePro home" className="flex items-center gap-2.5 font-display text-lg font-semibold"><span className="rounded-lg bg-blue-500 p-2"><Icon name="orchestrator" /></span>DisputePro</Link>
            <div className="hidden items-center gap-7 text-sm text-slate-300 md:flex"><a href="#journey">How it works</a><a href="#squad">The agents</a><a href="#sponsors">Sponsor proof</a></div>
            <Link href="/app?tour=1" className="home-nav-cta">Quick tour <span aria-hidden="true">→</span></Link>
          </nav>
        </header>
        <main>
          <section className="home-container relative grid items-center gap-12 py-14 lg:grid-cols-2 lg:gap-16 lg:py-20">
            <div className="home-enter">
              <p className="home-eyebrow text-blue-300">AI agents for payment disputes</p>
              <h1 className="mt-5 font-display text-[clamp(2.8rem,5.5vw,4.8rem)] font-semibold leading-[1.05] tracking-[-.045em]">Payment stuck?<br /><span className="text-blue-300">Start with a message.</span></h1>
              <p className="mt-6 max-w-lg text-base leading-8 text-slate-300">Tell us what happened. Watch the agents find the payment, check the evidence and work towards a resolution.</p>
              <div className="mt-8"><Actions dark /></div>
              <p className="mt-5 text-xs leading-6 text-slate-400">Start as the customer. Follow the investigation when you’re ready.</p>
              <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-xs text-slate-400"><span>Evidence behind decisions</span><span>Human approval when needed</span><span>Sandbox demo</span></div>
            </div>
            <SquadHero />
          </section>
          <DeskNumbers />
        </main>
      </div>

      <section id="journey" className="home-section home-container">
        <div className="home-section-heading"><div><p className="home-eyebrow text-blue-600">One continuous journey</p><h2>Your complaint.<br />A clear path forward.</h2></div><p>Begin in the customer portal. The handoff lets you enter the bank view before the agents start, so you can follow every step.</p></div>
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {[
            ['01', 'Tell us what went wrong', 'Choose a sample problem or write your own. You don’t need to know the payment reference.', 'complaint'],
            ['02', 'Watch the investigation', 'Select Watch agents. See the evidence arrive and understand why the next agent takes over.', 'investigator'],
            ['03', 'See what happens next', 'A case can be resolved, ask for more details or wait for approval. The reason stays visible.', 'check'],
          ].map(([number, title, copy, icon]) => <article key={number} className="home-card"><div className="flex items-center justify-between"><span className="home-icon"><Icon name={icon} /></span><span className="font-mono text-xs text-slate-400">{number}</span></div><h3 className="mt-6 text-lg font-semibold">{title}</h3><p className="mt-3 text-sm leading-7 text-slate-500">{copy}</p></article>)}
        </div>
      </section>

      <section id="squad" className="home-section border-y border-slate-200 bg-white">
        <div className="home-container">
          <div className="home-section-heading"><div><p className="home-eyebrow text-blue-600">Meet the agents</p><h2>Different roles.<br />Shared evidence.</h2></div><p>The next step depends on the case. Missing details, conflicting records and risky actions each take a different path.</p></div>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{AGENTS.map(([id, title, copy]) => <article key={id} className="home-card !bg-slate-50 !p-5"><span className="home-icon"><Icon name={id} /></span><h3 className="mt-5 font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-500">{copy}</p></article>)}</div>
          <div className="mt-5 grid gap-5 rounded-2xl bg-blue-50 p-6 md:grid-cols-3">{[
            ['Checks before action', 'The execution engine checks the payment and ledger again before acting.'],
            ['Approval for sensitive cases', 'Fraud cases and payouts over ₹10,000 wait for a human decision.'],
            ['An update for the customer', 'The case records the outcome and sends a response through the original channel.'],
          ].map(([title, copy]) => <div key={title}><h3 className="text-sm font-semibold text-blue-950">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p></div>)}</div>
        </div>
      </section>

      <section id="results" className="home-section home-container">
        <div className="home-section-heading"><div><p className="home-eyebrow text-blue-600">Recorded sandbox outcomes</p><h2>More than one way<br />to close a case.</h2></div><p>Examples from previous Codex investigations. These are recorded results, not promises about every new case. Customer messages below are shown in English.</p></div>
        <div className="mt-9 grid gap-4 md:grid-cols-3">{[
          ['Payment not received', '“₹2,000 left my account, but Anita hasn’t received it.”', '₹2,000 refunded', '82 seconds · refund and chargeback'],
          ['Check before refunding', '“I sent ₹3,000 yesterday. Has the money come back?”', 'Refund confirmed', '56 seconds · no duplicate refund'],
          ['Receiving bank unavailable', 'An ₹8,000 payment reached a closed account. The other bank’s API was down.', '₹8,000 returned', '124 seconds · recovered from an API failure'],
        ].map(([label, complaint, outcome, detail]) => <article key={label} className="home-card flex flex-col"><p className="home-eyebrow text-blue-600">{label}</p><p className="my-6 text-base leading-7 text-slate-600">{complaint}</p><div className="mt-auto border-t border-slate-100 pt-5"><h3 className="font-display text-2xl font-semibold">{outcome}</h3><p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p></div></article>)}</div>
      </section>

      <section id="sponsors" className="home-section bg-[#0b1426] text-white">
        <div className="home-container">
          <div className="home-section-heading"><div><p className="home-eyebrow text-blue-300">Built at neatHack</p><h2>The tools behind<br />the work.</h2></div><p className="!text-slate-400">See where each sponsor fits, and inspect the evidence from the project. Connection status and completed work are shown separately.</p></div>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{SPONSORS.map(([name, role, status, copy]) => <article key={name} className="rounded-2xl border border-white/10 bg-white/[.03] p-5"><p className="text-xs text-slate-400">{role}</p><h3 className="mt-3 font-display text-2xl font-semibold">{name}</h3><span className={`mt-4 inline-block rounded-full px-2.5 py-1 text-[11px] ${['Connected', 'Model verified', 'API verified'].includes(status) ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-200'}`}>{status}</span><p className="mt-4 text-sm leading-6 text-slate-400">{copy}</p>{(name === 'cfo.ai' || name === 'Crustdata') && <Link href={name === 'cfo.ai' ? '/evidence#cfo' : '/evidence#crustdata'} className="mt-5 inline-block text-sm font-medium text-blue-300">Inspect verified work ↗</Link>}</article>)}</div>
          <div id="product-proof" className="mt-12 border-t border-white/10 pt-10"><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><h3 className="font-display text-2xl font-semibold">Proof, up close.</h3><p className="text-xs text-slate-400">Tap a screenshot to enlarge it here.</p></div><ProofGallery images={PROOF} /><p className="mt-5 text-xs leading-6 text-slate-400">cfo.ai model values and Crustdata API results are captured with their sources. Planning assumptions are labelled separately from measured results.</p></div>
        </div>
      </section>

      <section className="home-section home-container"><div className="home-closing"><div><p className="home-eyebrow text-blue-600">Try the full journey</p><h2 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Be the customer first.</h2><p className="mt-4 max-w-lg text-sm leading-7 text-slate-500">Send a complaint, enter the investigation and follow it through to the next decision.</p></div><Actions /></div></section>
      <footer className="border-t border-slate-200"><div className="home-container flex flex-wrap justify-between gap-4 py-7 text-xs leading-6 text-slate-500"><span>DisputePro · neatHack 2026 · Sahyadri is a fictional sandbox bank.</span><a href="https://github.com/prabhat-gp/neathack-upi" target="_blank" rel="noreferrer" className="hover:text-blue-600">Source & build log ↗</a></div></footer>
    </div>
  )
}
