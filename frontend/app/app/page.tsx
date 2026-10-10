'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/meta'
import { api, rs, type DeskCase, type Message } from '@/lib/run'

type Persona = { id: string; name: string; vpa: string; phone: string; has_issue: boolean }
type Txn = { utr: string; amount_paise: number; name: string; vpa: string; at: string; direction: 'IN' | 'OUT'; app_status: string; narration?: string; kind?: string; mode?: string; refund?: boolean }
type Home = { customer: { id: string; name: string; vpa: string; phone: string; balance_paise: number }; transactions: Txn[]; cases: DeskCase[] }

const STATUS_TONE: Record<string, string> = {
  Paid: 'text-slate-400', Received: 'text-emerald-600', Pending: 'text-amber-600', Failed: 'text-rose-600', Refunded: 'text-emerald-600',
}
const CASE_TONE: Record<string, string> = {
  QUEUED: 'bg-slate-100 text-slate-600', WORKING: 'bg-violet-100 text-violet-700', NEEDS_YOU: 'bg-amber-100 text-amber-800',
  NEEDS_INFO: 'bg-amber-100 text-amber-800', RESOLVED: 'bg-emerald-100 text-emerald-700', ESCALATED: 'bg-rose-100 text-rose-700', FAILED: 'bg-rose-100 text-rose-700',
}
const CASE_TEXT: Record<string, string> = {
  QUEUED: 'Received', WORKING: 'Agents investigating', NEEDS_YOU: 'Under review', NEEDS_INFO: 'Bank needs a detail', RESOLVED: 'Resolved',
  ESCALATED: 'With a specialist', FAILED: 'Delayed',
}

