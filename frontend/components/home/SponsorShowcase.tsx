'use client'

import { useId, useRef, useState, type KeyboardEvent } from 'react'

type Shot = { src: string; caption: string }
type Link = { href: string; label: string }
type Sponsor = {
  id: string; name: string; mark: string; role: string; source: string; headline: string
  stats: [string, string][]; shots: Shot[]; cta: Link; more?: Link; note?: string
}

const FIX_COMMIT = 'b30b9d27d1cb7f8a792b10579503b0f7582c7d10'

// Every number here was read from the sponsor's own dashboard or the live desk on 12 October 2026.
const SPONSORS: Sponsor[] = [
  {
    id: 'neatlogs', name: 'neatlogs', mark: 'nl', role: 'Agent observability', source: 'app.neatlogs.com',
    headline: 'neatlogs caught our agents burning tokens, then named the fix we shipped.',
    stats: [
      ['284,488 → 25,897', 'tokens for a case on our first runtime, Codex, against Claude Sonnet. 11× fewer, and 0 errors.'],
      ['90', 'model calls over 100,000 tokens each, flagged by our High Token Usage detection.'],
      ['$0.132 → $0.103', 'cost per case on the live desk after we shipped the prompt caching neatlogs recommended.'],
    ],
    shots: [
      { src: '/proof/sponsors/neatlogs-investigation.webp', caption: 'neatlogs Investigate compares two runs: 284,488 tokens and 2 errors on Codex, 25,897 tokens and none on Sonnet.' },
      { src: '/proof/sponsors/neatlogs-spike.webp', caption: 'High Token Usage Monitor: 90 flagged spans, a spike on 10 October, flat once the agents moved off Codex.' },
      { src: '/proof/sponsors/neatlogs-fix.webp', caption: 'The fix neatlogs proposed: Anthropic prompt caching in backend/engine/llm.py. We shipped it as commit b30b9d2.' },
      { src: '/proof/sponsors/neatlogs-trace.webp', caption: 'After the fix: T02 on the live desk, 25 steps in 37.8 s, every Claude call and bank tool call traced.' },
      { src: '/proof/sponsors/neatlogs-detections.webp', caption: 'Seven detections watch every run: token usage, usage limits, gateway timeouts, slow calls and failed steps.' },
    ],
    cta: { href: `https://github.com/prabhat-gp/neathack-upi/commit/${FIX_COMMIT}`, label: 'See the fix in our code' },
    note: 'neatlogs pages need a login, so these screenshots stand in for them.',
  },
  {
    id: 'entire', name: 'Entire', mark: 'E', role: 'Build provenance', source: 'entire.io',
    headline: 'Entire links every change to the AI session that wrote it.',
    stats: [
      ['39', 'checkpoints across 45 commits by the evening of 12 October, each tied to its Codex or Claude Code session.'],
      ['3.1M', 'tokens of AI build work recorded, from the first sandbox bank to the final fix.'],
      ['b30b9d2', 'the neatlogs fix, traced to its 2 sessions: +20 lines of code and +13 of tests.'],
    ],
    shots: [
      { src: '/proof/sponsors/entire-commit.webp', caption: 'The prompt-caching fix on Entire: its checkpoint, the Claude Code and Codex sessions behind it, and what it changed.' },
      { src: '/proof/sponsors/entire-analytics.webp', caption: 'Entire Analytics for the repository on 12 October: 39 checkpoints in 45 commits and 3.1M tokens of AI work.' },
    ],
    cta: { href: `https://entire.io/gh/prabhat-gp/neathack-upi/commit/${FIX_COMMIT}`, label: 'Open the fix on Entire' },
  },
  {
    id: 'cfo', name: 'cfo.ai', mark: 'cfo', role: 'Business planning', source: 'app.cfo.ai',
    headline: 'cfo.ai turned our measured agent cost into a 12-month plan for banks.',
    stats: [
      ['₹10', 'agent cost per case in the base plan, from the live desk ($0.103), not a guess.'],
      ['₹23.25 lakh', 'revenue in the first 12 months from 3 banks, at ₹1 lakh a month with 1,000 cases included.'],
      ['60.4%', 'recurring gross margin, with the ₹32 lakh funding gap shown rather than hidden.'],
    ],
    shots: [
      { src: '/proof/sponsors/cfo-plan.webp', caption: 'The DisputePro Business Plan in cfo.ai: revenue, banks and cash, October 2026 to September 2027.' },
      { src: '/proof/sponsors/cfo-measured.webp', caption: 'The plan records the 12 October cost update: Claude Sonnet with prompt caching, $0.103 a case.' },
    ],
    cta: { href: 'https://cfo.ai/s/CRMsGa9CnYduMy2H', label: 'Open the plan in cfo.ai' },
    more: { href: '/evidence#cfo', label: 'Read the forecast' },
    note: 'Forecast values are planning assumptions, not revenue.',
  },
  {
    id: 'crustdata', name: 'Crustdata', mark: 'C', role: 'Company intelligence', source: 'api.crustdata.com · rendered by DisputePro',
    headline: 'Crustdata told us which bank to pitch first.',
    stats: [
      ['3', 'small finance banks looked up through the Crustdata Company Identify API.'],
      ['10,001+', 'employees at AU Small Finance Bank, our first pilot candidate.'],
      ['2', 'ambiguous matches flagged for review instead of guessed.'],
    ],
    shots: [
      { src: '/proof/sponsors/crustdata-research.webp', caption: 'Saved Crustdata responses: one bank identified, one with two candidates, one ATM listing kept out of sizing.' },
    ],
    cta: { href: '/evidence#crustdata', label: 'Read the API results' },
    more: { href: 'https://github.com/prabhat-gp/neathack-upi/blob/main/backend/integrations/crustdata.py', label: 'See the integration' },
  },
]

