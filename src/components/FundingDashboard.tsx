import { useNear } from '@/hooks/useNear'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowDownToLine, ArrowUpFromLine, DollarSign, Loader2 } from 'lucide-react'
import { NEAR_ENV } from '@/lib/near-config'
import { fmtToken, parseToken } from '@/lib/near-format'
import { viewAccountFunction } from '@/lib/near-client'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface LeashSummary {
  id: string
  agent: string
  owner: string
  balance: string
  token_contract: string
  per_payment_limit: string
  monthly_cap: string
  monthly_spent: string
  paused: boolean
  revoked: boolean
  expires_at: string
  created_at: string
}

export function FundingDashboard() {
  const { connected, accountId, view, call, callToken } = useNear()
  const [leashes, setLeashes] = useState<LeashSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [selectedLeashId, setSelectedLeashId] = useState<string>('')
  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [tokenDecimals, setTokenDecimals] = useState<number | null>(null)

  useEffect(() => {
    if (connected && accountId) {
      void loadLeashes()
    } else {
      setLeashes([])
      setSelectedLeashId('')
      setLoading(false)
    }
  }, [connected, accountId])

  useEffect(() => {
    const leash = leashes.find(l => l.id === selectedLeashId)
    if (!leash?.token_contract) {
      setTokenDecimals(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const meta = await viewAccountFunction<{ decimals: number }>(leash.token_contract, 'ft_metadata')
        if (!cancelled && typeof meta?.decimals === 'number') setTokenDecimals(meta.decimals)
      } catch {
        if (!cancelled) setTokenDecimals(null)
      }
    })()
    return () => { cancelled = true }
  }, [selectedLeashId, leashes])

  const loadLeashes = async () => {
    setLoading(true)
    try {
      const result: any = await view('list_owner_leashes', { owner_id: accountId })
      if (result && Array.isArray(result)) {
        const ids = result.map((id: any) => String(id))
        await loadLeashDetails(ids)
      } else {
        setLeashes([])
      }
    } catch (error) {
      console.error('Failed to load leashes:', error)
      setLeashes([])
    } finally {
      setLoading(false)
    }
  }

  const loadLeashDetails = async (ids: string[]) => {
    const details: LeashSummary[] = []
    for (const id of ids) {
      try {
        const result: any = await view('get_leash', { leash_id: parseInt(id, 10) })
        if (result) {
          details.push({
            id: String(result.leash_id),
            agent: result.agent_id,
            owner: result.owner_id,
            balance: result.available_balance?.toString() || '0',
            token_contract: result.token_contract || '',
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
        console.error('Failed to load leash', id, e)
      }
    }
    setLeashes(details)
    if (details.length > 0 && !selectedLeashId) {
      setSelectedLeashId(details[0].id)
    }
  }

  const selectedLeash = leashes.find(l => l.id === selectedLeashId)

  const formatAmount = (raw: string) => tokenDecimals == null ? `${raw} base units` : fmtToken(raw, tokenDecimals)
  const parseAmount = (input: string) => {
    if (tokenDecimals == null) throw new Error('Token decimals unavailable. Ensure token metadata can be read.')
    return parseToken(input, tokenDecimals)
  }

  const handleDeposit = async () => {
    if (!depositAmount || !selectedLeashId || !selectedLeash) return
    setActionLoading('deposit')
    try {
      const token = selectedLeash.token_contract || (NEAR_ENV.supportedTokenContracts[0] ?? '')
      if (!token) throw new Error('No token contract configured for this leash')
      const amount = parseAmount(depositAmount)
      await callToken(token, 'ft_transfer_call', {
        receiver_id: NEAR_ENV.contractId,
        amount,
        msg: JSON.stringify({ Fund: { leash_id: parseInt(selectedLeashId, 10) } }),
      }, '1', '80000000000000')
      toast.success('Deposit submitted', { description: 'Funding uses NEP-141 ft_transfer_call; final balance updates after on-chain settlement.' })
      await loadLeashes()
      setDepositAmount('')
    } catch (error) {
      console.error('Failed to deposit:', error)
      toast.error(`Failed to deposit: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setActionLoading(null)
    }
  }

  const handleWithdraw = async () => {
    if (!withdrawAmount || !selectedLeashId) return
    setActionLoading('withdraw')
    try {
      const amount = parseAmount(withdrawAmount)
      await call('withdraw_available', { leash_id: parseInt(selectedLeashId, 10), amount, recipient: null })
      toast.success('Withdrawal submitted', { description: 'Withdrawal is callback-finalized on-chain.' })
      await loadLeashes()
      setWithdrawAmount('')
    } catch (error) {
      console.error('Failed to withdraw:', error)
      toast.error(`Failed to withdraw: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setActionLoading(null)
    }
  }

  if (!connected) {
    return (
      <div className="text-center py-12">
        <DollarSign className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold">Connect Wallet</h2>
        <p className="text-muted-foreground">Connect your NEAR wallet to manage funding</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Funding</h1>
          <p className="text-muted-foreground">Deposit and withdraw supported NEP-141 tokens from your leashes</p>
        </div>
      </div>

      {loading ? (
        <Card><CardContent className="p-5 text-sm text-muted-foreground sm:p-8">Loading leashes…</CardContent></Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {leashes.map((leash) => (
              <Card
                key={leash.id}
                className={cn('cursor-pointer transition-all', selectedLeashId === leash.id && 'ring-2 ring-primary')}
                onClick={() => setSelectedLeashId(leash.id)}
              >
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold">Leash #{leash.id}</h3>
                      <p className="text-sm text-muted-foreground font-mono truncate " title={leash.agent}>{leash.agent}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-sm">Available</span>
                      <span className="font-mono text-sm font-semibold">{formatAmount(leash.balance)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Token</span>
                      <span className="font-mono text-xs truncate " title={leash.token_contract}>{leash.token_contract || '—'}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {leashes.length === 0 && (
              <Card className="md:col-span-3">
                <CardContent className="p-5 text-center sm:p-12">
                  <DollarSign className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h2 className="mt-4 text-xl font-semibold">No Leashes</h2>
                  <p className="text-muted-foreground">Create a leash first to manage funding</p>
                </CardContent>
              </Card>
            )}
          </div>

          {selectedLeash && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Deposit (NEP-141)</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Amount ({tokenDecimals == null ? 'token decimals unknown' : `${tokenDecimals} decimals`})</label>
                    <Input
                      type="text"
                      placeholder="100.00"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      disabled={actionLoading !== null}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Uses <code>ft_transfer_call</code> on <span className="font-mono">{selectedLeash.token_contract || 'configured token'}</span> with <code>{`{"Fund":{"leash_id":${selectedLeash.id}}}`}</code>. Requires 1 yoctoNEAR deposit on the token call (wallet signs).
                  </p>
                  <Button
                    onClick={() => void handleDeposit()}
                    disabled={actionLoading !== null || !depositAmount || tokenDecimals == null}
                    className="w-full gap-2"
                  >
                    {actionLoading === 'deposit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
                    Deposit
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Withdraw</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Amount</label>
                    <Input
                      type="text"
                      placeholder="50.00"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      disabled={actionLoading !== null}
                    />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Available: <span className="font-mono">{formatAmount(selectedLeash.balance)}</span>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => void handleWithdraw()}
                    disabled={actionLoading !== null || !withdrawAmount || tokenDecimals == null}
                    className="w-full gap-2"
                  >
                    {actionLoading === 'withdraw' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
                    Withdraw
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}
