import { useState } from 'react'
import { isAddress, type Address } from 'viem'
import { Play, Repeat, X } from 'lucide-react'
import { agentLeashAbi } from '@/lib/agentLeashAbi'
import { LEASH_ADDRESS, NETWORK_NAME, fmtDuration, publicClient, tryParseUsdc, usd } from '@/lib/chain'
import { usePayeeLabel } from '@/lib/payeeNames'
import { useSend } from '@/hooks/useSend'
import type { LeashData, ScheduleData } from '@/hooks/useLeash'
import { Button, Card, Chip, Field, Skeleton } from './ui'

const INTERVALS = [
  { label: 'Hourly', seconds: 3600 },
  { label: 'Daily', seconds: 86400 },
  { label: 'Weekly', seconds: 7 * 86400 },
  { label: 'Monthly', seconds: 30 * 86400 },
] as const

const STARTS = [
  { label: 'Now', delay: 0 },
  { label: 'In 1 hour', delay: 3600 },
  { label: 'Tomorrow', delay: 86400 },
] as const

function intervalLabel(sec: bigint): string {
  const s = Number(sec)
  const hit = INTERVALS.find((i) => i.seconds === s)
  return hit ? hit.label.toLowerCase() : `every ${fmtDuration(s)}`
}

function Row({ s, leashId, isOwner, canRun, now, active }: { s: ScheduleData; leashId: bigint; isOwner: boolean; canRun: boolean; now: number; active: boolean }) {
  const { send, busy } = useSend()
  const label = usePayeeLabel(s.payee)
  const due = Number(s.nextDue) - now
  const finished = !s.active
  const completed = finished && s.maxRuns > 0 && s.runs >= s.maxRuns

  const run = () =>
    send('Recurring payment sent', (wc) =>
      wc.writeContract({ address: LEASH_ADDRESS, abi: agentLeashAbi, functionName: 'executeSchedule', args: [leashId, s.id] }),
    )
  const cancel = () =>
    send('Recurring payment cancelled', (wc) =>
      wc.writeContract({ address: LEASH_ADDRESS, abi: agentLeashAbi, functionName: 'cancelSchedule', args: [leashId, s.id] }),
    )

  return (
    <li className="glass-inner rounded-2xl p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="display text-xl font-semibold tabular-nums">{usd(s.amount)} USDC</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          {finished ? (completed ? 'Completed' : 'Cancelled') : intervalLabel(s.interval)}
        </span>
      </div>
      <p className="mono mt-1 truncate text-xs text-muted">to {label}</p>
      <p className="mt-1.5 text-xs text-muted">
        {s.runs} payment{s.runs === 1 ? '' : 's'} made{s.maxRuns > 0 ? ` of ${s.maxRuns}` : ''}
        {!finished && <> · {due <= 0 ? <b className="text-accent">due now</b> : <>next in {fmtDuration(due)}</>}</>}
      </p>
      {!finished && (
        <div className="mt-3 flex gap-2">
          {canRun && due <= 0 && active && (
            <Button size="sm" onClick={run} loading={busy} className="flex-1">
              <Play className="h-4 w-4" /> Pay now
            </Button>
          )}
          {isOwner && (
            <Button size="sm" variant="outline" onClick={cancel} disabled={busy} className="flex-1">
              <X className="h-4 w-4" /> Cancel
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

interface Props {
  leashId: bigint
  leash: LeashData
  schedules: ScheduleData[] | undefined
  loading: boolean
  isOwner: boolean
  canRun: boolean
  now: number
  payeeSuggestions: Address[]
}

export function Recurring({ leashId, leash, schedules, loading, isOwner, canRun, now, payeeSuggestions }: Props) {
  const { send, phase, busy } = useSend()
  const [payee, setPayee] = useState('')
  const [amount, setAmount] = useState('')
  const [interval, setIntervalIdx] = useState(2)
  const [start, setStart] = useState(0)
  const [runs, setRuns] = useState('')

  const amountRaw = tryParseUsdc(amount)
  const maxRuns = runs.trim() === '' ? 0 : Number(runs)
  const errors = {
    payee: payee && !isAddress(payee.trim()) ? 'Not a valid address' : undefined,
    amount: amountRaw !== undefined && amountRaw > leash.balanceCap ? 'More than the leash balance cap' : undefined,
    runs: !Number.isInteger(maxRuns) || maxRuns < 0 ? 'Whole number, or leave empty' : undefined,
  }
  const ready = isAddress(payee.trim()) && amountRaw !== undefined && amountRaw > 0n && !errors.amount && !errors.runs && leash.activeSchedules < 20
  const active = !leash.revoked && !leash.paused && Number(leash.expiresAt) > now

  const create = async () => {
    if (!ready || amountRaw === undefined) return
    const chainTime = (await publicClient.getBlock()).timestamp
    const startAt = STARTS[start].delay === 0 ? 0n : chainTime + BigInt(STARTS[start].delay)
    const ok = await send('Recurring payment set up', (wc) =>
      wc.writeContract({
        address: LEASH_ADDRESS,
        abi: agentLeashAbi,
        functionName: 'createSchedule',
        args: [leashId, payee.trim() as Address, amountRaw, BigInt(INTERVALS[interval].seconds), startAt, maxRuns],
      }),
    )
    if (ok) {
      setPayee('')
      setAmount('')
      setRuns('')
    }
  }

  const list = schedules ?? []
  const open = list.filter((s) => s.active)
  const done = list.filter((s) => !s.active)

  return (
    <>
      <Card>
        <div className="flex items-center gap-2">
          <Repeat className="h-5 w-5 text-accent" aria-hidden />
          <h3 className="display text-lg font-semibold">Recurring payments</h3>
        </div>
        <p className="mt-1 text-sm text-muted text-pretty">
          Salaries, subscriptions, allowances. You set the amount and schedule once. When a payment is due, anyone can trigger it, and the contract pays exactly that amount to exactly that address. Missed periods are skipped, never paid twice.
        </p>
        {loading ? (
          <Skeleton className="mt-4 h-24" />
        ) : open.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No recurring payments yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {open.map((s) => (
              <Row key={s.id} s={s} leashId={leashId} isOwner={isOwner} canRun={canRun} now={now} active={active} />
            ))}
          </ul>
        )}
        {done.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-semibold text-muted">Finished ({done.length})</summary>
            <ul className="mt-3 space-y-3">
              {done.map((s) => (
                <Row key={s.id} s={s} leashId={leashId} isOwner={false} canRun={false} now={now} active={false} />
              ))}
            </ul>
          </details>
        )}
        {leash.paused && open.length > 0 && <p className="mt-3 text-xs text-accent">The leash is paused, so recurring payments are on hold.</p>}
      </Card>

      {isOwner && (
        <Card className="space-y-4">
          <h3 className="display text-lg font-semibold">Set up a recurring payment</h3>
          <div className="space-y-2">
            <Field
              label="Pay to"
              placeholder="0x… address"
              value={payee}
              onChange={(e) => setPayee(e.target.value.trim())}
              error={errors.payee}
              spellCheck={false}
            />
            {payeeSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {payeeSuggestions.slice(0, 4).map((p) => (
                  <SuggestChip key={p} address={p} onPick={setPayee} active={payee.toLowerCase() === p.toLowerCase()} />
                ))}
              </div>
            )}
          </div>
          <Field label="Amount each time" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} suffix="USDC" error={errors.amount} placeholder="0.00" />
          <div>
            <span className="label">Repeats</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {INTERVALS.map((i, idx) => (
                <Chip key={i.label} active={interval === idx} onClick={() => setIntervalIdx(idx)}>{i.label}</Chip>
              ))}
            </div>
          </div>
          <div>
            <span className="label">First payment</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {STARTS.map((st, idx) => (
                <Chip key={st.label} active={start === idx} onClick={() => setStart(idx)}>{st.label}</Chip>
              ))}
            </div>
          </div>
          <Field label="Number of payments" inputMode="numeric" value={runs} onChange={(e) => setRuns(e.target.value)} placeholder="Unlimited" error={errors.runs} hint="Leave empty to repeat until you cancel, or the leash expires." />
          <p className="rounded-2xl border border-accent/25 bg-accent/5 p-3.5 text-xs text-muted text-pretty">
            Recurring payments skip the agent's per-payment limit, daily cap and allowlist because you approved them here. The leash needs enough balance when each one is due, and it must not be paused, revoked or expired. A leash expiry shorter than your schedule will stop it.
          </p>
          <Button onClick={create} disabled={!ready || leash.revoked} loading={busy} className="w-full">
            {phase === 'wallet' ? 'Confirm in your wallet…' : phase === 'confirming' ? `Confirming on ${NETWORK_NAME}…` : 'Set up recurring payment'}
          </Button>
          {leash.activeSchedules >= 20 && <p className="text-center text-xs text-danger">This leash already has 20 active recurring payments.</p>}
        </Card>
      )}
    </>
  )
}

function SuggestChip({ address, onPick, active }: { address: Address; onPick: (a: string) => void; active: boolean }) {
  const label = usePayeeLabel(address)
  return <Chip active={active} onClick={() => onPick(address)}>{label}</Chip>
}
