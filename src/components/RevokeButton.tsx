import { useState } from 'react'
import { OctagonX } from 'lucide-react'
import { agentLeashAbi } from '@/lib/agentLeashAbi'
import { LEASH_ADDRESS, usd } from '@/lib/chain'
import { useSend } from '@/hooks/useSend'

export function RevokeButton({ leashId, balance, revoked }: { leashId: bigint; balance: bigint; revoked: boolean }) {
  const { send, phase, busy } = useSend()
  const [armed, setArmed] = useState(false)

  const revoke = async () => {
    const ok = await send('Leash revoked', (wc) =>
      wc.writeContract({ address: LEASH_ADDRESS, abi: agentLeashAbi, functionName: 'revoke', args: [leashId] }),
    )
    if (ok) setArmed(false)
  }

  if (revoked) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-center text-sm font-semibold text-danger">
        Revoked. The agent is permanently stopped.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => (armed ? void revoke() : setArmed(true))}
        disabled={busy}
        className="flex min-h-[76px] w-full items-center justify-center gap-3 rounded-3xl bg-gradient-to-b from-[#ff6b6b] to-[#e63b3b] px-5 text-xl font-bold tracking-wide text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_32px_-10px_rgba(255,82,82,0.6)] transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
      >
        <OctagonX className="h-7 w-7" aria-hidden />
        {phase === 'wallet' ? 'Confirm in wallet…' : phase === 'confirming' ? 'Revoking…' : armed ? 'TAP AGAIN TO CONFIRM' : 'REVOKE'}
      </button>
      <p className="text-center text-xs text-muted">
        {armed ? (
          <>
            Stops the agent instantly and refunds {usd(balance)} USDC to you.{' '}
            <button className="underline" onClick={() => setArmed(false)}>Cancel</button>
          </>
        ) : (
          'Instantly stops the agent and refunds what is left. This cannot be undone.'
        )}
      </p>
    </div>
  )
}