function when(at: string) {
  const d = new Date(at)
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  const t = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  return days < 1 && d.getDate() === new Date().getDate() ? `Today, ${t}` : days < 2 ? `Yesterday, ${t}` : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function UpiApp() {
  const [people, setPeople] = useState<Persona[]>([])
  const [me, setMe] = useState<string>('')
  const [home, setHome] = useState<Home | null>(null)
  const [thread, setThread] = useState<Message[]>([])
  const [tab, setTab] = useState<'home' | 'chat'>('home')
  const [open, setOpen] = useState<Txn | null>(null)
  const [text, setText] = useState('')
  const [chat, setChat] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const chatEnd = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api<Persona[]>('/api/app/customers').then((p) => {
      setPeople(p)
      const q = new URLSearchParams(window.location.search).get('c')
      // Default to someone with a stuck payment and a full week of history (the story customers have short histories).
      const story = ['rahul', 'imran', 'ananya', 'vikram', 'sunita', 'neha']
      setMe(q && p.some((x) => x.id === q) ? q : (p.find((x) => x.has_issue && !story.includes(x.id))?.id ?? p[0]?.id ?? ''))
    }).catch(() => setErr('Can’t reach the bank’s servers.'))
  }, [])

  const refresh = useCallback(async () => {
    if (!me) return
    const [h, t] = await Promise.all([api<Home>(`/api/app/${me}`), api<Message[]>(`/channels/thread/${me}`)])
    setHome(h)
    setThread(t)
  }, [me])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 2500)
    return () => clearInterval(id)
  }, [refresh])

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [thread.length, tab])

  const caseFor = (utr: string) => home?.cases.find((c) => c.utr === utr)
  const unread = thread.filter((m) => m.sender === 'bank').length

  async function complain() {
    if (!open || !text.trim()) return
    setBusy(true); setErr(null)
    try {
      await api('/channels/udir', { customer_id: me, utr: open.utr, text })
      setOpen(null); setText(''); setTab('chat'); refresh()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  async function send() {
    if (!chat.trim()) return
    setBusy(true); setErr(null)
    try {
      await api('/channels/chat', { customer_id: me, text: chat })
      setChat(''); refresh()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen bg-night text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_70%_50%_at_80%_10%,rgba(124,58,237,0.22),transparent_60%)]" />
      <header className="relative mx-auto flex max-w-6xl items-center gap-4 px-6 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-night"><Icon name="orchestrator" className="h-4 w-4" /></span>
          <span className="font-display text-[16px] font-semibold tracking-tight">DisputePro</span>
        </Link>
        <span className="text-[13px] text-white/30">/</span>
        <span className="text-[13px] text-white/70">Customer view</span>
        <Link href="/console" target="_blank" className="group ml-auto flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-night transition hover:bg-white/90">
          Watch the bank’s ops desk <Icon name="arrow" className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
        </Link>
      </header>

      <main className="relative mx-auto grid max-w-6xl items-start gap-14 px-6 pb-16 pt-2 lg:grid-cols-[1fr_400px]">
        <section className="lg:pt-16">
          <p className="text-[12.5px] font-medium text-violet-300">Be the customer</p>
          <h1 className="mt-3 font-display text-[44px] font-semibold leading-[1.04] tracking-[-0.04em]">
            Complain like a customer would. <span className="font-serif font-normal italic text-white/50">The agents take it from there.</span>
          </h1>
          <ol className="mt-8 space-y-5 text-[15px] text-white/65">
            {[
              ['Pick who you are', 'Every customer of the sandbox bank has a real week of UPI payments. The ones marked ● have something stuck.'],
              ['Tap a payment, or just chat', '“Raise a complaint” sends it through NPCI’s UDIR with the UTR. In chat, write anything, in any language; the Intake agent finds the payment.'],
              ['Watch it get resolved', 'The case lands on the bank’s ops desk, the agents investigate across core banking, NPCI and the other bank, and the answer comes back here.'],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/15 font-mono text-[12px] text-white/70">{i + 1}</span>
                <span><b className="font-semibold text-white">{t}.</b> {d}</span>
              </li>
            ))}
          </ol>
          <label className="mt-10 block text-[12px] font-medium uppercase tracking-[0.16em] text-white/35">Signed in as</label>
          <select value={me} onChange={(e) => { setMe(e.target.value); setOpen(null); setTab('home') }}
            className="mt-2 w-full max-w-sm rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-[14px] text-white outline-none focus:border-violet-400">
            {people.map((p) => <option key={p.id} value={p.id} className="text-night">{p.has_issue ? '● ' : ''}{p.name} · {p.vpa}</option>)}
          </select>
          {err && <p className="mt-3 text-[13px] text-rose-300">{err}</p>}
        </section>

        {/* The phone */}
        <div className="relative mx-auto w-[380px]">
          <div className="pointer-events-none absolute -inset-8 rounded-[4rem] bg-violet-600/20 blur-3xl" />
          <div className="relative h-[min(680px,calc(100vh-120px))] overflow-hidden rounded-[3rem] border-[10px] border-[#1a1b26] bg-white text-slate-900 shadow-2xl">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between bg-gradient-to-br from-violet-600 to-indigo-700 px-5 pb-5 pt-6 text-white">
                <div>
                  <div className="text-[11px] text-white/70">Sahyadri Bank UPI</div>
                  <div className="font-display text-[17px] font-semibold tracking-tight">{home?.customer.name ?? '…'}</div>
                  <div className="text-[11px] text-white/60">{home?.customer.vpa}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10.5px] text-white/60">Balance</div>
                  <div className="font-display text-[20px] font-semibold tracking-tight">{rs(home?.customer.balance_paise)}</div>
                </div>
              </div>

              {tab === 'home' ? (
                <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-3">
                  {home?.cases.length ? (
                    <div className="mb-3 space-y-1.5">
                      {home.cases.slice(0, 2).map((c) => (
                        <button key={c.id} onClick={() => setTab('chat')} className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-left">
                          <span className="text-[12px] font-medium text-slate-700">Complaint {c.id}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${CASE_TONE[c.status]}`}>{CASE_TEXT[c.status]}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Recent payments</div>
                  <ul className="divide-y divide-slate-100">
                    {home?.transactions.slice(0, 40).map((t) => {
                      const c = caseFor(t.utr)
                      return (
                        <li key={t.utr + t.at}>
                          <button onClick={() => t.direction === 'OUT' && (setOpen(t), setText(''))} className="flex w-full items-center gap-3 py-2.5 text-left">
                            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${t.direction === 'IN' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                              {t.name.slice(0, 1)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-medium">{t.name}</span>
                              <span className="block text-[11px] text-slate-400">{when(t.at)}{c ? <> · <span className="font-medium text-violet-600">{c.id}</span></> : null}</span>
                            </span>
                            <span className="text-right">
                              <span className={`block text-[13.5px] font-semibold ${t.direction === 'IN' ? 'text-emerald-600' : ''}`}>{t.direction === 'IN' ? '+' : '−'}{rs(t.amount_paise)}</span>
                              <span className={`block text-[10.5px] font-medium ${STATUS_TONE[t.app_status] ?? 'text-slate-400'}`}>{t.app_status}</span>
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col bg-[#efeae2]">
                  <div className="no-scrollbar flex-1 space-y-2 overflow-y-auto px-3 py-3">
                    {thread.length === 0 && <p className="mt-10 text-center text-[12.5px] text-slate-500">Write to the bank about any payment, in your own words.</p>}
                    {thread.map((m) => (
                      <div key={m.id} className={`step-in flex ${m.sender === 'customer' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm ${m.sender === 'customer' ? 'rounded-br-sm bg-[#d9fdd3]' : 'rounded-bl-sm bg-white'}`}>
                          {m.sender === 'bank' && <div className="mb-0.5 text-[10.5px] font-semibold text-violet-700">Sahyadri Bank{m.channel === 'SMS' ? ' · SMS' : ''}</div>}
                          {m.text}
                          <div className="mt-0.5 text-right text-[9.5px] text-slate-400">{new Date(m.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</div>
                        </div>
                      </div>
                    ))}
                    {home?.cases.some((c) => c.status === 'WORKING' || c.status === 'QUEUED') && (
                      <div className="flex justify-start">
                        <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-white px-3 py-2.5 shadow-sm">
                          {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-500" style={{ animationDelay: `${i * 0.15}s` }} />)}
                          <span className="ml-1.5 text-[11px] text-slate-500">agents investigating</span>
                        </div>
                      </div>
                    )}
                    <div ref={chatEnd} />
                  </div>
                  <div className="flex items-end gap-2 border-t border-black/5 bg-[#f6f6f6] p-2.5">
                    <textarea value={chat} onChange={(e) => setChat(e.target.value)} rows={1} placeholder="Message (any language)…"
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                      className="max-h-24 flex-1 resize-none rounded-2xl bg-white px-3 py-2 text-[13.5px] outline-none" />
                    <button onClick={send} disabled={busy || !chat.trim()} className="grid h-9 w-9 place-items-center rounded-full bg-violet-600 text-white disabled:opacity-40">
                      <Icon name="arrow" className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              <nav className="grid grid-cols-2 border-t border-slate-100 bg-white text-[11.5px] font-medium">
                {(['home', 'chat'] as const).map((t) => (
                  <button key={t} onClick={() => setTab(t)} className={`relative py-3 ${tab === t ? 'text-violet-700' : 'text-slate-400'}`}>
                    {t === 'home' ? 'Payments' : 'Help chat'}
                    {t === 'chat' && unread > 0 && tab !== 'chat' && <span className="absolute right-[35%] top-2 h-2 w-2 rounded-full bg-rose-500" />}
                  </button>
                ))}
              </nav>
            </div>

            {open && (
              <div className="absolute inset-0 flex items-end bg-black/40" onClick={() => setOpen(null)}>
                <div className="step-in w-full rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
                  <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" />
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-[12px] text-slate-400">Paid to</div>
                      <div className="text-[16px] font-semibold">{open.name}</div>
                      <div className="text-[11.5px] text-slate-400">{open.vpa}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-[22px] font-semibold">{rs(open.amount_paise)}</div>
                      <div className={`text-[11.5px] font-medium ${STATUS_TONE[open.app_status]}`}>{open.app_status}</div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl bg-slate-50 p-3 font-mono text-[11px] text-slate-500">UTR {open.utr} · {when(open.at)}</div>
                  {caseFor(open.utr) ? (
                    <p className="mt-4 text-[13px] text-slate-600">You already raised {caseFor(open.utr)!.id}. Updates arrive in Help chat.</p>
                  ) : (
                    <>
                      <label className="mt-4 block text-[12.5px] font-semibold text-slate-700">Raise a complaint</label>
                      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus
                        placeholder="What went wrong? e.g. ‘Money debited but they didn’t get it’"
                        className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 p-2.5 text-[13.5px] outline-none focus:border-violet-400" />
                      <button onClick={complain} disabled={busy || !text.trim()}
                        className="mt-3 w-full rounded-xl bg-violet-600 py-3 text-[14px] font-semibold text-white transition hover:bg-violet-700 disabled:opacity-40">
                        {busy ? 'Sending…' : 'Send to the bank'}
                      </button>
                      <p className="mt-2 text-center text-[10.5px] text-slate-400">Sent through NPCI UDIR with this payment’s UTR</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
