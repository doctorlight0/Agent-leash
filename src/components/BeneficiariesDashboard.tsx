import { useNear } from '@/hooks/useNear'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UserPlus, Shield, PieChart } from 'lucide-react'
import { formatAddress } from '@/lib/utils'
import { useState, useEffect } from 'react'

interface VigilBeneficiaryView {
  account_id: string
  share_percent: number
  entitlement: string
  claimed: boolean
  claimed_amount: string
}

interface VigilConfigSummary {
  leash_id: string
  enabled: boolean
  settlement_triggered: boolean
  settlement_completed: boolean
  beneficiaries: VigilBeneficiaryView[]
}

export function BeneficiariesDashboard() {
  const { connected, accountId, view, call } = useNear()
  const [configs, setConfigs] = useState<VigilConfigSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [leashIdInput, setLeashIdInput] = useState('')
  const [beneficiariesJson, setBeneficiariesJson] = useState('[\n  ["beneficiary.testnet", 100]\n]')

  useEffect(() => {
    if (connected && accountId) void load()
    else setLoading(false)
  }, [connected, accountId])

  const load = async () => {
    setLoading(true)
    try {
      const leashIdsResult: any = await view('list_owner_leashes', { owner_id: accountId })
      const ids: number[] = Array.isArray(leashIdsResult) ? leashIdsResult.map((x: any) => Number(x)) : []
      const out: VigilConfigSummary[] = []
      for (const id of ids) {
        try {
          const cfg: any = await view('get_vigil_config', { leash_id: id })
          if (cfg) {
            out.push({
              leash_id: String(id),
              enabled: !!cfg.enabled,
              settlement_triggered: !!cfg.settlement_triggered,
              settlement_completed: !!cfg.settlement_completed,
              beneficiaries: (cfg.beneficiaries || []).map((b: any) => ({
                account_id: b.account_id,
                share_percent: Number(b.share_percent || 0),
                entitlement: b.entitlement?.toString?.() || String(b.entitlement || '0'),
                claimed: !!b.claimed,
                claimed_amount: b.claimed_amount?.toString?.() || String(b.claimed_amount || '0'),
              })),
            })
          }
        } catch {}
      }
      setConfigs(out)
    } catch (e) {
      console.error(e)
      setConfigs([])
    } finally {
      setLoading(false)
    }
  }

  const setBeneficiaries = async () => {
    const leashId = parseInt(leashIdInput, 10)
    if (!Number.isFinite(leashId)) {
      toast.error('Enter a valid leash ID')
      return
    }
    let beneficiaries: [string, number][]
    try {
      beneficiaries = JSON.parse(beneficiariesJson)
      if (!Array.isArray(beneficiaries) || beneficiaries.length === 0) throw new Error('empty')
      const total = beneficiaries.reduce((s, [, p]) => s + Number(p), 0)
      if (total !== 100) throw new Error('shares must total 100')
    } catch (e) {
      toast.error('Beneficiaries must be JSON array of [account_id, share_percent] with total 100')
      return
    }
    setActionLoading('set')
    try {
      await call('set_vigil_beneficiaries', { leash_id: leashId, beneficiaries })
      toast.success('Beneficiaries submitted')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setActionLoading(null)
    }
  }

  const claim = async (leashId: number) => {
    setActionLoading(`claim-${leashId}`)
    try {
      await call('claim_vigil_entitlement', { leash_id: leashId })
      toast.success('Claim submitted', { description: 'Contract pays the connected wallet only if it is an entitled beneficiary.' })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setActionLoading(null)
    }
  }

  if (!connected) {
    return (
      <div className="text-center py-12">
        <UserPlus className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold">Connect Wallet</h2>
        <p className="text-muted-foreground">Connect your NEAR wallet to manage beneficiaries</p>
      </div>
    )
  }

  const all = configs.flatMap(c => c.beneficiaries.map(b => ({ ...b, leash_id: c.leash_id })))

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Beneficiaries</h1>
        <p className="text-muted-foreground">Vigil beneficiaries from on-chain config. Contract supports <code>set_vigil_beneficiaries</code> (owner, full list, 100% total) and <code>claim_vigil_entitlement</code> (beneficiary caller).</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Leashes with Vigil Config" value={configs.filter(c => c.enabled).length.toString()} icon={<Shield className="h-5 w-5" />} />
        <StatCard title="Beneficiary Entries" value={all.length.toString()} icon={<UserPlus className="h-5 w-5" />} />
        <StatCard title="Settlement Triggered" value={configs.filter(c => c.settlement_triggered).length.toString()} icon={<PieChart className="h-5 w-5" />} />
      </div>

      <Card>
        <CardHeader><CardTitle>Set Beneficiaries (Owner)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Provide leash ID and JSON array of <code>[account_id, share_percent]</code> pairs totaling 100. This replaces the full beneficiary list on-chain (only when settlement not triggered).</p>
          <input className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" placeholder="Leash ID" value={leashIdInput} onChange={e => setLeashIdInput(e.target.value)} />
          <textarea className="w-full min-h-[120px] rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm" value={beneficiariesJson} onChange={e => setBeneficiariesJson(e.target.value)} />
          <Button onClick={() => void setBeneficiaries()} disabled={actionLoading !== null || !leashIdInput.trim()}>Set beneficiaries</Button>
        </CardContent>
      </Card>

      {loading ? <Card><CardContent className="p-5 text-sm text-muted-foreground sm:p-8">Loading vigil configs…</CardContent></Card> : configs.length === 0 ? (
        <Card><CardContent className="p-5 text-center text-muted-foreground sm:p-12">No vigil configurations found for your leashes.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {configs.map(cfg => (
            <Card key={cfg.leash_id}>
              <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Leash #{cfg.leash_id}</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={cfg.enabled ? 'success' : 'secondary'}>{cfg.enabled ? 'Enabled' : 'Disabled'}</Badge>
                  {cfg.settlement_triggered && <Badge variant="warning">Settlement triggered</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {cfg.beneficiaries.length === 0 ? <p className="text-sm text-muted-foreground">No beneficiaries set.</p> : cfg.beneficiaries.map((b, i) => (
                  <div key={i} className="flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-mono" title={b.account_id}>{formatAddress(b.account_id)}</div>
                      <div className="text-muted-foreground">Share {b.share_percent}% · Entitlement {b.entitlement} · Claimed {b.claimed ? 'yes' : 'no'} ({b.claimed_amount})</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {b.account_id === accountId && !b.claimed && cfg.settlement_triggered && (
                        <Button size="sm" onClick={() => void claim(Number(cfg.leash_id))} disabled={actionLoading !== null}>Claim</Button>
                      )}
                    </div>
                  </div>
                ))}
                {cfg.settlement_triggered && (
                  <p className="text-xs text-muted-foreground">If you are a beneficiary on this leash, connect as that account and use Claim. Claims are finalized by token transfer callbacks.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="font-mono font-semibold text-lg">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
