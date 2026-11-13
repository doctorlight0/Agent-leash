import { useNear } from '@/hooks/useNear'
import { navigate } from '@/lib/router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Shield, Search, Filter, ChevronDown } from 'lucide-react'
import { formatUSDC, formatAddress, formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'

interface LeashData {
  id: string
  agent: string
  owner: string
  balance: string
  daily_cap: string
  per_payment_limit: string
  monthly_cap: string
  monthly_spent: string
  paused: boolean
  revoked: boolean
  expires_at: string
  created_at: string
}

export function LeashesList() {
  const { connected, accountId, view } = useNear()
  const [leashes, setLeashes] = useState<LeashData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'revoked' | 'expired'>('all')

  useEffect(() => {
    if (connected && accountId) {
      loadLeashes()
    } else {
      setLeashes([])
      setLoading(false)
    }
  }, [connected, accountId, view])

  const loadLeashes = async () => {
    try {
      const leashIdsResult: any = await view('list_owner_leashes', { owner_id: accountId })
      if (!leashIdsResult || !Array.isArray(leashIdsResult)) {
        setLoading(false)
        return
      }
      const leashIds = leashIdsResult.map((id: any) => Number(id))
      const details: LeashData[] = []
      for (const leashId of leashIds) {
        try {
          const result: any = await view('get_leash', { leash_id: leashId })
          if (result) {
            details.push({
              id: String(result.leash_id),
              agent: result.agent_id,
              owner: result.owner_id,
              balance: result.available_balance?.toString() || '0',
              daily_cap: result.per_payment_limit?.toString() || '0',
              per_payment_limit: result.per_payment_limit?.toString() || '0',
              monthly_cap: result.monthly_cap?.toString() || '0',
              monthly_spent: result.monthly_spent?.toString() || '0',
              paused: result.paused || false,
              revoked: result.revoked || false,
              expires_at: result.expires_at_ns ? String(result.expires_at_ns) : '',
              created_at: '',
            })
          }
        } catch (e) {
          // Skip leashes that fail to load
        }
      }
      setLeashes(details)
    } catch (error) {
      console.error('Failed to load leashes:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredLeashes = leashes.filter((leash) => {
    const isExpired = leash.expires_at && BigInt(leash.expires_at) < BigInt(Date.now() * 1_000_000)
    const status = leash.revoked ? 'revoked' : isExpired ? 'expired' : leash.paused ? 'paused' : 'active'

    if (statusFilter !== 'all' && status !== statusFilter) return false
    if (search && !leash.id.includes(search) && !formatAddress(leash.agent).includes(search)) return false
    return true
  })

  if (!connected) {
    return (
      <div className="text-center py-12">
        <Shield className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold">Connect Wallet</h2>
        <p className="text-muted-foreground">Connect your NEAR wallet to view and manage leashes</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Leashes</h1>
          <p className="text-muted-foreground">Manage your AI agent spending controls</p>
        </div>
        <Button onClick={() => navigate('/leashes/new')} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Leash
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search leashes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="relative sm:w-auto">
          <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="w-full appearance-none rounded-lg border border-input bg-background py-2 pl-10 pr-8 focus:outline-none focus:ring-2 focus:ring-ring sm:w-auto"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="revoked">Revoked</option>
            <option value="expired">Expired</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="space-y-4 p-4 sm:p-6">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2" />
                <div className="grid grid-cols-1 gap-4 min-[390px]:grid-cols-2">
                  <div className="h-8 bg-muted rounded" />
                  <div className="h-8 bg-muted rounded" />
                  <div className="h-8 bg-muted rounded" />
                  <div className="h-8 bg-muted rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredLeashes.length === 0 ? (
        <div className="text-center py-12">
          <Shield className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">No leashes found</h2>
          <p className="text-muted-foreground">
            {search || statusFilter !== 'all' ? 'Try adjusting your filters' : 'Create your first leash to get started'}
          </p>
          {!search && statusFilter === 'all' && (
            <Button onClick={() => navigate('/leashes/new')} className="mt-4 gap-2">
              <Plus className="h-4 w-4" />
              Create Leash
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredLeashes.map((leash) => (
            <LeashCard key={leash.id} leash={leash} />
          ))}
        </div>
      )}
    </div>
  )
}

function LeashCard({ leash }: { leash: LeashData }) {
  const isExpired = leash.expires_at && BigInt(leash.expires_at) < BigInt(Date.now() * 1_000_000)
  const isActive = !leash.revoked && !isExpired && !leash.paused

  const status = leash.revoked ? 'Revoked' : isExpired ? 'Expired' : leash.paused ? 'Paused' : 'Active'

  return (
    <div
      className="h-full transition-all hover:shadow-lg cursor-pointer"
      onClick={() => navigate(`/leash/${leash.id}`)}
    >
      <Card className="h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg truncate">Leash #{leash.id}</CardTitle>
              <p className="text-xs text-muted-foreground font-mono truncate">
                Agent: {formatAddress(leash.agent)}
              </p>
            </div>
            <Badge variant={isActive ? 'success' : leash.revoked ? 'destructive' : isExpired ? 'warning' : 'secondary'}>
              {status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Available Balance</p>
              <p className="font-mono font-semibold">{formatUSDC(leash.balance)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Monthly Spent</p>
              <p className="font-mono font-semibold">
                {formatUSDC(leash.monthly_spent)} / {formatUSDC(leash.monthly_cap || '0')}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Daily Cap</p>
              <p className="font-mono font-semibold">{formatUSDC(leash.daily_cap)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Per Payment Limit</p>
              <p className="font-mono font-semibold">{formatUSDC(leash.per_payment_limit)}</p>
            </div>
          </div>

          {leash.expires_at && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
              <span>Expires: {formatRelativeTime(BigInt(leash.expires_at))}</span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button variant="ghost" size="sm" className="flex-1" onClick={(e) => {
              e.preventDefault()
              navigate(`/leash/${leash.id}`)
            }}>
              View Details
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
