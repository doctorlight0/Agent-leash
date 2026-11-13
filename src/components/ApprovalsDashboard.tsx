import { useNear } from '@/hooks/useNear'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckCircle, XCircle, Clock, AlertTriangle, DollarSign, Search, Filter, ChevronDown } from 'lucide-react'
import { formatUSDC, formatAddress, formatRelativeTime, formatFullDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'

interface PaymentRequest {
  leash_id: number
  payment_id: number
  requester: string
  recipient: string
  amount: string
  reason: string | null
  status: string
  created_at_ns: string
  approval_expires_at_ns: string | null
}

export function ApprovalsDashboard() {
  const { connected, accountId, view, call } = useNear()
  const [requests, setRequests] = useState<PaymentRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'PendingApproval' | 'Settling' | 'Settled' | 'Rejected' | 'Expired'>('all')
  const [leashFilter, setLeashFilter] = useState<string>('all')

  useEffect(() => {
    if (connected && accountId) {
      loadRequests()
    } else {
      setLoading(false)
    }
  }, [connected, accountId, view])

  const loadRequests = async () => {
    try {
      if (!accountId) {
        setLoading(false)
        return
      }
      const leashIds = await view('list_owner_leashes', { owner_id: accountId })
      if (!Array.isArray(leashIds)) {
        setLoading(false)
        return
      }

      const allRequests: PaymentRequest[] = []
      for (const leashId of leashIds) {
        try {
          const payments = await view('list_leash_payments', { leash_id: leashId, from_index: 0, limit: 100 })
          if (Array.isArray(payments)) {
            for (const p of payments as any[]) {
              if (p.status === 'PendingApproval' || p.status === 'Settling') {
                allRequests.push({
                  leash_id: leashId,
                  payment_id: p.payment_id,
                  requester: p.requester,
                  recipient: p.recipient,
                  amount: p.amount,
                  reason: p.reason,
                  status: p.status,
                  created_at_ns: p.created_at_ns,
                  approval_expires_at_ns: p.approval_expires_at_ns,
                })
              }
            }
          }
        } catch (e) {
          // Skip leashes with no payments
        }
      }
      setRequests(allRequests)
    } catch (error) {
      console.error('Failed to load requests:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (leashId: number, paymentId: number) => {
    if (!confirm('Approve this payment request?')) return
    setActionLoading(`approve-${paymentId}`)
    try {
      await call('approve_payment', { leash_id: leashId, payment_id: paymentId })
      await loadRequests()
    } catch (error) {
      console.error('Failed to approve:', error)
      toast.error(`Failed to approve: ${error}`)
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (leashId: number, paymentId: number) => {
    if (!confirm('Reject this payment request?')) return
    setActionLoading(`reject-${paymentId}`)
    try {
      await call('reject_payment', { leash_id: leashId, payment_id: paymentId })
      await loadRequests()
    } catch (error) {
      console.error('Failed to reject:', error)
      toast.error(`Failed to reject: ${error}`)
    } finally {
      setActionLoading(null)
    }
  }

  const filteredRequests = requests.filter((req) => {
    if (statusFilter !== 'all' && req.status !== statusFilter) return false
    if (leashFilter !== 'all' && req.leash_id.toString() !== leashFilter) return false
    if (search && !req.reason?.toLowerCase().includes(search.toLowerCase()) && !formatAddress(req.recipient).includes(search)) return false
    return true
  })

  const leashes = [...new Set(requests.map(r => r.leash_id))]
  const pendingCount = requests.filter(r => r.status === 'PendingApproval').length

  if (!connected) {
    return (
      <div className="text-center py-12">
        <CheckCircle className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold">Connect Wallet</h2>
        <p className="text-muted-foreground">Connect your NEAR wallet to review approvals</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Approvals</h1>
          <p className="text-muted-foreground">Review and approve agent payment requests</p>
        </div>
        {pendingCount > 0 && (
          <Badge variant="warning" className="text-sm px-3 py-1 gap-1">
            <AlertTriangle className="h-3 w-3" />
            {pendingCount} pending
          </Badge>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Total Requests" value={requests.length.toString()} icon={<DollarSign className="h-5 w-5" />} />
        <StatCard title="Pending" value={requests.filter(r => r.status === 'PendingApproval').length.toString()} icon={<Clock className="h-5 w-5" />} variant="warning" />
        <StatCard title="Approved" value={requests.filter(r => r.status === 'Settled').length.toString()} icon={<CheckCircle className="h-5 w-5" />} variant="success" />
        <StatCard title="Rejected" value={requests.filter(r => r.status === 'Rejected').length.toString()} icon={<XCircle className="h-5 w-5" />} variant="destructive" />
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search requests..."
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
            <option value="PendingApproval">Pending Approval</option>
            <option value="Settling">Settling</option>
            <option value="Settled">Settled</option>
            <option value="Rejected">Rejected</option>
            <option value="Expired">Expired</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
        <div className="relative sm:w-auto">
          <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={leashFilter}
            onChange={(e) => setLeashFilter(e.target.value)}
            className="w-full appearance-none rounded-lg border border-input bg-background py-2 pl-10 pr-8 focus:outline-none focus:ring-2 focus:ring-ring sm:w-auto"
          >
            <option value="all">All Leashes</option>
            {leashes.map(l => <option key={l} value={String(l)}>Leash #{l}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-32 bg-muted rounded" />
                  <div className="flex-1 h-4 bg-muted rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredRequests.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-center sm:p-12">
            <CheckCircle className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">No Requests Found</h2>
            <p className="text-muted-foreground">{search || statusFilter !== 'all' || leashFilter !== 'all' ? 'Try adjusting your filters' : 'No payment requests pending approval'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map((request) => (
            <RequestCard key={`${request.leash_id}-${request.payment_id}`} request={request} onApprove={handleApprove} onReject={handleReject} loading={actionLoading} />
          ))}
        </div>
      )}
    </div>
  )
}

function RequestCard({ request, onApprove, onReject, loading }: { request: PaymentRequest; onApprove: Function; onReject: Function; loading: string | null }) {
  const isPending = request.status === 'PendingApproval'
  const isLoading = loading?.includes(`${request.payment_id}`)

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h3 className="font-semibold truncate">Payment #{request.payment_id}</h3>
              <RequestStatusBadge status={request.status} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm mb-2">
              <div><span className="text-muted-foreground">Leash:</span> <span className="font-mono">#{request.leash_id}</span></div>
              <div><span className="text-muted-foreground">Requester:</span> <span className="font-mono truncate">{formatAddress(request.requester)}</span></div>
              <div><span className="text-muted-foreground">Recipient:</span> <span className="font-mono truncate">{formatAddress(request.recipient)}</span></div>
              <div><span className="text-muted-foreground">Amount:</span> <span className="font-mono font-semibold">{formatUSDC(request.amount)}</span></div>
            </div>
            {request.reason && <p className="text-sm text-muted-foreground">Reason: {request.reason}</p>}
            <p className="text-xs text-muted-foreground">Created: {formatFullDate(BigInt(request.created_at_ns))}</p>
            {request.approval_expires_at_ns && <p className="text-xs text-muted-foreground">Expires: {formatFullDate(BigInt(request.approval_expires_at_ns))}</p>}
          </div>

          {isPending && (
            <div className="flex w-full shrink-0 flex-col gap-2 min-[390px]:flex-row sm:w-auto">
              <Button
                size="sm"
                onClick={() => onApprove(request.leash_id, request.payment_id)}
                disabled={isLoading}
                className="gap-1"
              >
                <CheckCircle className="h-4 w-4" />
                {isLoading ? 'Approving...' : 'Approve'}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onReject(request.leash_id, request.payment_id)}
                disabled={isLoading}
                className="gap-1"
              >
                <XCircle className="h-4 w-4" />
                {isLoading ? 'Rejecting...' : 'Reject'}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function RequestStatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'default' | 'secondary' | 'success' | 'destructive' | 'warning' | 'outline'> = {
    'PendingApproval': 'warning',
    'Settling': 'warning',
    'Settled': 'success',
    'Rejected': 'destructive',
    'Expired': 'secondary',
  }
  return <Badge variant={variants[status] || 'default'} className="text-xs">{status}</Badge>
}

function StatCard({ title, value, icon, variant = 'default' }: { title: string; value: string; icon: React.ReactNode; variant?: 'default' | 'success' | 'destructive' | 'warning' }) {
  const variantClasses = {
    default: 'bg-primary/10 text-primary',
    success: 'bg-green-500/10 text-green-600',
    destructive: 'bg-red-500/10 text-red-600',
    warning: 'bg-yellow-500/10 text-yellow-600',
  }
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-3">
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', variantClasses[variant])}>
            {icon}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="font-mono font-semibold text-lg">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
