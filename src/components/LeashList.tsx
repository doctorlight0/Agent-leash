import { useAccount } from 'wagmi'
import { useNow } from '@/hooks/useNow'
import { ChevronRight } from 'lucide-react'
import { useRecentLeashes } from '@/hooks/useLeash'
import { short, usd } from '@/lib/chain'
import { navigate } from '@/lib/router'
import { Card, Skeleton } from './ui'

export function LeashList() {
  const { address } = useAccount()
  const { data, isLoading, isError } = useRecentLeashes(8)
  const now = useNow()

  return (
    <Card>
      <h3 className="display text-xl font-semibold">Recent leashes</h3>
      <p className="mt-0.5 text-sm text-muted">Every leash is public. Open one to watch it live.</p>
      <div className="mt-3 divide-y divide-line">
        {isLoading && <div className="space-y-2 py-3"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>}
        {isError && <p className="py-4 text-sm text-danger">Could not read leashes. Try again in a moment.</p>}
        {data?.length === 0 && <p className="py-4 text-sm text-muted">No leashes yet. Create the first one above.</p>}
        {data?.map(({ id, leash }) => {
          const mine = !!address && leash.owner.toLowerCase() === address.toLowerCase()
          const status = leash.revoked
            ? 'Revoked'
            : Number(leash.expiresAt) < now
              ? 'Expired'
              : 'Active'
          return (
            <button
              key={id.toString()}
              onClick={() => navigate(mine ? `/leash/${id.toString()}` : `/l/${id.toString()}`)}
              className="flex min-h-[56px] w-full items-center gap-3 py-3 text-left"
            >
              <span className="display w-10 text-lg font-semibold text-accent">#{id.toString()}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium tabular-nums">
                  {usd(leash.balance)} USDC left
                  {mine && <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-accent">yours</span>}
                </span>
                <span className="mono block truncate text-xs text-muted">agent {short(leash.agent)}</span>
              </span>
              <span className={status === 'Active' ? 'text-xs font-semibold text-ok' : 'text-xs font-semibold text-muted'}>{status}</span>
              <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
            </button>
          )
        })}
      </div>
    </Card>
  )
}
