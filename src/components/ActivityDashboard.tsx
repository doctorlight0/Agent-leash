import { useNear } from '@/hooks/useNear'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Download, Filter, Search, ChevronDown, Activity as ActivityIcon, CreditCard, Users, ShieldCheck, ArrowDownToLine, ArrowUpFromLine, CheckCircle, XCircle, Clock } from 'lucide-react'
import { formatUSDC, formatAddress, formatRelativeTime, formatFullDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { exportToCSV } from '@/lib/csv'

interface ActivityEvent {
  event_type: string
  leash_id: string
  timestamp_ns: string
  data: Record<string, unknown>
  transaction_hash: string
}

export function ActivityDashboard() {
  const { connected, accountId, view } = useNear()
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'payment' | 'funding' | 'approval' | 'vigil' | 'payroll' | 'config'>('all')
  const [leashFilter, setLeashFilter] = useState<string>('all')

  useEffect(() => {
    if (connected && accountId) {
      loadEvents()
    } else {
      setLoading(false)
    }
  }, [connected, accountId, view])

  const loadEvents = async () => {
    try {
      if (!accountId) {
        setLoading(false)
        return
      }
      const leashIdsResult: any = await view('list_owner_leashes', { owner_id: accountId })
      if (!leashIdsResult || !Array.isArray(leashIdsResult)) {
        setLoading(false)
        return
      }
      const leashIds = leashIdsResult.map((id: any) => Number(id))
      const allEvents: ActivityEvent[] = []
      for (const leashId of leashIds) {
        try {
          const payments: any = await view('list_leash_payments', { leash_id: leashId, from_index: 0, limit: 100 })
          if (Array.isArray(payments)) {
            for (const p of payments) {
              allEvents.push({
                event_type: 'PaymentRequested',
                leash_id: String(leashId),
                timestamp_ns: String(p.created_at_ns),
                data: { payment_id: p.payment_id, recipient: p.recipient, amount: p.amount, status: p.status },
                transaction_hash: '',
              })
            }
          }
        } catch (e) {
          // Skip leashes with no payment data
        }
      }
      setEvents(allEvents)
    } catch (error) {
      console.error('Failed to load events:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredEvents = events.filter((event) => {
    if (typeFilter !== 'all' && !event.event_type.toLowerCase().includes(typeFilter)) return false
    if (leashFilter !== 'all' && event.leash_id !== leashFilter) return false
    if (search) {
      const searchLower = search.toLowerCase()
      const eventData = JSON.stringify(event.data).toLowerCase()
      if (!event.leash_id.includes(search) && !eventData.includes(searchLower)) return false
    }
    return true
  })

  const leashes = [...new Set(events.map(e => e.leash_id))]
  const eventTypes = [...new Set(events.map(e => e.event_type))]

  const handleExport = () => {
    const csvData = filteredEvents.map(e => ({
      'Event Type': e.event_type,
      'Leash ID': e.leash_id,
      'Timestamp': formatFullDate(BigInt(e.timestamp_ns)),
      'Transaction Hash': e.transaction_hash,
      'Data': JSON.stringify(e.data),
    }))
    exportToCSV(csvData, `activity-${Date.now()}.csv`)
  }

  if (!connected) {
    return (
      <div className="text-center py-12">
        <ActivityIcon className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold">Connect Wallet</h2>
        <p className="text-muted-foreground">Connect your NEAR wallet to view activity</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Activity</h1>
          <p className="text-muted-foreground">View transaction history and event logs</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport} className="gap-2" disabled={events.length === 0}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Total Events" value={events.length.toString()} icon={<ActivityIcon className="h-5 w-5" />} />
        <StatCard title="Payments" value={events.filter(e => e.event_type.includes('Payment')).length.toString()} icon={<CreditCard className="h-5 w-5" />} />
        <StatCard title="Funding" value={events.filter(e => e.event_type.includes('Fund') || e.event_type.includes('Withdraw')).length.toString()} icon={<ArrowDownToLine className="h-5 w-5" />} />
        <StatCard title="Approvals" value={events.filter(e => e.event_type.includes('Approve') || e.event_type.includes('Reject')).length.toString()} icon={<CheckCircle className="h-5 w-5" />} />
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search events..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="relative sm:w-auto">
          <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            className="w-full appearance-none rounded-lg border border-input bg-background py-2 pl-10 pr-8 focus:outline-none focus:ring-2 focus:ring-ring sm:w-auto"
          >
            <option value="all">All Types</option>
            <option value="payment">Payments</option>
            <option value="funding">Funding</option>
            <option value="approval">Approvals</option>
            <option value="vigil">Vigil</option>
            <option value="payroll">Payroll</option>
            <option value="config">Configuration</option>
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
            {leashes.map(l => <option key={l} value={l}>Leash #{l}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(10)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="h-8 w-24 bg-muted rounded" />
                  <div className="flex-1 h-4 bg-muted rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-center sm:p-12">
            <ActivityIcon className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">No Events Found</h2>
            <p className="text-muted-foreground">{search || typeFilter !== 'all' || leashFilter !== 'all' ? 'Try adjusting your filters' : 'No activity recorded yet'}</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="list" className="space-y-4">
          <TabsList>
            <TabsTrigger value="list">List View</TabsTrigger>
            <TabsTrigger value="summary">Summary</TabsTrigger>
          </TabsList>

          <TabsContent value="list">
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {filteredEvents.slice(0, 100).map((event, i) => (
                <EventCard key={i} event={event} />
              ))}
            </div>
            {filteredEvents.length > 100 && (
              <p className="text-center text-sm text-muted-foreground mt-4">
                Showing 100 of {filteredEvents.length} events. Export CSV to see all.
              </p>
            )}
          </TabsContent>

          <TabsContent value="summary">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {eventTypes.map(type => (
                <EventTypeSummary key={type} type={type} count={events.filter(e => e.event_type === type).length} />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

function EventCard({ event }: { event: ActivityEvent }) {
  const iconMap: Record<string, React.ReactNode> = {
    'PaymentRequested': <CreditCard className="h-4 w-4" />,
    'PaymentApproved': <CheckCircle className="h-4 w-4" />,
    'PaymentRejected': <XCircle className="h-4 w-4" />,
    'PaymentSettled': <Clock className="h-4 w-4" />,
    'LeashFunded': <ArrowDownToLine className="h-4 w-4" />,
    'LeashWithdrawn': <ArrowUpFromLine className="h-4 w-4" />,
    'VigilCheckIn': <ShieldCheck className="h-4 w-4" />,
    'VigilActivated': <ShieldCheck className="h-4 w-4" />,
    'PayrollExecuted': <Users className="h-4 w-4" />,
    'PayrollPaymentSettled': <CheckCircle className="h-4 w-4" />,
    'LeashCreated': <ActivityIcon className="h-4 w-4" />,
    'LeashRevoked': <XCircle className="h-4 w-4" />,
    'LeashPaused': <Clock className="h-4 w-4" />,
    'LeashResumed': <CheckCircle className="h-4 w-4" />,
  }

  const Icon = iconMap[event.event_type] || <ActivityIcon className="h-4 w-4" />
  const isPayment = event.event_type.includes('Payment')
  const isFunding = event.event_type.includes('Fund') || event.event_type.includes('Withdraw')
  const isApproval = event.event_type.includes('Approve') || event.event_type.includes('Reject')
  const isVigil = event.event_type.includes('Vigil')
  const isPayroll = event.event_type.includes('Payroll')

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
            {Icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-col gap-1 min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between">
              <h4 className="font-medium">{formatEventType(event.event_type)}</h4>
              <span className="truncate text-xs text-muted-foreground font-mono" title={event.transaction_hash}>{event.transaction_hash.slice(0, 12)}...</span>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mt-1">
              <span>Leash: <span className="font-mono">#{event.leash_id}</span></span>
              <span>{formatFullDate(BigInt(event.timestamp_ns))}</span>
            </div>
            <pre className="mt-2 text-xs text-muted-foreground bg-muted p-2 rounded overflow-x-auto max-h-32">
              {JSON.stringify(event.data, null, 2)}
            </pre>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function EventTypeSummary({ type, count }: { type: string; count: number }) {
  return (
    <Card>
      <CardContent className="p-6 text-center">
        <h3 className="font-mono text-3xl font-bold">{count}</h3>
        <p className="text-sm text-muted-foreground mt-1">{formatEventType(type)}</p>
      </CardContent>
    </Card>
  )
}

function formatEventType(type: string): string {
  return type
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim()
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
