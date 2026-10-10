'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, rs, type DeskCase, type Message } from '@/lib/run'
import { Icon } from '@/components/meta'
import Tour, { TOUR_SEEN, TOUR_STAGE, tourStore, type TourStep } from '@/components/tour/Tour'

type Person = { id: string; name: string; vpa: string }
type Txn = {
  utr: string
  amount_paise: number
  name: string
  vpa: string
  at: string
  direction: 'IN' | 'OUT'
  app_status: string
  refund?: boolean
}
type Home = {
  customer: { name: string; vpa: string; balance_paise: number }
  transactions: Txn[]
  cases: DeskCase[]
}
const LABEL: Record<string, string> = {
  QUEUED: 'Received',
  WORKING: 'Investigating',
  NEEDS_YOU: 'Under review',
  NEEDS_INFO: 'We need a detail',
  RESOLVED: 'Outcome available',
  ESCALATED: 'Specialist review',
  FAILED: 'Investigation delayed',
}
const ISSUES = [
  'Money deducted, recipient hasn’t received it',
  'Merchant says the payment failed',
  'I don’t recognise this payment',
]
const SCENARIOS = [
  {
    customer: 'sunita',
    label: 'Suspected fraud',
    text: 'Someone claiming to be from the bank said my KYC would expire and asked me to approve a collect request. ₹49,999 went to kyc.update.help@kaveri. I now think it was a scam. Please trace the money, check the recipient and help recover what you can. Tell me what needs approval and what happens next.',
  },
  {
    customer: 'ananya',
    label: 'Paid twice at a shop',
    text: 'I paid ₹2,340 at Annapurna Supermart. The first payment stayed pending, so the cashier asked me to pay again a few minutes later. The second payment succeeded, but both amounts left my account. Please check which payment settled against the order and get the extra debit back.',
  },
  {
    customer: 'neha',
    label: 'Bank not responding',
    text: 'I sent ₹3,500 to Priya and the payment is still pending. My account was debited, but she has not received it. Please check both banks, find out where the money is stuck, and tell me how this will be resolved if the other bank cannot confirm the payment.',
  },
]
export default function CustomerApp() {
  const router = useRouter()

  const [people, setPeople] = useState<Person[]>([]),
    [me, setMe] = useState(''),
    [home, setHome] = useState<Home | null>(null),
    [thread, setThread] = useState<Message[]>([])
  const [selected, setSelected] = useState<string | null>(null),
    [txn, setTxn] = useState<Txn | null>(null),
    [tab, setTab] = useState<'payments' | 'help'>('payments'),
    [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [touring, setTouring] = useState(false)
  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).has('tour')
    if (asked || !tourStore(TOUR_SEEN)) {
      tourStore(TOUR_SEEN, '1')
      setTouring(true)
    }
  }, [])
  const dialog = useRef<HTMLElement>(null)
  const workspace = useRef<HTMLElement>(null)
  useEffect(() => {
    if (tab === 'help' && window.innerWidth < 1024)
      workspace.current?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
        block: 'start',
      })
  }, [tab, selected])
  useEffect(() => {
    if (!txn) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTxn(null)
      if (event.key !== 'Tab') return
      const items = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), textarea, a[href]',
        ) ?? [],
      )
      const first = items[0],
        last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', handler)
      previous?.focus()
    }
  }, [txn])

  useEffect(() => {
    api<Person[]>('/api/app/customers')
      .then((ps) => {
        setPeople(ps)
        const q = new URLSearchParams(window.location.search)
        const id = q.get('c') || localStorage.getItem('disputepro-customer')
        setMe(ps.some((p) => p.id === id) ? id! : (ps[0]?.id ?? ''))
        setSelected(q.get('case'))
        if (q.get('case')) setTab('help')
      })
      .catch(() =>
        setErr(
          'Unable to connect to the sandbox bank. Please refresh to retry.',
        ),
      )
  }, [])
  const refresh = useCallback(async () => {
    if (!me) return
    try {
      const [h, t] = await Promise.all([
        api<Home>(`/api/app/${me}`),
        api<Message[]>(`/channels/thread/${me}`),
      ])
      setHome(h)
      setThread(t)
      setReady(true)
      setErr(null)
    } catch {
      setErr('Connection interrupted. Your last received information is shown.')
    }
  }, [me])
  useEffect(() => {
    setHome(null)
    setThread([])
    setReady(false)
    if (me) localStorage.setItem('disputepro-customer', me)
    refresh()
    const t = setInterval(refresh, 2500)
    return () => clearInterval(t)
  }, [refresh, me])
  const kase = home?.cases.find((c) => c.id === selected)
  const messages = thread.filter((m) => m.case_id === selected)
  async function submit(requestReview = false) {
    if (!text.trim() || busy) return
    // A new complaint (or the answer the agents asked for) goes straight to the bank desk to watch the agents.
    const toDesk = !requestReview && (!!txn || !selected || kase?.status === 'NEEDS_INFO')
    setBusy(true)
    setErr(null)
    try {
      const c = await api<DeskCase>(
        txn ? '/channels/udir' : '/channels/chat',
        txn
          ? { customer_id: me, utr: txn.utr, text }
          : {
              customer_id: me,
              text,
              case_id: selected,
              request_review: requestReview,
            },
      )
      if (toDesk) {
        if (touring) tourStore(TOUR_STAGE, 'console')
        router.push(`/console?case=${c.id}`)
        return
      }
      setSelected(c.id)
      setTxn(null)
      setText('')
      setTab('help')
      await refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  function chooseCase(c: DeskCase) {
    setSelected(c.id)
    setTab('help')
    setTxn(null)
    setText('')
  }
  const tourSteps: TourStep[] = [
    {
      title: 'Welcome to DisputePro',
      body: (
        <>
          You’re a <b>Sahyadri Bank</b> customer and a UPI payment has gone wrong. Raise a complaint here, then watch a
          squad of AI agents resolve it on the bank’s side, live.
        </>
      ),
    },
    {
      target: 'workspace',
      title: 'This is your account',
      body: 'A real week of UPI payments in the sandbox bank. Tap a stuck payment to complain about it, or describe the problem in your own words.',
      onEnter: () => {
        setTxn(null)
        setTab('payments')
      },
    },
    {
      target: 'help',
      title: 'Tell the bank what went wrong',
      body: (
        <>
          Tap a story or type in any language, Hindi, Hinglish or English. No transaction ID needed. Then press{' '}
          <b>Send</b>: you’ll go straight to the bank’s desk to watch the agents work.
        </>
      ),
      action: 'Pick a story, then press Send',
      onEnter: () => {
        setTxn(null)
        setSelected(null)
        setTab('help')
      },
    },
  ]
  return (
    <div className="min-h-screen bg-[#f5f7fb] text-[#17243b]">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="rounded-lg bg-[#17243b] p-2 text-white">
              <Icon name="orchestrator" />
            </span>
            DisputePro
          </Link>
          <span className="text-xs text-slate-400">Customer experience</span>
          <span className="ml-auto rounded border px-2 py-1 text-[10px] uppercase tracking-widest text-slate-400">
            Sandbox · fictional bank
          </span>
          <button onClick={() => setTouring(true)} className="text-xs font-medium text-blue-600 hover:text-blue-800">
            Take the tour
          </button>
          <details className="relative">
            <summary className="cursor-pointer text-xs text-slate-500">
              Demo controls
            </summary>
            <div className="absolute right-0 z-30 mt-3 w-64 rounded-xl border bg-white p-4 shadow-xl">
              <label
                htmlFor="sandbox-account"
                className="text-xs text-slate-500"
              >
                Switch sandbox session
              </label>
              <select
                id="sandbox-account"
                value={me}
                onChange={(e) => {
                  setMe(e.target.value)
                  setSelected(null)
                  setTxn(null)
                  setText('')
                  setTab('payments')
                }}
                className="mt-2 w-full rounded border p-2 text-sm"
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[11px] text-slate-400">
                This control belongs to the sandbox, not the customer complaint
                flow.
              </p>
            </div>
          </details>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:px-6 lg:grid-cols-[330px_minmax(0,1fr)] lg:py-12">
        <aside>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-blue-600">
            Sahyadri Bank
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Your money.
            <br />A clear answer.
          </h1>
          <p className="mt-4 text-sm leading-7 text-slate-500">
            Get help with a payment. Track what the bank finds and see the proof
            when it’s resolved.
          </p>
          <div data-tour="balance" className="mt-7 rounded-2xl bg-[#17243b] p-6 text-white">
            <p className="text-xs text-white/50">
              {home?.customer.name || 'Opening your sandbox session…'}
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">
              {rs(home?.customer.balance_paise)}
            </p>
            <p className="mt-2 text-[11px] text-white/40">
              Available balance · {home?.customer.vpa}
            </p>
          </div>
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Your cases</h2>
              <button
                className="text-xs text-blue-600"
                onClick={() => {
                  setSelected(null)
                  setTxn(null)
                  setText('')
                  setTab('help')
                }}
              >
                New question +
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {home?.cases.length === 0 && (
                <p className="text-xs leading-6 text-slate-400">
                  No open questions. Select a payment whenever you need help.
                </p>
              )}
              {home?.cases.map((c) => (
                <button
                  key={c.id}
                  onClick={() => chooseCase(c)}
                  className={`w-full rounded-xl border p-4 text-left transition ${selected === c.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-200'}`}
                >
                  <div className="flex justify-between text-xs">
                    <b>{c.id}</b>
                    <span
                      className={
                        c.status === 'RESOLVED'
                          ? 'text-emerald-700'
                          : 'text-blue-600'
                      }
                    >
                      {LABEL[c.status]}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                    {c.headline || c.message}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </aside>
        <section
          data-tour="workspace"
          ref={workspace}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="flex border-b px-5">
            {(['payments', 'help'] as const).map((t) => (
              <button
                key={t}
                className={`border-b-2 px-4 py-4 text-sm font-medium ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'}`}
                onClick={() => setTab(t)}
              >
                {t === 'payments' ? 'Payments' : 'Help & updates'}
              </button>
            ))}
          </div>
          {err && (
            <div
              role="alert"
              className="flex items-center gap-3 bg-amber-50 p-4 text-xs text-amber-900"
            >
              {err}
              <button className="underline" onClick={refresh}>
                Retry
              </button>
            </div>
          )}
          {!ready ? (
            <div className="p-10 text-sm text-slate-400">
              Loading your account…
            </div>
          ) : tab === 'payments' ? (
            <div className="p-5">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Recent activity
              </h2>
              <div className="divide-y">
                {home?.transactions.map((t, i) => (
                  <button
                    key={`${t.utr}-${t.at}-${i}`}
                    disabled={t.direction !== 'OUT' || t.refund}
                    onClick={() => {
                      const c = home?.cases.find((c) => c.utr === t.utr)
                      if (c) chooseCase(c)
                      else {
                        setTxn(t)
                        setText('')
                        setSelected(null)
                      }
                    }}
                    className="group flex w-full items-center gap-3 py-4 text-left disabled:cursor-default"
                  >
                    <span
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${t.direction === 'IN' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                    >
                      <Icon name={t.direction === 'IN' ? 'check' : 'arrow'} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium group-enabled:group-hover:text-blue-600">
                        {t.name}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(t.at).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>
                    <span className="text-right">
                      <b className="text-sm">
                        {t.direction === 'IN' ? '+' : '−'}
                        {rs(t.amount_paise)}
                      </b>
                      <span
                        className={`block text-[11px] ${t.app_status === 'Pending' ? 'text-amber-600' : 'text-slate-400'}`}
                      >
                        {t.app_status}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div data-tour="help" className="flex min-h-[540px] flex-col">
              <div className="border-b p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-semibold">
                    {kase ? `Case ${kase.id}` : 'How can we help?'}
                  </h2>
                  {kase && (
                    <Link
                      href={`/console?case=${kase.id}`}
                      className="text-xs font-medium text-blue-600"
                    >
                      Follow this case at the bank ↗
                    </Link>
                  )}
                </div>
                <p className="mt-2 text-xs leading-6 text-slate-500">
                  {kase
                    ? `${LABEL[kase.status]} · ${kase.utr ? `Payment ${kase.utr}` : 'Identifying your payment'}`
                    : 'Tell us what happened in your own words and language. We’ll find the payment or ask for a detail.'}
                </p>
                {kase && (
                  <div
                    className="mt-4 flex gap-1"
                    aria-label={`Case status: ${LABEL[kase.status]}`}
                  >
                    {['Received', 'Investigating', 'Outcome'].map((s, i) => (
                      <span
                        key={s}
                        className={`flex-1 border-t-2 pt-2 text-[10px] ${i === 0 || (i === 1 && kase.status !== 'QUEUED') || (i === 2 && kase.status === 'RESOLVED') ? 'border-blue-500 text-blue-600' : 'border-slate-200 text-slate-400'}`}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-4 p-5">
                {!selected && (
                  <div className="rounded-xl bg-blue-50 p-4 text-sm leading-7 text-blue-900">
                    You don’t need a transaction reference. Start with who you
                    paid, the amount, and what went wrong.
                    <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-blue-500">
                      Try a sandbox story
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {SCENARIOS.filter((s) =>
                        people.some((p) => p.id === s.customer),
                      ).map((s) => (
                        <button
                          key={s.customer}
                          type="button"
                          className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs hover:border-blue-400"
                          onClick={() => {
                            setMe(s.customer)
                            setSelected(null)
                            setText(s.text)
                          }}
                        >
                          {s.label} ↗
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`step-in max-w-[92%] rounded-2xl p-4 text-sm leading-7 ${m.sender === 'customer' ? 'ml-auto bg-[#edf2ff]' : 'bg-slate-50'}`}
                  >
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {m.sender === 'customer' ? 'You' : 'Sahyadri Bank'}
                    </p>
                    {m.text}
                    <time className="mt-2 block text-[10px] text-slate-400">
                      {new Date(m.created_at).toLocaleTimeString('en-IN', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                ))}
                {kase &&
                  ['QUEUED', 'WORKING', 'NEEDS_YOU'].includes(kase.status) && (
                    <p role="status" className="text-xs text-blue-600">
                      ●{' '}
                      {kase.status === 'NEEDS_YOU'
                        ? 'A reviewer is checking the proposed actions.'
                        : kase.status === 'QUEUED'
                          ? 'Your case is queued. You can return here for updates.'
                          : 'We’re checking bank records. You can leave this page and return.'}
                    </p>
                  )}
                {kase?.outcome?.actions?.some((a) => a.state === 'done') && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <h3 className="text-xs font-semibold text-emerald-800">
                      Confirmed actions
                    </h3>
                    {kase.outcome.actions
                      .filter((a) => a.state === 'done')
                      .map((a, i) => (
                        <div key={i} className="mt-3 text-xs text-emerald-900">
                          {a.type.replace(/_/g, ' ').toLowerCase()} ·{' '}
                          {rs(a.frozen_paise ?? a.amount_paise)}
                          <span className="mt-1 block font-mono text-[10px]">
                            {a.ref}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  submit()
                }}
                className="border-t p-4"
              >
                <label
                  htmlFor="customer-message"
                  className="mb-2 block text-xs font-medium"
                >
                  {kase?.status === 'NEEDS_INFO'
                    ? 'Reply to the bank’s question'
                    : selected
                      ? 'Add a message to this case'
                      : 'Describe your payment issue'}
                </label>
                <div className="flex gap-2">
                  <textarea
                    id="customer-message"
                    rows={2}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    maxLength={5000}
                    placeholder="Write in your preferred language…"
                    className="min-w-0 flex-1 resize-none rounded-xl border bg-slate-50 p-3 text-sm"
                  />
                  <button
                    className="desk-button desk-primary"
                    disabled={busy || !text.trim()}
                  >
                    {busy ? 'Sending…' : 'Send →'}
                  </button>
                </div>
                {kase &&
                  ['RESOLVED', 'FAILED', 'ESCALATED'].includes(kase.status) && (
                    <button
                      type="button"
                      disabled={busy || !text.trim()}
                      onClick={() => submit(true)}
                      className="mt-3 text-xs font-medium text-blue-600 disabled:opacity-40"
                    >
                      Ask a specialist to review this case (add your reason
                      above)
                    </button>
                  )}
                {selected && kase?.status !== 'NEEDS_INFO' && (
                  <p className="mt-2 text-[10px] text-slate-400">
                    Your message is saved on this case. Start a new question for
                    a different payment.
                  </p>
                )}
              </form>
            </div>
          )}
        </section>
      </main>
      <Tour open={touring} total={8} onClose={() => setTouring(false)} steps={tourSteps} />
      {txn && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-[#111d32]/40 p-0 backdrop-blur-sm sm:items-center sm:p-5"
          onClick={() => setTxn(null)}
        >
          <section
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-label="Get help with this payment"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setTxn(null)
            }}
            onClick={(e) => e.stopPropagation()}
            className="step-in max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-400">Payment to {txn.name}</p>
                <h2 className="mt-2 text-3xl font-semibold">
                  {rs(txn.amount_paise)}
                </h2>
              </div>
              <button
                aria-label="Close payment help"
                className="desk-button"
                onClick={() => setTxn(null)}
              >
                ✕
              </button>
            </div>
            <p className="mt-3 break-all font-mono text-[10px] text-slate-400">
              {txn.utr} · {txn.app_status}
            </p>
            <h3 className="mt-6 text-sm font-semibold">What happened?</h3>
            <div className="mt-3 grid gap-2">
              {ISSUES.map((s) => (
                <button
                  key={s}
                  className={`rounded-lg border px-3 py-3 text-left text-xs transition ${text === s ? 'border-blue-400 bg-blue-50 text-blue-700' : 'hover:bg-slate-50'}`}
                  onClick={() => setText(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <label
              htmlFor="payment-issue"
              className="mt-4 block text-xs text-slate-500"
            >
              Or describe it in your own words
            </label>
            <textarea
              autoFocus
              id="payment-issue"
              value={text}
              maxLength={5000}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              className="mt-2 w-full rounded-xl border p-3 text-sm"
            />
            <button
              onClick={() => submit()}
              disabled={busy || !text.trim()}
              className="desk-button desk-primary mt-4 w-full"
            >
              {busy ? 'Sending…' : 'Send to the bank →'}
            </button>
            {err && (
              <p role="alert" className="mt-3 text-xs text-rose-700">
                {err}
              </p>
            )}
            <p className="mt-3 text-center text-[10px] text-slate-400">
              Payment details are attached automatically.
            </p>
          </section>
        </div>
      )}
    </div>
  )
}
