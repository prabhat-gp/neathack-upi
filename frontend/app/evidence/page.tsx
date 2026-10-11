import Link from 'next/link'
import forecast from '../../public/proof/data/cfo-verified-forecast.json'
import research from '../../public/proof/data/crustdata-research.json'

export default function Evidence() {
  return <main className="min-h-screen bg-[#f6f7f9] px-5 py-10 text-slate-900 sm:px-10">
    <div className="mx-auto max-w-6xl">
      <Link href="/#sponsors" className="text-sm font-medium text-blue-600">← DisputePro · sponsor evidence</Link>
      <section id="crustdata" className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-4"><p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-600">Live integration result · Crustdata</p><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">API call verified</span></div>
        <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Research that changes the plan.</h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600">DisputePro queried three bank domains through Crustdata. The results inform the cfo.ai business plan and preserve ambiguous matches for review.</p>
        <div className="mt-7 flex flex-wrap gap-x-8 gap-y-2 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500"><span>Company Identify · exact domain lookup</span><span>Captured {research.captured_at.replace('T',' ').slice(0,19)} UTC</span><span>Source: api.crustdata.com</span></div>
        <div className="mt-7 grid gap-5 md:grid-cols-3">{research.companies.map((company,index)=><article key={company.domain} className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="font-mono text-xs text-blue-600">{company.domain}</p><h2 className="mt-4 text-xl font-semibold">{['Bank identified','Multiple candidates','Parent bank unverified'][index]}</h2>
          <div className="mt-5 space-y-5">{company.candidates.map(candidate=><div key={candidate.company_id} className="border-t border-slate-100 pt-4"><h3 className="text-sm font-semibold">{candidate.name}</h3><p className="mt-2 break-all text-xs leading-6 text-slate-500">{candidate.primary_domain}<br />Company ID {candidate.company_id} · confidence {candidate.confidence_score}<br />Employee range: {candidate.employee_count_range || 'not returned'}</p></div>)}</div>
          <p className="mt-6 rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600">{['Use as an enterprise research candidate. Company size supports planning for a formal pilot and procurement process.','Two records matched. Review the bank and people-page candidates before using the record for sizing.','The returned entity is an ATM listing. Excluded from bank-level sizing until its parent is verified.'][index]}</p>
        </article>)}</div>
        <div className="mt-6 rounded-2xl bg-blue-50 p-6"><h2 className="font-semibold text-blue-950">Decision carried into cfo.ai</h2><p className="mt-2 text-sm leading-7 text-slate-600">Model a limited paid bank pilot with a multi-month sales cycle. Keep sales timing and case volume as assumptions. These companies are research candidates, not customers; a missing or ambiguous match is not a fraud signal.</p></div>
        <div className="mt-6 flex flex-wrap gap-5 text-sm font-medium text-blue-600"><a href="/proof/data/crustdata-research.json" target="_blank" rel="noreferrer">Inspect the saved API result ↗</a><a href="https://app.cfo.ai/upi-dispute-1a09ce1c" target="_blank" rel="noreferrer">Open cfo.ai workspace ↗</a></div>
        <p className="mt-8 text-xs text-slate-500">This is DisputePro’s rendering of the captured Crustdata response, not a screenshot of the Crustdata portal.</p>
      </section>

      <section id="cfo" className="mt-16 border-t border-slate-200 pt-12">
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-600">cfo.ai · saved and recalculated</p>
        <h2 className="mt-4 font-display text-4xl font-semibold tracking-tight">A business plan you can inspect.</h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">Twelve monthly periods, editable assumptions and three scenarios in the upi-dispute workspace. These are planning outputs, not actual revenue. The model includes a one-month collection delay and keeps negative cash visible.</p>
        <div className="mt-6 grid gap-5 md:grid-cols-3">{Object.entries(forecast).map(([name, result]) => {
          const cash = result.rows.find(row => row.display_name === 'Ending cash INR')!.values
          const revenue = result.rows.find(row => row.display_name === 'Total revenue INR')!.values
          const banks = result.rows.find(row => row.display_name === 'Active banks')!.values
          const firstGap = cash.findIndex(value => value !== null && value < 0)
          return <article key={name} className="rounded-2xl border border-slate-200 bg-white p-6"><h3 className="text-lg font-semibold">{name}</h3><dl className="mt-5 space-y-4 text-sm"><div><dt className="text-slate-500">12-month revenue</dt><dd className="mt-1 text-xl font-semibold">₹{((revenue.reduce<number>((sum, value) => sum + (value || 0), 0)) / 100000).toFixed(2)} lakh</dd></div><div><dt className="text-slate-500">Banks at September 2027</dt><dd className="mt-1 font-semibold">{banks[banks.length - 1]}</dd></div><div><dt className="text-slate-500">Cash first turns negative</dt><dd className="mt-1 font-semibold text-amber-800">{firstGap < 0 ? 'Outside this horizon' : result.periods[firstGap]}</dd></div><div><dt className="text-slate-500">September funding gap</dt><dd className="mt-1 font-semibold">₹{(Math.max(0, -(cash[cash.length - 1] || 0)) / 100000).toFixed(2)} lakh</dd></div></dl><a href={result.table.url} target="_blank" rel="noreferrer" className="mt-6 inline-block text-sm font-medium text-blue-600">Inspect in cfo.ai ↗</a></article>
        })}</div>
        <p className="mt-6 rounded-xl bg-blue-50 p-5 text-sm leading-7 text-slate-600">Decision: validate a paid pilot and reduce fixed burn before scaling the team. Even the upside assumptions require additional funding within the modeled year. The starting ₹50 lakh is an assumption, not an observed bank balance.</p>
        <a href="/proof/data/cfo-verified-forecast.json" target="_blank" rel="noreferrer" className="mt-5 inline-block text-sm font-medium text-blue-600">Inspect cfo.ai readback and formulas ↗</a>
      </section>
    </div>
  </main>
}
