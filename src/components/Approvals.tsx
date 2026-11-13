import { useState } from 'react'
import { Check, CheckCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { agentLeashAbi } from '@/lib/agentLeashAbi'
import { LEASH_ADDRESS, usd } from '@/lib/chain'
import { usePayeeLabel } from '@/lib/payeeNames'
import { friendlyError, isUserRejection } from '@/lib/errors'
import { useSend } from '@/hooks/useSend'
import type { RequestInfo } from '@/hooks/useLeashEvents'
import { Button, Card } from './ui'

interface Props {
  leashId: bigint
  requests: RequestInfo[]
  isOwner: boolean
  active: boolean
  balance: bigint
}

function PayeeText({ address }: { address: string }) {
  return <span className="mono">{usePayeeLabel(address)}</span>
}

export function Approvals({ leashId, requests, isOwner, active, balance }: Props) {
  const { send, busy } = useSend()
  const [batch, setBatch] = useState<'approve' | 'reject' | null>(null)
  const pending = requests.filter((r) => r.status === 'pending')

  const act = (r: RequestInfo, fn: 'approve' | 'reject') =>
    send(fn === 'approve' ? `Request #${r.requestId} approved and paid` : `Request #${r.requestId} rejected`, (wc) =>
      wc.writeContract({ address: LEASH_ADDRESS, abi: agentLeashAbi, functionName: fn, args: [leashId, r.requestId] }),
    )

  /** One wallet confirmation per request, in order. Stops on the first failure or cancel. */
  const runBatch = async (fn: 'approve' | 'reject') => {
    setBatch(fn)
    let left = balance
    let done = 0
    try {
      for (const r of pending) {
        if (fn === 'approve') {
          if (r.amount > left) {
            toast.message(`Skipped request #${r.requestId}: not enough balance left`)
            continue
          }
          left -= r.amount
        }
        const ok = await act(r, fn)
        if (!ok) break
        done++
      }
      if (done > 1) toast.success(`${done} requests ${fn === 'approve' ? 'approved' : 'rejected'}`)
    } catch (err) {
      if (!isUserRejection(err)) toast.error(friendlyError(err))
    } finally {
      setBatch(null)
    }
  }

  return (
    <Card className={pending.length > 0 ? '!border-accent/50' : undefined}>
      <div className="flex items-center justify-between">
        <h3 className="display text-lg font-semibold">Pending approvals</h3>
        {pending.length > 0 && <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-accentInk">{pending.length}</span>}
      </div>
      {pending.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          Nothing waiting. If the agent tries to pay someone who is not on the allowlist, the request lands here and no money moves until the owner approves.
        </p>
      ) : (
        <>
          {isOwner && pending.length > 1 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button size="sm" onClick={() => runBatch('approve')} disabled={busy || !active} loading={batch === 'approve'}>
                <CheckCheck className="h-4 w-4" /> Approve all
              </Button>
              <Button size="sm" variant="outline" onClick={() => runBatch('reject')} disabled={busy} loading={batch === 'reject'}>
                Reject all
              </Button>
            </div>
          )}
          <ul className="mt-3 space-y-3">
            {pending.map((r) => (
              <li key={r.requestId} className="glass-inner rounded-2xl p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="display text-xl font-semibold tabular-nums">{usd(r.amount)} USDC</span>
                  <span className="text-xs text-muted">request #{r.requestId}</span>
                </div>
                <p className="mt-1 text-sm text-muted">
                  to <PayeeText address={r.payee} />
                </p>
                <p className="mt-1 text-sm italic text-pretty">"{r.reason}"</p>
                {r.amount > balance && <p className="mt-1 text-xs text-danger">The leash holds less than this amount right now.</p>}
                {isOwner ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button size="sm" onClick={() => act(r, 'approve')} disabled={busy || !active || r.amount > balance}>
                      <Check className="h-4 w-4" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => act(r, 'reject')} disabled={busy}>
                      <X className="h-4 w-4" /> Reject
                    </Button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted">Waiting for the owner.</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}
