import Link from 'next/link'

// Two views of the same demo: the customer's side and the bank's side. Keeps the open case when switching.
export default function PortalSwitch({ current, customerHref = '/app', bankHref = '/console', dark = false }: {
  current: 'customer' | 'bank'
  customerHref?: string
  bankHref?: string
  dark?: boolean
}) {
  const items = [
    ['customer', 'Customer portal', customerHref],
    ['bank', 'Bank desk', bankHref],
  ] as const
  return (
    <nav aria-label="Switch view"
      className={`inline-flex rounded-lg p-1 text-xs font-medium ${dark ? 'bg-white/10' : 'bg-slate-100'}`}>
      {items.map(([id, label, href]) => {
        const on = id === current
        return (
          <Link key={id} href={href} aria-current={on ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 transition ${on
              ? dark ? 'bg-white text-[#111d32] shadow-sm' : 'bg-white text-[#17243b] shadow-sm'
              : dark ? 'text-white/65 hover:text-white' : 'text-slate-500 hover:text-slate-800'}`}>
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
