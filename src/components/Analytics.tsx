import { useMemo } from 'react'
import type { Address } from 'viem'
import { useBlockTimes, type DerivedEvents } from '@/hooks/useLeashEvents'
import { usePayeeLabel } from '@/lib/payeeNames'
import { usd } from '@/lib/chain'
import { Card } from './ui'

const DAY = 86400

function PayeeBar({ address, amount, max }: { address: Address; amount: bigint; max: bigint }) {
  const label = usePayeeLabel(address)
  const pct = max > 0n ? Number((amount * 1000n) / max) / 10 : 0
  return (
    <li>
      <div className="flex justify-between gap-3 text-xs">
        <span className="mono min-w-0 truncate text-muted">{label}</span>
        <span className="tabular-nums">{usd(amount)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
    </li>
  )
}

export function Analytics({ derived }: { derived: DerivedEvents | undefined }) {
  const payments = useMemo(
    () => (derived?.events ?? []).filter((e) => e.kind === 'Paid' || e.kind === 'ScheduleExecuted'),
    [derived],
  )
  const blocks = useMemo(() => [...new Set(payments.slice(-200).map((e) => e.blockNumber))], [payments])
  const { data: times } = useBlockTimes(blocks)

  const stats = useMemo(() => {
    let total = 0n
    const byPayee = new Map<string, bigint>()
    for (const p of payments) {
      const amt = p.args.amount as bigint
      total += amt
      const k = (p.args.payee as string).toLowerCase()
      byPayee.set(k, (byPayee.get(k) ?? 0n) + amt)
    }
    const top = [...byPayee.entries()].sort((a, b) => (a[1] < b[1] ? 1 : -1)).slice(0, 5)
    return { total, top, count: payments.length }
  }, [payments])

  // Last 7 days, bucketed by the block timestamp of each payment.
  const days = useMemo(() => {
    const dayStart = (ts: number) => Math.floor(ts / DAY) * DAY
    const latest = times && times.size > 0 ? Math.max(...times.values()) : undefined
    if (latest === undefined) return undefined
    const end = dayStart(latest)
    const buckets = Array.from({ length: 7 }, (_, i) => ({ start: end - (6 - i) * DAY, total: 0n }))
    for (const p of payments) {
      const ts = times?.get(p.blockNumber.toString())
      if (ts === undefined) continue
      const b = buckets.find((x) => ts >= x.start && ts < x.start + DAY)
      if (b) b.total += p.args.amount as bigint
    }
    return buckets
  }, [payments, times])

  if (!derived || stats.count === 0) return null
  const maxDay = days ? days.reduce((m, d) => (d.total > m ? d.total : m), 0n) : 0n
  const maxPayee = stats.top[0]?.[1] ?? 0n

  return (
    <Card className="space-y-5">
      <h3 className="display text-lg font-semibold">Spending</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          ['Total paid', `${usd(stats.total)}`],
          ['Payments', String(stats.count)],
          ['Average', usd(stats.count > 0 ? stats.total / BigInt(stats.count) : 0n)],
        ].map(([k, v]) => (
          <div key={k} className="glass-inner rounded-2xl p-3">
            <div className="label">{k}</div>
            <div className="display mt-1 text-lg font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      {days && (
        <div>
          <div className="label mb-2">Last 7 days (USDC)</div>
          <div className="flex h-24 items-end gap-1.5" role="img" aria-label="Spending per day for the last 7 days">
            {days.map((d) => {
              const h = maxDay > 0n ? Math.max(d.total > 0n ? 6 : 2, Number((d.total * 100n) / maxDay)) : 2
              return (
                <div key={d.start} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className={d.total > 0n ? 'w-full rounded-md bg-accent' : 'w-full rounded-md bg-white/10'}
                      style={{ height: `${h}%` }}
                      title={`${usd(d.total)} USDC`}
                    />
                  </div>
                  <span className="text-[10px] text-muted">{new Date(d.start * 1000).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div>
        <div className="label mb-2">Top payees</div>
        <ul className="space-y-2.5">
          {stats.top.map(([addr, amt]) => (
            <PayeeBar key={addr} address={addr as Address} amount={amt} max={maxPayee} />
          ))}
        </ul>
      </div>
    </Card>
  )
}