const isExternal = (href: string) => href.startsWith('http')

function Cta({ link, primary }: { link: Link; primary?: boolean }) {
  return <a href={link.href} className={primary ? 'sponsor-cta sponsor-cta-primary' : 'sponsor-cta'}
    {...(isExternal(link.href) ? { target: '_blank', rel: 'noreferrer' } : {})}>
    {link.label} <span aria-hidden="true">{isExternal(link.href) ? '↗' : '→'}</span>
  </a>
}

export default function SponsorShowcase() {
  const [active, setActive] = useState(0)
  const [shot, setShot] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const base = useId()
  const s = SPONSORS[active]
  const current = s.shots[shot]

  const pick = (i: number) => { setActive(i); setShot(0); tabs.current[i]?.focus() }
  const onKey = (e: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key]
    if (step) { e.preventDefault(); pick((active + step + SPONSORS.length) % SPONSORS.length) }
  }
  const open = (i: number) => { setShot(i); dialog.current?.showModal() }
  const turn = (step: number) => setShot((shot + step + s.shots.length) % s.shots.length)

  return (
    <div className="sponsor-showcase" data-sponsor={s.id}>
      <div role="tablist" aria-label="Sponsors" className="sponsor-tabs" onKeyDown={onKey}>
        {SPONSORS.map((sp, i) => (
          <button key={sp.id} ref={el => { tabs.current[i] = el }} role="tab" type="button" id={`${base}-tab-${sp.id}`}
            aria-selected={i === active} aria-controls={`${base}-panel`} tabIndex={i === active ? 0 : -1}
            className="sponsor-tab" data-sponsor={sp.id} onClick={() => pick(i)}>
            <span className="sponsor-mark" aria-hidden="true">{sp.mark}</span>{sp.name}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${s.id}`} className="sponsor-panel">
        <figure className="sponsor-figure">
          <div className="sponsor-window">
            <div className="sponsor-window-bar"><span aria-hidden="true"><i /><i /><i /></span><span>{s.source}</span><span>{shot + 1} / {s.shots.length}</span></div>
            <button type="button" className="sponsor-shot" onClick={() => open(shot)} aria-label={`Enlarge screenshot: ${current.caption}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={current.src} src={current.src} alt={current.caption} />
              <span className="home-proof-zoom" aria-hidden="true">↗</span>
            </button>
          </div>
          <figcaption>{current.caption}</figcaption>
          {s.shots.length > 1 && <div className="sponsor-thumbs">{s.shots.map((sh, i) => (
            <button key={sh.src} type="button" aria-label={`Show screenshot ${i + 1}`} aria-current={i === shot} onClick={() => setShot(i)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sh.src} alt="" loading="lazy" />
            </button>
          ))}</div>}
        </figure>

        <div className="sponsor-copy">
          <p className="sponsor-role"><span className="sponsor-mark" aria-hidden="true">{s.mark}</span>{s.name} · {s.role}</p>
          <h3>{s.headline}</h3>
          <dl className="sponsor-stats">{s.stats.map(([value, label]) => <div key={value}><dt>{value}</dt><dd>{label}</dd></div>)}</dl>
          <div className="sponsor-ctas">
            <Cta link={s.cta} primary />
            {s.more && <Cta link={s.more} />}
            {s.shots.length > 1 && <button type="button" className="sponsor-cta" onClick={() => open(0)}>All {s.shots.length} screenshots</button>}
          </div>
          {s.note && <p className="sponsor-note">{s.note}</p>}
        </div>
      </div>

      <dialog ref={dialog} className="home-lightbox" aria-label={`${s.name} screenshots`} onClick={e => { if (e.target === e.currentTarget) dialog.current?.close() }}>
        <div className="home-lightbox-inner">
          <div className="flex items-center justify-between gap-4 p-4 sm:px-6">
            <div><p className="text-xs text-slate-400">{s.name} · {shot + 1} / {s.shots.length}</p><p className="mt-1 text-sm font-semibold">{s.source}</p></div>
            <button type="button" autoFocus onClick={() => dialog.current?.close()} className="home-lightbox-control" aria-label="Close screenshot">✕</button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.src} alt={current.caption} className="home-lightbox-image" />
          <div className="flex items-center justify-between gap-4 p-4 sm:px-6">
            <p className="max-w-3xl text-sm leading-6 text-slate-300">{current.caption}</p>
            {s.shots.length > 1 && <div className="flex shrink-0 gap-2">
              <button type="button" className="home-lightbox-control" aria-label="Previous screenshot" onClick={() => turn(-1)}>←</button>
              <button type="button" className="home-lightbox-control" aria-label="Next screenshot" onClick={() => turn(1)}>→</button>
            </div>}
          </div>
        </div>
      </dialog>
    </div>
  )
}
