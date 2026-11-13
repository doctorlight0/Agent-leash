import { useNear } from '@/hooks/useNear'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ShieldCheck, Clock, AlertTriangle, CheckCircle, XCircle, UserPlus, Shield, Loader2, Plus, Trash2 } from 'lucide-react'
import { formatUSDC, formatAddress, formatRelativeTime, formatFullDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'

interface VigilConfig {
  enabled: boolean
  check_in_interval_ns: string
  grace_period_ns: string
  last_check_in_ns: string | null
  deadline_ns: string | null
  grace_deadline_ns: string | null
  beneficiaries: VigilBeneficiaryView[]
  settlement_triggered: boolean
  settlement_completed: boolean
  payroll_obligations_satisfied: boolean
  protected_balance: string
  overdue: boolean
}

interface VigilBeneficiaryView {
  account_id: string
  share_percent: number
  entitlement: string
  claimed: boolean
  claimed_amount: string
}

interface VigilConfigView {
  enabled: boolean
  check_in_interval_ns: string
  grace_period_ns: string
  last_check_in_ns: string
  deadline_ns: string
  grace_deadline_ns: string
  beneficiaries: VigilBeneficiaryView[]
  settlement_triggered: boolean
  settlement_completed: boolean
  payroll_obligations_satisfied: boolean
  protected_balance: string
}

export function VigilDashboard() {
  const { connected, accountId, view, call } = useNear()
  const [vigilConfigs, setVigilConfigs] = useState<Map<string, VigilConfig>>(new Map())
  const [leashes, setLeashes] = useState<LeashSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [selectedLeashId, setSelectedLeashId] = useState<string>('')
  const [activeVigilTab, setActiveVigilTab] = useState('config')
  const [beneficiaryInput, setBeneficiaryInput] = useState<string>('')
  const [shareInput, setShareInput] = useState<string>('')
  const [beneficiariesEdit, setBeneficiariesEdit] = useState<Array<{ account_id: string; share_percent: number }>>([])

  useEffect(() => {
    if (connected && accountId) {
      loadData()
    } else {
      setLoading(false)
    }
  }, [connected, accountId, view])

  const loadData = async () => {
    try {
      if (!accountId) {
        setLoading(false)
        return
      }
      const leashesResult = await view('list_owner_leashes', { owner_id: accountId })
      if (leashesResult && Array.isArray(leashesResult)) {
        const leashIds = leashesResult as number[]
        setLeashes(leashIds.map((id) => ({ id: String(id), agent: '', owner: accountId, balance: '0', daily_cap: '0', per_payment_limit: '0', monthly_cap: '0', monthly_spent: '0', paused: false, revoked: false, expires_at: '0', created_at: '0' })))
        if (leashIds.length > 0 && !selectedLeashId) {
          setSelectedLeashId(String(leashIds[0]))
        }

        for (const leashId of leashIds) {
          try {
            const vigilResult = await view('get_vigil_config', { leash_id: leashId })
            if (vigilResult) {
              const now = Date.now() * 1_000_000
              const config = vigilResult as VigilConfigView
              const overdue = config.enabled && !config.settlement_triggered && now > Number(config.grace_deadline_ns)
              setVigilConfigs(prev => new Map(prev).set(String(leashId), { ...config, overdue }))
            }
          } catch (e) {
            // Vigil not enabled for this leash
          }
        }
      }
    } catch (error) {
      console.error('Failed to load vigil data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (method: string, args: Record<string, unknown> = {}) => {
    setActionLoading(method)
    try {
      await call(method, { leash_id: selectedLeashId, ...args })
      await loadData()
    } catch (error) {
      console.error(`Failed to ${method}:`, error)
      toast.error(`Failed to ${method}: ${error}`)
    } finally {
      setActionLoading(null)
    }
  }

  const selectedConfig = vigilConfigs.get(selectedLeashId)
  const selectedBeneficiaries = selectedConfig?.beneficiaries || []

  if (!connected) {
    return (
      <div className="text-center py-12">
        <Shield className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold">Connect Wallet</h2>
        <p className="text-muted-foreground">Connect your NEAR wallet to configure vigil protection</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Vigil Protection</h1>
          <p className="text-muted-foreground">Configure inactivity protection with automatic beneficiary settlement</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {leashes.map((leash) => (
          <VigilLeashCard
            key={leash.id}
            leash={leash}
            config={vigilConfigs.get(leash.id)}
            selected={selectedLeashId === leash.id}
            onSelect={() => setSelectedLeashId(leash.id)}
          />
        ))}
        {leashes.length === 0 && (
          <Card className="md:col-span-3">
            <CardContent className="p-5 text-center sm:p-12">
              <Shield className="mx-auto h-12 w-12 text-muted-foreground" />
              <h2 className="mt-4 text-xl font-semibold">No Leashes</h2>
              <p className="text-muted-foreground">Create a leash first to configure vigil protection</p>
            </CardContent>
          </Card>
        )}
      </div>

      {selectedLeashId && (
        <Tabs value={activeVigilTab} onValueChange={setActiveVigilTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="beneficiaries">Beneficiaries</TabsTrigger>
            <TabsTrigger value="entitlements">Entitlements</TabsTrigger>
          </TabsList>

          <TabsContent value="config">
            <VigilConfigView
              config={selectedConfig}
              onAction={handleAction}
              loading={actionLoading}
              leashId={selectedLeashId}
            />
          </TabsContent>

          <TabsContent value="beneficiaries">
            <VigilBeneficiariesView
              beneficiaries={selectedBeneficiaries}
              onAction={handleAction}
              loading={actionLoading}
              leashId={selectedLeashId}
              beneficiaryInput={beneficiaryInput}
              setBeneficiaryInput={setBeneficiaryInput}
              shareInput={shareInput}
              setShareInput={setShareInput}
              beneficiariesEdit={beneficiariesEdit}
              setBeneficiariesEdit={setBeneficiariesEdit}
            />
          </TabsContent>

          <TabsContent value="entitlements">
            <VigilEntitlementsView
              beneficiaries={selectedBeneficiaries}
              onAction={handleAction}
              leashId={selectedLeashId}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

function VigilLeashCard({ leash, config, selected, onSelect }: { leash: LeashSummary; config: VigilConfig | undefined; selected: boolean; onSelect: () => void }) {
  const isOverdue = config?.overdue
  const enabled = config?.enabled

  return (
    <Card
      className={cn('cursor-pointer transition-all', selected && 'ring-2 ring-primary', isOverdue && 'border-destructive/30')}
      onClick={onSelect}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold">Leash #{leash.id}</h3>
            <p className="text-sm text-muted-foreground font-mono">{leash.agent.slice(0, 12)}...</p>
          </div>
          <Badge variant={isOverdue ? 'destructive' : enabled ? 'success' : 'secondary'}>
            {isOverdue ? 'OVERDUE' : enabled ? 'ACTIVE' : 'INACTIVE'}
          </Badge>
        </div>

        {config && (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Check-in Interval</span>
              <span className="font-medium">{(Number(config.check_in_interval_ns) / 1e9 / 3600).toFixed(1)}h</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Grace Period</span>
              <span className="font-medium">{(Number(config.grace_period_ns) / 1e9 / 3600).toFixed(1)}h</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Last Check-in</span>
              <span className="font-medium">{config.last_check_in_ns ? formatRelativeTime(BigInt(config.last_check_in_ns)) : 'Never'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Next Check-in</span>
              <span className="font-medium">{config.deadline_ns ? formatRelativeTime(BigInt(config.deadline_ns)) : 'N/A'}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function VigilConfigView({ config, onAction, loading, leashId }: { config: VigilConfig | undefined; onAction: Function; loading: string | null; leashId: string }) {
  const enabled = config?.enabled || false
  const isLoading = loading !== null

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Vigil Status</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Vigil Protection</p>
              <p className="text-sm text-muted-foreground">Automatic settlement if owner becomes inactive</p>
            </div>
            <Button
              variant={enabled ? 'default' : 'outline'}
              onClick={() => onAction(enabled ? 'disable_vigil' : 'enable_vigil', {
                check_in_interval_ns: (24 * 60 * 60 * 1e9).toString(),
                grace_period_ns: (7 * 24 * 60 * 60 * 1e9).toString(),
              })}
              disabled={isLoading}
              className="gap-1"
            >
              {enabled ? <ShieldCheck className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
              {enabled ? 'Disable' : 'Enable'}
            </Button>
          </div>

          {enabled && config && (
            <div className="space-y-3 pt-4 border-t">
              <DetailRow label="Check-in Interval" value={`${(Number(config.check_in_interval_ns) / 1e9 / 3600).toFixed(1)} hours`} />
              <DetailRow label="Grace Period" value={`${(Number(config.grace_period_ns) / 1e9 / 3600).toFixed(1)} hours`} />
              <DetailRow label="Last Check-in" value={config.last_check_in_ns ? formatFullDate(BigInt(config.last_check_in_ns)) : 'Never'} />
              <DetailRow label="Deadline" value={config.deadline_ns ? formatFullDate(BigInt(config.deadline_ns)) : 'N/A'} />
              <DetailRow label="Grace Deadline" value={config.grace_deadline_ns ? formatFullDate(BigInt(config.grace_deadline_ns)) : 'N/A'} />
              <DetailRow label="Status" value={config.overdue ? 'OVERDUE - Settlement Available' : 'Active'} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Check In</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Owner must check in periodically to prevent vigil activation</p>
          <Button
            onClick={() => onAction('vigil_check_in', {})}
            disabled={isLoading || !enabled}
            className="w-full gap-2"
          >
            <Clock className="h-4 w-4" />
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check In Now'}
          </Button>
        </CardContent>
      </Card>

      {enabled && config && config.overdue && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader><CardTitle className="text-destructive">Vigil Overdue</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-center text-destructive font-medium">Grace period has expired. Beneficiaries can now claim entitlements.</p>
            <p className="text-sm text-muted-foreground text-center">Payroll obligations are settled first, then remaining balance is distributed to beneficiaries.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function VigilBeneficiariesView({
  beneficiaries,
  onAction,
  loading,
  leashId,
  beneficiaryInput,
  setBeneficiaryInput,
  shareInput,
  setShareInput,
  beneficiariesEdit,
  setBeneficiariesEdit,
}: {
  beneficiaries: VigilBeneficiaryView[]
  onAction: Function
  loading: string | null
  leashId: string
  beneficiaryInput: string
  setBeneficiaryInput: (v: string) => void
  shareInput: string
  setShareInput: (v: string) => void
  beneficiariesEdit: Array<{ account_id: string; share_percent: number }>
  setBeneficiariesEdit: (v: Array<{ account_id: string; share_percent: number }>) => void
}) {
  const isLoading = loading !== null

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Beneficiaries</CardTitle>
        {beneficiaries.length > 0 && (
          <Button size="sm" onClick={() => setBeneficiariesEdit([...beneficiaries.map(b => ({ account_id: b.account_id, share_percent: b.share_percent }))])} disabled={isLoading}>
            <Plus className="h-4 w-4" />
            Edit All
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {beneficiaries.length === 0 ? (
          <div className="space-y-4 p-5 text-center sm:p-8">
            <p className="text-muted-foreground">No beneficiaries configured.</p>
            <p className="text-sm text-muted-foreground">Add beneficiaries with share percentages (must total 100%). They receive settlement if vigil activates.</p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-4">
              <input
                value={beneficiaryInput}
                onChange={(e) => setBeneficiaryInput(e.target.value)}
                placeholder="beneficiary.testnet"
                className="mono glass-inner min-h-[48px] min-w-0 flex-1 rounded-2xl px-3.5 text-xs outline-none focus:border-accent/70"
              />
              <input
                value={shareInput}
                onChange={(e) => setShareInput(e.target.value)}
                placeholder="share %"
                className="min-h-[48px] w-20 rounded-2xl px-3 text-xs outline-none focus:border-accent/70"
              />
              <Button size="sm" onClick={() => {
                const share = Number(shareInput)
                if (!beneficiaryInput.trim() || !share || share < 1 || share > 100) return
                setBeneficiariesEdit([...beneficiariesEdit, { account_id: beneficiaryInput.trim(), share_percent: share }])
                setBeneficiaryInput('')
                setShareInput('')
              }} disabled={isLoading || !beneficiaryInput.trim() || !shareInput}
              >
                Add
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {beneficiaries.map((beneficiary, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm">{formatAddress(beneficiary.account_id)}</span>
                  <Badge variant="outline" className="text-xs">{beneficiary.share_percent}%</Badge>
                  {beneficiary.entitlement !== '0' && (
                    <span className="text-xs text-muted">entitled: {formatUSDC(beneficiary.entitlement)}</span>
                  )}
                  {beneficiary.claimed && (
                    <Badge variant="success" className="text-xs">Claimed</Badge>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={() => {
                  const updated = beneficiaries.filter((_, idx) => idx !== i)
                  setBeneficiariesEdit(updated)
                  onAction('set_vigil_beneficiaries', { beneficiaries: updated.map(b => [b.account_id, b.share_percent]) })
                }} disabled={isLoading}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {beneficiariesEdit.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-muted mb-2">Total: {beneficiariesEdit.reduce((sum, b) => sum + b.share_percent, 0)}%</p>
                <Button size="sm" onClick={() => {
                  const total = beneficiariesEdit.reduce((sum, b) => sum + b.share_percent, 0)
                    if (total !== 100) {
                      toast.error('Beneficiary shares must total 100%')
                      return
                    }
                  onAction('set_vigil_beneficiaries', { beneficiaries: beneficiariesEdit.map(b => [b.account_id, b.share_percent]) })
                  setBeneficiariesEdit([])
                }} disabled={isLoading || beneficiariesEdit.reduce((sum, b) => sum + b.share_percent, 0) !== 100}
                >
                  Save Beneficiaries
                </Button>
                <Button size="sm" variant="outline" onClick={() => setBeneficiariesEdit([])}>Cancel</Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function VigilEntitlementsView({ beneficiaries, onAction, leashId }: { beneficiaries: VigilBeneficiaryView[]; onAction: Function; leashId: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>Settlement Entitlements</CardTitle></CardHeader>
      <CardContent>
        {beneficiaries.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No entitlements calculated yet. Vigil must be triggered for entitlements to be available.</p>
        ) : (
          <div className="space-y-2">
            {beneficiaries.map((entitlement, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm">{formatAddress(entitlement.account_id)}</span>
                  <span className="font-mono font-semibold">{formatUSDC(entitlement.entitlement)}</span>
                  <Badge variant={entitlement.claimed ? 'success' : 'warning'} className="text-xs">
                    {entitlement.claimed ? 'Claimed' : 'Claimable'}
                  </Badge>
                </div>
                {!entitlement.claimed && entitlement.entitlement !== '0' && (
                  <Button size="sm" variant="outline" onClick={() => onAction('claim_vigil_entitlement')}>
                    Claim
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  )
}

interface LeashSummary {
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
