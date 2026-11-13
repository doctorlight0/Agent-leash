import { useOwnerLeashes } from '@/hooks/useNearLeash'
import { useNear } from '@/hooks/useNear'
import { navigate } from '@/lib/router'
import { Card } from './ui'

export function NearLeashList() {
  const { accountId, connected } = useNear()
  const { data, isLoading, error } = useOwnerLeashes(accountId)
  return (
    <Card className="space-y-3">
      <h2 className="display text-lg font-semibold">Your leashes</h2>
      {!connected && <p className="text-sm text-muted">Connect a NEAR wallet to list leashes created by that owner account.</p>}
      {connected && isLoading && <p className="text-sm text-muted">Loading…</p>}
      {connected && error && <p className="text-sm text-danger">Failed to load leashes: {(error as Error).message}</p>}
      {connected && data && data.length === 0 && <p className="text-sm text-muted">No leashes found for this owner account.</p>}
      {connected && data && data.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.map((id) => (
            <button key={id} onClick={() => navigate(`/leash/${id}`)} className="rounded-xl border border-white/10 px-3 py-2 text-sm hover:border-accent/40">Leash #{id}</button>
          ))}
        </div>
      )}
    </Card>
  )
}
