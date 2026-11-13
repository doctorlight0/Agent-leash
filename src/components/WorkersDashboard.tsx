import { useNear } from '@/hooks/useNear'
import { toast } from 'sonner'
import { navigate } from '@/lib/router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Users, UserCheck, UserX, DollarSign, Edit, Search, Filter, ChevronDown, RefreshCw } from 'lucide-react'
import { formatUSDC, formatAddress, formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'

interface PayrollGroup {
  group_id: number
  owner_id: string
  name: string
  token_contract: string
  payday: number
  first_payment_date_ns: string
  workers: Worker[]
  active: boolean
  reserved_balance: string
  next_payment_period_ns: string
  created_at_ns: string
  total_monthly_salary: string
}

interface Worker {
  worker_id: number
  account_id: string
  salary: string
  token_contract: string
  active: boolean
  group_id: number
  leash_id: number
  group_name: string
}

export function WorkersDashboard() {
  const { connected, accountId, view, call } = useNear()
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [groupFilter, setGroupFilter] = useState<string>('all')

  useEffect(() => {
    if (connected && accountId) {
      loadWorkers()
    } else {
      setLoading(false)
    }
  }, [connected, accountId, view])

  const loadWorkers = async () => {
    try {
      const leashIds = await view('list_owner_leashes', { owner_id: accountId })
      if (!Array.isArray(leashIds)) {
        setLoading(false)
        return
      }

      const allWorkers: Worker[] = []
      for (const leashId of leashIds) {
        try {
          const groups = await view('list_payroll_groups', { leash_id: leashId })
          if (Array.isArray(groups)) {
            for (const group of groups) {
              for (const w of group.workers) {
                allWorkers.push({
                  worker_id: w.worker_id ?? 0,
                  account_id: w.account_id,
                  salary: w.salary,
                  token_contract: w.token_contract,
                  active: w.active,
                  group_id: group.group_id,
                  leash_id: leashId,
                  group_name: group.name,
                })
              }
            }
          }
        } catch (e) {
          // Skip leashes with no payroll groups
        }
      }
      setWorkers(allWorkers)
    } catch (error) {
      console.error('Failed to load workers:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (method: string, args: Record<string, unknown> = {}) => {
    setActionLoading(method)
    try {
      await call(method, args)
      await loadWorkers()
    } catch (error) {
      console.error(`Failed to ${method}:`, error)
      toast.error(`Failed to ${method}: ${error}`)
    } finally {
      setActionLoading(null)
    }
  }

  const filteredWorkers = workers.filter((worker) => {
    if (statusFilter !== 'all' && (statusFilter === 'active' ? !worker.active : worker.active)) return false
    if (groupFilter !== 'all' && worker.group_id.toString() !== groupFilter) return false
    if (search && !formatAddress(worker.account_id).includes(search) && !worker.group_id.toString().includes(search)) return false
    return true
  })

  const groups = [...new Set(workers.map(w => w.group_id.toString()))]

  if (!connected) {
    return (
      <div className="text-center py-12">
        <Users className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold">Connect Wallet</h2>
        <p className="text-muted-foreground">Connect your NEAR wallet to manage workers</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Workers</h1>
          <p className="text-muted-foreground">Manage payroll workers across all groups</p>
        </div>
        <Button onClick={() => navigate('/payroll/new')} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Payroll Group
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Total Workers" value={workers.length.toString()} icon={<Users className="h-5 w-5" />} />
        <StatCard title="Active" value={workers.filter(w => w.active).length.toString()} icon={<UserCheck className="h-5 w-5" />} />
        <StatCard title="Inactive" value={workers.filter(w => !w.active).length.toString()} icon={<UserX className="h-5 w-5" />} />
        <StatCard title="Total Monthly Salary" value={formatUSDC(workers.filter(w => w.active).reduce((sum, w) => sum + BigInt(w.salary), 0n).toString())} icon={<DollarSign className="h-5 w-5" />} />
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search workers..."
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
            <option value="inactive">Inactive</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
        <div className="relative sm:w-auto">
          <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="w-full appearance-none rounded-lg border border-input bg-background py-2 pl-10 pr-8 focus:outline-none focus:ring-2 focus:ring-ring sm:w-auto"
          >
            <option value="all">All Groups</option>
            {groups.map(g => <option key={g} value={g}>Group {g}</option>)}
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
      ) : filteredWorkers.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-center sm:p-12">
            <Users className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">No Workers Found</h2>
            <p className="text-muted-foreground mb-4">{search || statusFilter !== 'all' || groupFilter !== 'all' ? 'Try adjusting your filters' : 'Create a payroll group and add workers to get started'}</p>
            {!search && statusFilter === 'all' && groupFilter === 'all' && (
              <Button onClick={() => navigate('/payroll/new')} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Payroll Group
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredWorkers.map((worker) => (
            <WorkerCard key={worker.worker_id} worker={worker} onAction={handleAction} loading={actionLoading} />
          ))}
        </div>
      )}
    </div>
  )
}

function WorkerCard({ worker, onAction, loading }: { worker: Worker; onAction: Function; loading: string | null }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold">Worker #{worker.worker_id}</h3>
              <p className="truncate text-sm text-muted-foreground font-mono" title={worker.account_id}>{formatAddress(worker.account_id)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 items-center gap-3 min-[390px]:grid-cols-[auto_1fr_1fr_auto] sm:flex">
            <Badge variant={worker.active ? 'success' : 'secondary'}>
              {worker.active ? 'Active' : 'Inactive'}
            </Badge>

            <div className="text-right">
              <p className="text-sm text-muted-foreground">Monthly Salary</p>
              <p className="font-mono font-semibold">{formatUSDC(worker.salary)}</p>
            </div>

            <div className="text-right">
              <p className="text-sm text-muted-foreground">Group</p>
              <p className="font-medium">#{worker.group_id}</p>
            </div>

            <Button variant="ghost" size="icon" onClick={() => {
              const nextActive = !worker.active
              onAction('set_payroll_group_active', { leash_id: worker.leash_id, group_id: worker.group_id, active: nextActive })
            }}>
              {worker.active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function StatCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
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
