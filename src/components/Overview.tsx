import { useNear } from '@/hooks/useNear'
import { LeashSummary } from '@/components/LeashSummary'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { WalletButton } from '@/components/WalletButton'
import { navigate } from '@/lib/router'
import { Plus, Shield, CreditCard, Users, ArrowDownToLine, CheckCircle, ShieldCheck, UserPlus, Activity, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'

interface LeashSummaryData {
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

const quickActions = [
  { name: 'Create Leash', href: '/leashes/new', icon: Shield, description: 'Set up AI agent spending limits' },
  { name: 'Payroll', href: '/payroll', icon: CreditCard, description: 'Manage automated monthly payments' },
  { name: 'Workers', href: '/workers', icon: Users, description: 'Add and manage payroll workers' },
  { name: 'Funding', href: '/funding', icon: ArrowDownToLine, description: 'Deposit and withdraw tokens' },
  { name: 'Approvals', href: '/approvals', icon: CheckCircle, description: 'Review pending agent requests' },
  { name: 'Vigil', href: '/vigil', icon: ShieldCheck, description: 'Configure inactivity protection' },
  { name: 'Beneficiaries', href: '/beneficiaries', icon: UserPlus, description: 'Set up settlement recipients' },
  { name: 'Activity', href: '/activity', icon: Activity, description: 'View transaction history' },
  { name: 'Settings', href: '/settings', icon: Settings, description: 'Configure preferences' },
] as const

export function Overview() {
  const { connected, accountId, view } = useNear()
  const [leashes, setLeashes] = useState<LeashSummaryData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (connected && accountId) {
      void loadLeashes()
    } else {
      setLeashes([])
      setLoading(false)
    }
  }, [connected, accountId])

  const loadLeashes = async () => {
    setLoading(true)
    try {
      const leashIdsResult: any = await view('list_owner_leashes', { owner_id: accountId })
      if (!Array.isArray(leashIdsResult)) {
        setLeashes([])
        return
      }
      const leashIds = leashIdsResult.map((id: any) => Number(id))
      const details: LeashSummaryData[] = []
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
      setLeashes([])
    } finally {
      setLoading(false)
    }
  }

  if (!connected) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 py-4 sm:space-y-8 sm:py-8">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Agent Leash</h1>
          <p className="text-base text-muted-foreground sm:text-lg">
            AI Agent Spending Controls with Payroll & Inactivity Protection on NEAR
          </p>
        </div>
        <Card className="border-border p-4 text-center sm:p-6">
          <CardContent className="space-y-4 pt-6">
            <h2 className="text-xl font-semibold">Connect your NEAR wallet to get started</h2>
            <p className="text-muted-foreground">Create leashes, manage payroll, and configure vigil protection with real on-chain actions.</p>
            <div className="flex justify-center"><WalletButton /></div>
            <p className="text-xs text-muted-foreground">Supported adapters (when available): MyNearWallet, Meteor, Sender, HERE. Install an extension or choose a web wallet in the modal.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Overview</h1>
          <p className="text-muted-foreground">Manage your AI agent spending controls, payroll, and vigil protection</p>
        </div>
        <Button onClick={() => navigate('/leashes/new')} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Leash
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {quickActions.map((action) => (
          <button key={action.name} onClick={() => navigate(action.href)} className={cn('h-full text-left transition-all hover:shadow-lg', 'cursor-pointer')}>
            <Card className="h-full">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <action.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{action.name}</h3>
                    <p className="text-sm text-muted-foreground">{action.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading your leashes…</p>
      ) : leashes.length > 0 ? (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Your Leashes</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate('/leashes')}>View All</Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {leashes.slice(0, 6).map((leash) => (
              <LeashSummary key={leash.id} leash={leash} />
            ))}
          </div>
        </section>
      ) : (
        <Card>
          <CardContent className="space-y-3 p-5 text-center sm:p-8">
            <p className="text-muted-foreground">No leashes found for this account.</p>
            <Button onClick={() => navigate('/leashes/new')} className="gap-2"><Plus className="h-4 w-4" />Create your first leash</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
