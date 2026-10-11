'use client'
import { useState } from 'react'
export default function ExposureCalculator() {
  const [cases,setCases]=useState(1000)
  const [days,setDays]=useState(1)
  return <div className="home-exposure">
    <div><p className="home-eyebrow text-amber-700">What delay can cost</p><h3>Small backlogs.<br/>Real money.</h3><p>See how compensation adds up when eligible cases remain unresolved beyond their deadline.</p><span>Illustration only · not a forecast of your bank’s liability</span></div>
    <div className="home-exposure-controls"><label htmlFor="overdue-cases">Overdue transactions <strong>{cases.toLocaleString('en-IN')}</strong></label><input id="overdue-cases" type="range" min="100" max="10000" step="100" value={cases} onChange={e=>setCases(Number(e.target.value))}/><label htmlFor="overdue-days">Days beyond the deadline <strong>{days}</strong></label><input id="overdue-days" type="range" min="1" max="10" value={days} onChange={e=>setDays(Number(e.target.value))}/><div className="home-exposure-total" aria-live="polite"><span>Illustrative compensation</span><strong>₹{(cases*days*100).toLocaleString('en-IN')}</strong><small>{cases.toLocaleString('en-IN')} cases × {days} {days===1?'day':'days'} × ₹100</small></div></div>
  </div>
}
