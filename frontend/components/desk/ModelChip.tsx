'use client'

type Usage = { input_tokens: number; output_tokens: number; llm_calls: number }

export default function ModelChip({ model, usage, dark }: { model: string | null; usage?: Usage; dark?: boolean }) {
  if (!model) {
    return (
      <span title="No LLM credentials configured: this agent is running its deterministic rules fallback"
        className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Rules mode · no LLM
      </span>
    )
  }
  const short = model.replace(/^(us|eu|apac|global)\./, '').replace(/^anthropic\./, '').replace(/-v\d+:\d+$/, '')
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span title={model} className={`inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
        dark ? 'bg-emerald-400/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'}`}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
        <span className="truncate">{short}</span>
      </span>
      {usage && (
        <span className="shrink-0 font-mono text-[10px] text-slate-500">
          {(usage.input_tokens + usage.output_tokens).toLocaleString()} tok · {usage.llm_calls} call{usage.llm_calls === 1 ? '' : 's'}
        </span>
      )}
    </span>
  )
}
