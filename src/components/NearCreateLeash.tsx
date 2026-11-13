import { useState } from 'react'
import { toast } from 'sonner'
import { NEAR_ENV } from '@/lib/near-config'
import { fmtToken, parseToken } from '@/lib/near-format'
import { useNearSupportedTokenConfig, useNearSupportedTokens, useNearTokenMetadata } from '@/hooks/useNearLeash'
import { useNear } from '@/hooks/useNear'
import { useNearSend } from '@/hooks/useNearSend'
import { Button, Card, Field, SectionTitle } from './ui'

function successValue(result: unknown): string {
  if (!result || typeof result !== 'object' || !('status' in result)) return ''
  const status = result.status
  if (!status || typeof status !== 'object' || !('SuccessValue' in status)) return ''
  return typeof status.SuccessValue === 'string' ? atob(status.SuccessValue) : ''
}

export function NearCreateLeash() {
  const { connected, connect, accountId } = useNear()
  const { busy, call } = useNearSend()
  const [agentId, setAgentId] = useState('')
  const [tokenContractInput, setTokenContractInput] = useState<string | null>(NEAR_ENV.supportedTokenContracts[0] || null)
  const [balanceCap, setBalanceCap] = useState('1')
  const [storageDeposit, setStorageDeposit] = useState('0.1')
  const [perPayment, setPerPayment] = useState('1')
  const [rolling, setRolling] = useState('10')
  const [cooldownMin, setCooldownMin] = useState('1')
  const [expiresHours, setExpiresHours] = useState('168')
  const [approvalRequired, setApprovalRequired] = useState(false)
  const [payees, setPayees] = useState('')
  const supportedTokens = useNearSupportedTokens()
  const tokenContract = tokenContractInput ?? supportedTokens.data?.[0] ?? ''
  const metadata = useNearTokenMetadata(tokenContract.trim())
  const tokenConfig = useNearSupportedTokenConfig(tokenContract.trim())
  const decimals = metadata.data?.decimals
  const configuredDecimals = tokenConfig.data?.decimals
  const decimalsMatch = decimals !== undefined && configuredDecimals === decimals

  const submit = async () => {
    if (!agentId || !tokenContract) return toast.error('Agent and token contract are required')
    if (!supportedTokens.data) return toast.error('Unable to verify the contract token allowlist')
    if (!supportedTokens.data.includes(tokenContract.trim())) {
      return toast.error('Token contract is not enabled by the Agent Leash contract')
    }
    if (decimals === undefined || !tokenConfig.data) return toast.error('Waiting for verified token configuration')
    if (!decimalsMatch) return toast.error('Token metadata decimals do not match the contract administrator configuration')
    let args: Record<string, unknown>
    let deposit: string
    try {
      if (!/^\d+$/.test(cooldownMin) || !/^[1-9]\d*$/.test(expiresHours)) {
        throw new TypeError('Cooldown and expiry must be whole numbers');
      }
      const nowNs = BigInt(Date.now()) * 1000000n
      const maxU64 = (1n << 64n) - 1n
      const cooldownNs = BigInt(cooldownMin) * 60n * 1000000000n
      const expiresAtNs = nowNs + BigInt(expiresHours) * 3600n * 1000000000n
      const balanceCapRaw = parseToken(balanceCap, decimals)
      if (cooldownNs > maxU64 || expiresAtNs > maxU64) {
        throw new RangeError('Cooldown or expiry exceeds the contract timestamp range')
      }
      if (BigInt(balanceCapRaw) > BigInt(tokenConfig.data.max_balance_cap)) {
        throw new RangeError('Balance cap exceeds the configured one-million-token ceiling')
      }
      args = {
        agent_id: agentId.trim(),
        token_contract: tokenContract.trim(),
        per_payment_limit: parseToken(perPayment, decimals),
        rolling_limit: parseToken(rolling, decimals),
        rolling_window_ns: Number(24n * 60n * 60n * 1000000000n),
        cooldown_ns: Number(cooldownNs),
        expires_at_ns: Number(expiresAtNs),
        approval_required: approvalRequired,
        max_pending_payments: 20,
        initial_payees: payees.split(',').map((s) => s.trim()).filter(Boolean),
        balance_cap: balanceCapRaw,
      }
      deposit = parseToken(storageDeposit, 24)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      return
    }
    const res = await call('Create leash', 'create_leash', args, 80, deposit)
    const status = successValue(res)
    if (status) toast.success(`Leash created: ${status}`)
  }

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="display text-[26px] font-semibold leading-tight">Create a NEAR leash</h2>
        <p className="mt-1 text-sm text-muted">Uses the connected wallet ({accountId || 'not connected'}). Contract enforces all rules onchain.</p>
      </div>
      {!connected ? (
        <Button onClick={connect}>Connect NEAR Wallet</Button>
      ) : (
        <>
          <SectionTitle n="1" title="Agent and token" sub="Assign an agent account and a supported NEP-141 token contract." />
          <Field label="Agent account ID" value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="agent.testnet" autoCapitalize="off" spellCheck={false} />
          <Field label="Token contract" value={tokenContract} onChange={(e) => setTokenContractInput(e.target.value)} placeholder="token.testnet" autoCapitalize="off" spellCheck={false} hint={supportedTokens.data ? `On-chain allowlist: ${supportedTokens.data.join(', ') || 'empty'}` : supportedTokens.error ? 'Failed to read the on-chain token allowlist.' : 'Loading on-chain token allowlist…'} />
          {metadata.data && <p className="text-xs text-muted">{metadata.data.name} ({metadata.data.symbol}) · {decimals} decimals from NEP-141 metadata</p>}
          {metadata.error && <p className="text-xs text-danger">Token metadata unavailable: {(metadata.error as Error).message}</p>}
          {tokenConfig.data && <p className="text-xs text-muted">Administrator configuration: {tokenConfig.data.decimals} decimals · maximum {fmtToken(tokenConfig.data.max_balance_cap, tokenConfig.data.decimals)} tokens per leash.</p>}
          {metadata.data && tokenConfig.data && !decimalsMatch && <p className="text-xs text-danger">Decimal mismatch: token reports {decimals}, contract configuration records {configuredDecimals}. Creation is blocked.</p>}
          <SectionTitle n="2" title="Limits" sub="Amounts use verified NEP-141 decimals. Every supported token has the same one-million whole-token maximum, converted safely to base units on-chain." />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Per payment" inputMode="decimal" value={perPayment} onChange={(e) => setPerPayment(e.target.value)} />
            <Field label="Rolling 24h limit" inputMode="decimal" value={rolling} onChange={(e) => setRolling(e.target.value)} />
            <Field label="Cooldown (minutes)" inputMode="numeric" value={cooldownMin} onChange={(e) => setCooldownMin(e.target.value)} />
            <Field label="Expires in (hours)" inputMode="numeric" value={expiresHours} onChange={(e) => setExpiresHours(e.target.value)} />
            <Field label="Balance cap" inputMode="decimal" value={balanceCap} onChange={(e) => setBalanceCap(e.target.value)} />
            <Field label="Storage deposit (NEAR)" inputMode="decimal" value={storageDeposit} onChange={(e) => setStorageDeposit(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={approvalRequired} onChange={(e) => setApprovalRequired(e.target.checked)} /> Require owner approval for payments</label>
          <Field label="Initial payees (comma-separated)" value={payees} onChange={(e) => setPayees(e.target.value)} placeholder="vendor.testnet, api.testnet" autoCapitalize="off" spellCheck={false} />
          <Button onClick={submit} disabled={busy || !decimalsMatch || !supportedTokens.data || !tokenConfig.data}>{busy ? 'Submitting…' : 'Create leash'}</Button>
          <p className="text-xs text-muted">The attached NEAR deposit is charged against measured storage usage. Unused storage balance can be withdrawn later; increase the deposit if creation needs more storage.</p>
        </>
      )}
    </Card>
  )
}
