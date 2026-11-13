import { useMemo, useState, type ReactNode } from 'react'
import { ArrowUpRight, Check, Clock, Download, Pause, Plus, Repeat, ShieldX, Slash, X } from 'lucide-react'
import type { Address } from 'viem'
import { useBlockTimes, type DerivedEvents, type LeashEvent } from '@/hooks/useLeashEvents'
import { buildCsv, downloadCsv } from '@/lib/csv'
import { usePayeeLabel } from '@/lib/payeeNames'
import { txUrl, usd } from '@/lib/chain'
import { Card, Chip } from './ui'

const PAYMENT_KINDS = new Set(['Paid', 'Queued', 'Rejected', 'Revoked', 'ScheduleExecuted'])
const MONEY_KINDS = new Set(['Paid', 'Queued', 'Approved', 'Funded', 'Withdrawn', 'ScheduleExecuted', 'Revoked'])

function Who({ address }: { address: Address }) {
  return <>{usePayeeLabel(address)}</>
}

interface Described {
  icon: ReactNode
  title: ReactNode
  reason?: string
  tag?: string
}

function describe(ev: LeashEvent, derived: DerivedEvents): Described {
  const a = ev.args
  const muted = 'h-4 w-4 text-muted'
  switch (ev.kind) {
    case 'Paid': {
      return {
        icon: <Check className="h-4 w-4 text-ok" />,
        title: <>Paid {usd(a.amount as bigint)} USDC to <Who address={a.payee as Address} /></>,
        reason: a.reason as string,
        tag: Number(a.requestId) > 0 ? 'approved by owner' : undefined,
      }
    }
    case 'ScheduleExecuted':
      return {
        icon: <Repeat className="h-4 w-4 text-ok" />,
        title: <>Recurring payment: {usd(a.amount as bigint)} USDC to <Who address={a.payee as Address} /></>,
        tag: `run ${Number(a.runs)}`,
      }
    case 'Queued': {
      const req = derived.requests.find((r) => r.requestId === Number(a.requestId))
      return {
        icon: <Clock className="h-4 w-4 text-accent" />,
        title: <>Asked to pay {usd(a.amount as bigint)} USDC to <Who address={a.payee as Address} /></>,
        reason: a.reason as string,
        tag: req ? (req.status === 'pending' ? 'waiting for approval' : req.status) : undefined,
      }
    }
    case 'Rejected':
      return { icon: <X className="h-4 w-4 text-danger" />, title: `Owner rejected request #${Number(a.requestId)}` }
    case 'Revoked':
      return { icon: <Slash className="h-4 w-4 text-danger" />, title: `Leash revoked. ${usd(a.refunded as bigint)} USDC refunded` }
    case 'Funded':
      return { icon: <Plus className={muted} />, title: `Funded with ${usd(a.amount as bigint)} USDC` }
    case 'Withdrawn':
      return { icon: <ArrowUpRight className={muted} />, title: `Owner withdrew ${usd(a.amount as bigint)} USDC` }
    case 'PayeeAdded':
      return { icon: <Plus className={muted} />, title: <>Payee added: <Who address={a.payee as Address} /></> }
    case 'PayeeRemoved':
      return { icon: <ShieldX className={muted} />, title: <>Payee removed: <Who address={a.payee as Address} /></> }
    case 'PayeeLimitsSet':
      return { icon: <Plus className={muted} />, title: <>Payee limits changed for <Who address={a.payee as Address} /></> }
    case 'LimitsUpdated':
      return { icon: <Plus className={muted} />, title: `Limits changed: ${usd(a.dailyCap as bigint)} per day, ${usd(a.perPaymentLimit as bigint)} per payment` }
    case 'AutoApproveLimitSet':
      return { icon: <Plus className={muted} />, title: (a.amount as bigint) > 0n ? `Auto-approve set to ${usd(a.amount as bigint)} USDC` : 'Auto-approve turned off' }
    case 'PausedSet':
      return { icon: <Pause className={muted} />, title: a.paused ? 'Agent paused' : 'Agent resumed' }
    case 'ScheduleCreated':
      return {
        icon: <Repeat className={muted} />,
        title: <>Recurring payment set up: {usd(a.amount as bigint)} USDC to <Who address={a.payee as Address} /></>,
      }
    case 'ScheduleCancelled':
      return { icon: <Repeat className={muted} />, title: `Recurring payment #${Number(a.scheduleId)} cancelled` }
    case 'LeashCreated':
      return { icon: <Plus className={muted} />, title: 'Leash created' }
    default:
      return { icon: <Plus className={muted} />, title: ev.kind }
  }
}

export function Feed({ derived, leashId }: { derived: DerivedEvents | undefined; leashId: bigint }) {
  const [all, setAll] = useState(false)
  const items = useMemo(() => {
    const list = (derived?.events ?? []).filter((e) => all || PAYMENT_KINDS.has(e.kind))
    return list.slice().reverse().slice(0, 40)
  }, [derived, all])
  const shownBlocks = useMemo(() => [...new Set(items.map((i) => i.blockNumber))], [items])
  const { data: times } = useBlockTimes(shownBlocks)

  const moneyBlocks = useMemo(
    () => [...new Set((derived?.events ?? []).filter((e) => MONEY_KINDS.has(e.kind)).slice(-200).map((e) => e.blockNumber))],
    [derived],
  )
  const { data: csvTimes } = useBlockTimes(moneyBlocks)

  const exportCsv = () => {
    if (!derived) return
    downloadCsv(`leash-${leashId.toString()}-payments.csv`, buildCsv(derived.events, csvTimes))
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="display text-lg font-semibold">Payment feed</h3>
        <div className="flex gap-2">
          <Chip active={!all} onClick={() => setAll(false)}>Payments</Chip>
          <Chip active={all} onClick={() => setAll(true)}>All activity</Chip>
        </div>
      </div>
      {!derived ? (
        <p className="py-6 text-sm text-muted">Reading events from the chain…</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-sm text-muted">No payments yet. Every payment will appear here with the agent's reason.</p>
      ) : (
        <ul className="mt-2 divide-y divide-white/[0.06]">
          {items.map((ev) => {
            const d = describe(ev, derived)
            const ts = times?.get(ev.blockNumber.toString())
            return (
              <li key={`${ev.txHash}-${ev.logIndex}`} className="flex gap-3 py-3">
                <span className="mt-0.5">{d.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-pretty">{d.title}</p>
                  {d.reason && <p className="mt-0.5 text-sm italic text-muted text-pretty">"{d.reason}"</p>}
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                    {ts && <span>{new Date(ts * 1000).toLocaleString()}</span>}
                    {d.tag && <span className="rounded-full bg-accent/15 px-2 py-0.5 font-semibold text-accent">{d.tag}</span>}
                    <a href={txUrl(ev.txHash)} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted">tx</a>
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {derived && derived.events.length > 0 && (
        <button
          onClick={exportCsv}
          className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-white/10 text-sm font-semibold text-muted transition hover:border-white/25 hover:text-ink"
        >
          <Download className="h-4 w-4" /> Export payments as CSV
        </button>
      )}
    </Card>
  )
}
