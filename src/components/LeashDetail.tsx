import { useNear } from '@/hooks/useNear'
import { toast } from 'sonner'
import { navigate } from '@/lib/router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Shield,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  DollarSign,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Edit,
  ExternalLink,
  Plus,
  Loader2,
} from 'lucide-react'
import { formatUSDC, formatAddress, formatRelativeTime, formatFullDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { useRoute } from '@/lib/router'

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
  auto_approve_limit: string
  cooldown: string
  balance_cap: string
  allowlist: AllowlistEntry[]
  payees: PayeeEntry[]
  payee_limits: PayeeLimitEntry[]
}

interface AllowlistEntry {
  payee: string
  per_payment_limit: string
  daily_limit: string
}

interface PayeeEntry {
  id: string
  account: string
  label: string
}

interface PayeeLimitEntry {
  payee: string
  per_payment_override: string
  daily_override: string
}

export function LeashDetail({ id, readOnly }: { id: number; readOnly?: boolean }) {
  const { connected, accountId, view, call } = useNear()
  const route = useRoute()
  const [leash, setLeash] = useState<LeashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    if (connected) {
      loadLeash()
    } else {
      setLoading(false)
    }
  }, [connected, view])

  const loadLeash = async () => {
    try {
      const result = await view('get_leash', { leash_id: id })
      if (result) {
        setLeash(result as LeashData)
      }
    } catch (error) {
      console.error('Failed to load leash:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (
    method: string,
    args: Record<string, unknown> = {},
  ) => {
    setActionLoading(method)
    try {
      await call(method, { leash_id: id, ...args })
      await loadLeash()
    } catch (error) {
      console.error(`Failed to ${method}:`, error)
      toast.error(`Failed to ${method}: ${error}`)
    } finally {
      setActionLoading(null)
    }
  }

  if (!connected) {
    return (
      <div className="text-center py-12">
        <Shield className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold">Connect Wallet</h2>
        <p className="text-muted-foreground">Connect your NEAR wallet to view leash details</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/4" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6 h-24 bg-muted" />
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (!leash) {
    return (
      <div className="text-center py-12">
        <Shield className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="mt-4 text-xl font-semibold">Leash not found</h2>
        <p className="text-muted-foreground">
          Leash #{id} does not exist or you don't have access
        </p>
      </div>
    )
  }

  const isExpired = leash.expires_at && BigInt(leash.expires_at) < BigInt(Date.now() * 1_000_000)
  const isActive = !leash.revoked && !isExpired && !leash.paused
  const isOwner = leash.owner === accountId

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Leash #{leash.id}</h1>
            {readOnly && (
              <Badge variant="outline" className="text-xs">Read Only</Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            Agent: <span className="font-mono">{formatAddress(leash.agent)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              isActive
                ? 'success'
                : leash.revoked
                  ? 'destructive'
                  : isExpired
                    ? 'warning'
                    : leash.paused
                      ? 'secondary'
                      : 'default'
            }
            className="text-sm px-3 py-1"
          >
            {leash.revoked ? 'Revoked' : isExpired ? 'Expired' : leash.paused ? 'Paused' : 'Active'}
          </Badge>
          {isOwner && !readOnly && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handleAction(leash.paused ? 'resume_leash' : 'pause_leash')
                }
                disabled={!!(actionLoading || leash.revoked || isExpired)}
                className="gap-1"
              >
                {leash.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {leash.paused ? 'Resume' : 'Pause'}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (
                    confirm(
                      'This action cannot be undone. Are you sure you want to revoke this leash?',
                    )
                  ) {
                    handleAction('revoke')
                  }
                }}
                disabled={!!(actionLoading || leash.revoked)}
                className="gap-1"
              >
                <Trash2 className="h-4 w-4" />
                Revoke
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Available Balance"
          value={formatUSDC(leash.balance)}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <StatCard
          title="Daily Cap"
          value={formatUSDC(leash.daily_cap)}
          icon={<Shield className="h-5 w-5" />}
        />
        <StatCard
          title="Per Payment Limit"
          value={formatUSDC(leash.per_payment_limit)}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          title="Monthly Cap"
          value={`${formatUSDC(leash.monthly_spent)} / ${formatUSDC(leash.monthly_cap || '0')}`}
          icon={<RotateCcw className="h-5 w-5" />}
        />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="allowlist">Allowlist</TabsTrigger>
          <TabsTrigger value="payees">Payees</TabsTrigger>
          <TabsTrigger value="limits">Per-Payee Limits</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <DetailRow
                  label="Auto-Approve Limit"
                  value={formatUSDC(leash.auto_approve_limit || '0')}
                />
                <DetailRow label="Cooldown" value={`${Number(leash.cooldown) / 60} min`} />
                <DetailRow label="Balance Cap" value={formatUSDC(leash.balance_cap)} />
                <DetailRow label="Created" value={formatFullDate(BigInt(leash.created_at))} />
                {leash.expires_at && (
                  <DetailRow label="Expires" value={formatFullDate(BigInt(leash.expires_at))} />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Monthly Spending</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <DetailRow label="Monthly Cap" value={formatUSDC(leash.monthly_cap || '0')} />
                <DetailRow label="Monthly Spent" value={formatUSDC(leash.monthly_spent)} />
                <DetailRow
                  label="Remaining"
                  value={formatUSDC(
                    BigInt(leash.monthly_cap || '0') - BigInt(leash.monthly_spent),
                  )}
                />
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${leash.monthly_cap && BigInt(leash.monthly_cap) > 0
                        ? Number(
                          (BigInt(leash.monthly_spent) * 100n) /
                            BigInt(leash.monthly_cap),
                        )
                        : 0}%`,
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="allowlist">
          <AllowlistView
            leash={leash}
            onAction={handleAction}
            loading={actionLoading}
            isOwner={isOwner}
            readOnly={readOnly}
          />
        </TabsContent>

        <TabsContent value="payees">
          <PayeesView
            leash={leash}
            onAction={handleAction}
            loading={actionLoading}
            isOwner={isOwner}
            readOnly={readOnly}
          />
        </TabsContent>

        <TabsContent value="limits">
          <PayeeLimitsView
            leash={leash}
            onAction={handleAction}
            loading={actionLoading}
            isOwner={isOwner}
            readOnly={readOnly}
          />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsView
            leash={leash}
            onAction={handleAction}
            loading={actionLoading}
            isOwner={isOwner}
            readOnly={readOnly}
          />
        </TabsContent>
      </Tabs>
    </div>
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b py-2 last:border-0 min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  )
}

function AllowlistView({
  leash,
  onAction,
  loading,
  isOwner,
  readOnly,
}: {
  leash: LeashData
  onAction: Function
  loading: string | null
  isOwner: boolean
  readOnly?: boolean
}) {
  const [newPayee, setNewPayee] = useState('')

  const addPayee = async () => {
    if (!newPayee.trim()) return
    await onAction('add_payee', { payee: newPayee.trim() })
    setNewPayee('')
  }

  const removePayee = async (payee: string) => {
    if (confirm(`Remove ${formatAddress(payee)} from the allowlist?`)) {
      await onAction('remove_payee', { payee })
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Allowlist</CardTitle>
        {isOwner && !readOnly && (
          <div className="flex w-full flex-col gap-2 min-[390px]:flex-row sm:w-auto">
            <input
              type="text"
              placeholder="Payee account ID"
              value={newPayee}
              onChange={(e) => setNewPayee(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm sm:w-48"
              onKeyPress={(e) => e.key === 'Enter' && addPayee()}
            />
            <Button
              size="sm"
              onClick={addPayee}
              disabled={loading !== null || !newPayee.trim()}
              className="gap-1"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {(!leash.allowlist || leash.allowlist.length === 0) ? (
          <p className="text-muted-foreground text-center py-8">
            No payees in allowlist
          </p>
        ) : (
          <div className="space-y-2">
            {leash.allowlist.map((entry, i) => (
              <div key={i} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <span className="font-mono text-sm">{formatAddress(entry.payee)}</span>
                  <Badge variant="outline" className="text-xs">
                    {formatUSDC(entry.per_payment_limit)} per payment
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {formatUSDC(entry.daily_limit)} daily
                  </Badge>
                </div>
                {isOwner && !readOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removePayee(entry.payee)}
                    disabled={loading !== null}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PayeesView({
  leash,
  onAction,
  loading,
  isOwner,
  readOnly,
}: {
  leash: LeashData
  onAction: Function
  loading: string | null
  isOwner: boolean
  readOnly?: boolean
}) {
  const [newPayee, setNewPayee] = useState('')
  const [newLabel, setNewLabel] = useState('')

  const addPayee = async () => {
    if (!newPayee.trim()) return
    await onAction('add_payee', { payee: newPayee.trim() })
    setNewPayee('')
    setNewLabel('')
  }

  const removePayee = async (payee: string) => {
    if (confirm(`Remove ${formatAddress(payee)} from payees?`)) {
      await onAction('remove_payee', { payee })
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Payees</CardTitle>
        {isOwner && !readOnly && (
          <div className="grid w-full grid-cols-1 gap-2 min-[390px]:grid-cols-2 sm:flex sm:w-auto sm:items-center">
            <input
              type="text"
              placeholder="Payee account ID"
              value={newPayee}
              onChange={(e) => setNewPayee(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm sm:w-40"
              onKeyPress={(e) => e.key === 'Enter' && addPayee()}
            />
            <input
              type="text"
              placeholder="Label (optional)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm sm:w-32"
            />
            <Button
              size="sm"
              onClick={addPayee}
              disabled={loading !== null || !newPayee.trim()}
              className="gap-1"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {(!leash.payees || leash.payees.length === 0) ? (
          <p className="text-muted-foreground text-center py-8">
            No payees configured
          </p>
        ) : (
          <div className="space-y-2">
            {leash.payees.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <span className="font-medium">{entry.label || 'Unnamed'}</span>
                  <span className="font-mono text-sm text-muted-foreground">
                    {formatAddress(entry.account)}
                  </span>
                </div>
                {isOwner && !readOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removePayee(entry.account)}
                    disabled={loading !== null}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PayeeLimitsView({
  leash,
  onAction,
  loading,
  isOwner,
  readOnly,
}: {
  leash: LeashData
  onAction: Function
  loading: string | null
  isOwner: boolean
  readOnly?: boolean
}) {
  const [limitPayee, setLimitPayee] = useState('')
  const [perPaymentLimit, setPerPaymentLimit] = useState('')
  const [dailyLimit, setDailyLimit] = useState('')

  const setLimits = async () => {
    if (!limitPayee.trim()) return
    await onAction('set_payee_limits', {
      payee: limitPayee.trim(),
      per_payment_limit: perPaymentLimit || '0',
      daily_cap: dailyLimit || '0',
    })
    setLimitPayee('')
    setPerPaymentLimit('')
    setDailyLimit('')
  }

  const removeOverride = async (payee: string) => {
    if (confirm(`Remove per-payee limits for ${formatAddress(payee)}?`)) {
      await onAction('set_payee_limits', {
        payee,
        per_payment_limit: '0',
        daily_cap: '0',
      })
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Per-Payee Overrides</CardTitle>
        {isOwner && !readOnly && (
          <div className="grid w-full grid-cols-1 gap-2 min-[390px]:grid-cols-2 sm:flex sm:w-auto sm:items-center">
            <input
              type="text"
              placeholder="Payee account ID"
              value={limitPayee}
              onChange={(e) => setLimitPayee(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm sm:w-40"
            />
            <input
              type="text"
              placeholder="Per-payment (USDC)"
              value={perPaymentLimit}
              onChange={(e) => setPerPaymentLimit(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm sm:w-24"
            />
            <input
              type="text"
              placeholder="Daily (USDC)"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm sm:w-24"
            />
            <Button
              size="sm"
              onClick={setLimits}
              disabled={loading !== null || !limitPayee.trim()}
              className="gap-1"
            >
              Set Limit
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {(!leash.payee_limits || leash.payee_limits.length === 0) ? (
          <p className="text-muted-foreground text-center py-8">
            No per-payee overrides configured
          </p>
        ) : (
          <div className="space-y-2">
            {leash.payee_limits.map((entry, i) => (
              <div key={i} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <span className="font-mono text-sm">{formatAddress(entry.payee)}</span>
                  {entry.per_payment_override !== '0' && (
                    <Badge variant="outline" className="text-xs">
                      Per-payment: {formatUSDC(entry.per_payment_override)}
                    </Badge>
                  )}
                  {entry.daily_override !== '0' && (
                    <Badge variant="outline" className="text-xs">
                      Daily: {formatUSDC(entry.daily_override)}
                    </Badge>
                  )}
                </div>
                {isOwner && !readOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeOverride(entry.payee)}
                    disabled={loading !== null}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SettingsView({
  leash,
  onAction,
  loading,
  isOwner,
  readOnly,
}: {
  leash: LeashData
  onAction: Function
  loading: string | null
  isOwner: boolean
  readOnly?: boolean
}) {
  const [autoApprove, setAutoApprove] = useState(formatUSDC(leash.auto_approve_limit || '0'))
  const [cooldown, setCooldown] = useState(String(Number(leash.cooldown) / 60))

  const saveSettings = async () => {
    await onAction('set_auto_approve_limit', { amount: autoApprove || '0' })
    await onAction('update_permissions', {
      per_payment_limit: leash.per_payment_limit,
      rolling_limit: leash.daily_cap,
      cooldown_ns: String(Number(cooldown) * 60),
      expires_at_ns: leash.expires_at || null,
      approval_required: false,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Leash Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Auto-Approve Limit</label>
            <input
              type="text"
              value={autoApprove}
              onChange={(e) => setAutoApprove(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2"
              disabled={!isOwner || readOnly || loading !== null}
            />
            <p className="text-xs text-muted-foreground">
              Zero disables auto-approval. Cannot exceed per-payment limit.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Cooldown (minutes)</label>
            <input
              type="number"
              value={cooldown}
              onChange={(e) => setCooldown(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2"
              disabled={!isOwner || readOnly || loading !== null}
            />
          </div>
        </div>
        {isOwner && !readOnly && (
          <Button
            onClick={saveSettings}
            disabled={loading !== null}
            className="w-full"
          >
            {loading === 'set_auto_approve_limit' || loading === 'update_permissions' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Save Changes
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
