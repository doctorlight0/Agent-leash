import { useNear } from '@/hooks/useNear'
import { toast } from 'sonner'
import { navigate } from '@/lib/router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, CreditCard, Users, DollarSign, Calendar, ArrowRight, RefreshCw, AlertTriangle, CheckCircle, XCircle, Search, Filter, ChevronDown } from 'lucide-react'
import { formatUSDC, formatAddress, formatRelativeTime, formatFullDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { useRoute } from '@/lib/router'

interface PayrollGroup {
  group_id: string
  leash_id: string
  name: string
  token_contract: string
  payday: number
  next_payment_period_ns: string
  workers: Worker[]
  reserved_balance: string
  next_payment_id: string
  active: boolean
}

interface Worker {
  worker_id: string
  account_id: string
  salary: string
  active: boolean
  label: string
}

interface PayrollPayment {
  payment_id: string
  group_id: string
  worker_id: string
  worker_account: string
  token_contract: string
  amount: string
  period_start_ns: string
  period_end_ns: string
  status: string
  created_at_ns: string
  settled_at_ns: string | null
  reserved: boolean
}

export function PayrollDashboard({ groupId }: { groupId?: number } = {}) {
  const { connected, accountId, view, call } = useNear()
  const route = useRoute()
  const [groups, setGroups] = useState<PayrollGroup[]>([])
  const [payments, setPayments] = useState<PayrollPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<PayrollGroup | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'settling' | 'settled' | 'failed'>('all')

  useEffect(() => {
    if (connected && accountId) {
      loadData()
    } else {
      setLoading(false)
    }
  }, [connected, accountId, view])

  useEffect(() => {
    if (groupId && groups.length > 0) {
      const group = groups.find(g => g.group_id === groupId.toString())
      if (group) setSelectedGroup(group)
    }
  }, [groupId, groups])

  const loadData = async () => {
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

      const allGroups: PayrollGroup[] = []
      const allPayments: PayrollPayment[] = []

      for (const leashId of leashIds) {
        try {
          const groups = await view('list_payroll_groups', { leash_id: leashId })
          if (Array.isArray(groups)) {
            for (const g of groups as any[]) {
              allGroups.push({
                group_id: g.group_id,
                leash_id: leashId,
                name: g.name,
                token_contract: g.token_contract,
                payday: g.payday,
                next_payment_period_ns: g.next_payment_period_ns,
                workers: g.workers || [],
                reserved_balance: g.reserved_balance,
                next_payment_id: g.next_payment_id,
                active: g.active,
              })
            }
          }

          const payments = await view('list_payroll_payments', { leash_id: leashId, from_index: 0, limit: 100 })
          if (Array.isArray(payments)) {
            for (const p of payments as any[]) {
              allPayments.push({
                payment_id: p.payment_id,
                group_id: p.group_id,
                worker_id: p.worker_id,
                worker_account: p.worker_account,
                token_contract: p.token_contract,
                amount: p.amount,
                period_start_ns: p.period_start_ns,
                period_end_ns: p.period_end_ns,
                status: p.status,
                created_at_ns: p.created_at_ns,
                settled_at_ns: p.settled_at_ns,
                reserved: p.reserved,
              })
            }
          }
        } catch (e) {
          // Skip leashes with no payroll data
        }
      }

      setGroups(allGroups)
      setPayments(allPayments)
      if (!selectedGroup && allGroups.length > 0) {
        setSelectedGroup(allGroups[0])
      }
    } catch (error) {
      console.error('Failed to load payroll data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (method: string, args: Record<string, unknown> = {}) => {
    setActionLoading(method)
    try {
      await call(method, args)
      await loadData()
    } catch (error) {
      console.error(`Failed to ${method}:`, error)
      toast.error(`Failed to ${method}: ${error}`)
    } finally {
      setActionLoading(null)
    }
  }

  const executePayroll = async (groupId: string, leashId: string) => {
    if (!confirm('Execute payroll for this group? This will initiate payments to all active workers.')) return
    await handleAction('execute_payroll', { leash_id: Number(leashId), group_id: Number(groupId) })
  }

  const retryPayments = async (groupId: string, leashId: string, paymentIds: string[]) => {
    if (!confirm(`Retry ${paymentIds.length} failed payments?`)) return
    await handleAction('retry_payroll_payments', { leash_id: Number(leashId), group_id: Number(groupId), payment_ids: paymentIds })
  }

  if (!connected) {
    return (
      <div className="text-center py-12">
        <CreditCard className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold">Connect Wallet</h2>
        <p className="text-muted-foreground">Connect your NEAR wallet to manage payroll</p>
      </div>
    )
  }

  const filteredPayments = payments.filter((payment) => {
    if (selectedGroup && payment.group_id !== selectedGroup.group_id) return false
    if (statusFilter !== 'all' && payment.status !== statusFilter) return false
    if (search && !payment.worker_account.includes(search) && !payment.payment_id.includes(search)) return false
    return true
  })

  const pendingPayments = payments.filter(p => p.status === 'Settling' || p.status === 'Pending')
  const failedPayments = payments.filter(p => p.status === 'Failed')

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Payroll</h1>
          <p className="text-muted-foreground">Manage automated monthly payments to workers</p>
        </div>
        <div className="flex flex-col gap-2 min-[390px]:flex-row sm:flex-wrap sm:justify-end">
          <Button onClick={() => navigate('/payroll/new')} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Group
          </Button>
          <Button variant="outline" onClick={() => navigate('/workers')} className="gap-2">
            <Users className="h-4 w-4" />
            Manage Workers
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Payroll Groups" value={groups.length.toString()} icon={<CreditCard className="h-5 w-5" />} />
        <StatCard title="Total Workers" value={groups.reduce((sum, g) => sum + g.workers.filter(w => w.active).length, 0).toString()} icon={<Users className="h-5 w-5" />} />
        <StatCard title="Pending Payments" value={pendingPayments.length.toString()} icon={<ArrowRight className="h-5 w-5" />} />
        <StatCard title="Failed Payments" value={failedPayments.length.toString()} icon={<AlertTriangle className="h-5 w-5" />} variant={failedPayments.length > 0 ? 'destructive' : 'default'} />
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-center sm:p-12">
            <CreditCard className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">No Payroll Groups</h2>
            <p className="text-muted-foreground mb-4">Create your first payroll group to start automating payments</p>
            <Button onClick={() => navigate('/payroll/new')} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Payroll Group
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <PayrollGroupCard
                key={group.group_id}
                group={group}
                selected={selectedGroup?.group_id === group.group_id}
                onSelect={() => setSelectedGroup(group)}
                onExecute={() => executePayroll(String(group.group_id), String(group.leash_id))}
                onRetry={(ids) => retryPayments(String(group.group_id), String(group.leash_id), ids)}
                failedPayments={payments.filter(p => p.group_id === group.group_id && p.status === 'Failed')}
                loading={actionLoading}
              />
            ))}
          </div>

          {selectedGroup && (
            <Card>
              <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Payments for {selectedGroup.name}</CardTitle>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                  <div className="relative w-full sm:w-auto">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search payments..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded-lg border border-input bg-background py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-ring sm:w-64"
                    />
                  </div>
                  <div className="relative w-full sm:w-auto">
                    <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                      className="w-full appearance-none rounded-lg border border-input bg-background py-2 pl-10 pr-8 focus:outline-none focus:ring-2 focus:ring-ring sm:w-auto"
                    >
                      <option value="all">All</option>
                      <option value="pending">Pending</option>
                      <option value="settling">Settling</option>
                      <option value="settled">Settled</option>
                      <option value="failed">Failed</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredPayments.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No payments found</p>
                ) : (
                  <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b text-left text-sm text-muted-foreground">
                          <th className="pb-3 px-4">Worker</th>
                          <th className="pb-3 px-4">Amount</th>
                          <th className="pb-3 px-4">Period</th>
                          <th className="pb-3 px-4">Status</th>
                          <th className="pb-3 px-4">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPayments.map((payment) => (
                          <tr key={payment.payment_id} className="border-b last:border-0">
                            <td className="py-3 px-4">
                              <div className="font-mono text-sm">{formatAddress(payment.worker_account)}</div>
                            </td>
                            <td className="py-3 px-4 font-mono">{formatUSDC(payment.amount)}</td>
                            <td className="py-3 px-4 text-sm">
                              {formatRelativeTime(BigInt(payment.period_start_ns))} - {formatRelativeTime(BigInt(payment.period_end_ns))}
                            </td>
                            <td className="py-3 px-4">
                              <PaymentStatusBadge status={payment.status} />
                            </td>
                            <td className="py-3 px-4 text-sm text-muted-foreground">{formatRelativeTime(BigInt(payment.created_at_ns))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function PayrollGroupCard({
  group,
  selected,
  onSelect,
  onExecute,
  onRetry,
  failedPayments,
  loading
}: {
  group: PayrollGroup
  selected: boolean
  onSelect: () => void
  onExecute: () => void
  onRetry: (ids: string[]) => void
  failedPayments: { payment_id: string }[]
  loading: string | null
}) {
  const activeWorkers = group.workers.filter(w => w.active)
  const totalSalary = activeWorkers.reduce((sum, w) => sum + BigInt(w.salary), 0n)
  const nextPayment = group.next_payment_period_ns ? formatRelativeTime(BigInt(group.next_payment_period_ns)) : 'Not scheduled'

  return (
    <Card
      className={cn('cursor-pointer transition-all', selected && 'ring-2 ring-primary')}
      onClick={onSelect}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold">{group.name}</h3>
            <p className="text-sm text-muted-foreground">Group #{group.group_id} • Leash #{group.leash_id}</p>
          </div>
          <Badge variant={group.active ? 'success' : 'secondary'}>
            {group.active ? 'Active' : 'Inactive'}
          </Badge>
        </div>

        <div className="space-y-3 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Active Workers</span>
            <span className="font-medium">{activeWorkers.length}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total Salary</span>
            <span className="font-mono font-medium">{formatUSDC(totalSalary.toString())}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Reserved Balance</span>
            <span className="font-mono font-medium">{formatUSDC(group.reserved_balance)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Next Payment</span>
            <span className="font-medium">{nextPayment}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant={selected ? 'default' : 'outline'}
            size="sm"
            className="flex-1"
            onClick={(e) => { e.stopPropagation(); onExecute(); }}
            disabled={loading !== null || !group.active}
          >
            Execute Payroll
          </Button>
          {failedPayments.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onRetry(failedPayments.map(p => p.payment_id)); }}
              disabled={loading !== null}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function PaymentStatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'default' | 'secondary' | 'success' | 'destructive' | 'warning' | 'outline'> = {
    'Pending': 'outline',
    'Settling': 'warning',
    'Settled': 'success',
    'Failed': 'destructive',
    'Cancelled': 'secondary',
  }
  return <Badge variant={variants[status] || 'default'} className="text-xs">{status}</Badge>
}

function StatCard({ title, value, icon, variant = 'default' }: { title: string; value: string; icon: React.ReactNode; variant?: 'default' | 'destructive' }) {
  return (
    <Card className={variant === 'destructive' ? 'border-destructive/30' : ''}>
      <CardContent className="p-6">
        <div className="flex items-center gap-3">
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', variant === 'destructive' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary')}>
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
