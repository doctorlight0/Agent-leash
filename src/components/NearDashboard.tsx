import { useState } from 'react'
import { toast } from 'sonner'
import { useNear } from '@/hooks/useNear'
import { useNearSend } from '@/hooks/useNearSend'
import { useLeashView, useNearStorageBalance, useNearSupportedTokenConfig, useNearTokenMetadata, usePayments, useSchedules, useWithdrawals } from '@/hooks/useNearLeash'
import { fmtToken, nsToDate, parseToken, shortId } from '@/lib/near-format'
import { NEAR_ENV } from '@/lib/near-config'
import { Button, Card, Field } from './ui'

type View = Record<string, unknown>
const s = (v: unknown) => String(v ?? '')
export function NearDashboard({ id, readOnly }: { id: number; readOnly: boolean }) {
  const { accountId, connected } = useNear()
  const { data, isLoading, error } = useLeashView(id)
  const leash = data as View | null | undefined
  const payments = usePayments(id)
  const schedules = useSchedules(id)
  const withdrawals = useWithdrawals(id)
  const tokenMetadata = useNearTokenMetadata(s(data?.token_contract))
  const tokenConfig = useNearSupportedTokenConfig(s(data?.token_contract))
  const storageBalance = useNearStorageBalance(accountId)
  const { busy, call, fund } = useNearSend()
  const [fundAmount, setFundAmount] = useState('1')
  const [payee, setPayee] = useState('')
  const [payAmount, setPayAmount] = useState('0.1')
  const [reason, setReason] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('0.1')
  const [storageTopUp, setStorageTopUp] = useState('0.1')
  const [newAgent, setNewAgent] = useState('')
  const [newPayee, setNewPayee] = useState('')
  const [autoApprove, setAutoApprove] = useState('0')
  const [scheduleRecipient, setScheduleRecipient] = useState('')
  const [scheduleAmount, setScheduleAmount] = useState('0.1')
  const [scheduleDelayMinutes, setScheduleDelayMinutes] = useState('5')
  const [scheduleIntervalHours, setScheduleIntervalHours] = useState('0')
  const [scheduleMaxRuns, setScheduleMaxRuns] = useState('1')

  if (isLoading) return <Card>Loading leash #{id}…</Card>
  if (error || !leash) return <Card className="text-danger">Failed to load leash: {(error as Error)?.message || 'not found'}</Card>

  const isOwner = !!accountId && accountId === s(leash.owner_id)
  const isAgent = !!accountId && accountId === s(leash.agent_id)
  const canManage = !readOnly && connected && isOwner
  const canAgent = !readOnly && connected && isAgent
  const run = async (label: string, method: string, args: Record<string, unknown>) => { await call(label, method, args) }
  const decimals = tokenMetadata.data?.decimals
  const decimalsVerified = decimals !== undefined && tokenConfig.data?.decimals === decimals
  const formatAmount = (raw: string) => decimals === undefined ? `${raw} base units` : fmtToken(raw, decimals)
  const parseAmount = (input: string) => {
    if (!decimalsVerified || decimals === undefined) {
      toast.error('Token decimals are not verified against the contract configuration')
      return null
    }
    try {
      return parseToken(input, decimals)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      return null
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <h1 className="display text-2xl font-semibold sm:text-3xl">Leash #{id}</h1>
        <p className="text-sm text-muted">Owner {shortId(s(leash.owner_id))} · Agent {shortId(s(leash.agent_id))} · Token {shortId(s(leash.token_contract))}</p>
        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div className="glass-inner rounded-xl p-3"><div className="text-muted">Available</div><div className="font-semibold">{formatAmount(s(leash.available_balance) || '0')}</div></div>
          <div className="glass-inner rounded-xl p-3"><div className="text-muted">Reserved</div><div className="font-semibold">{formatAmount(s(leash.reserved_balance) || '0')}</div></div>
          <div className="glass-inner rounded-xl p-3"><div className="text-muted">Per payment</div><div className="font-semibold">{formatAmount(s(leash.per_payment_limit) || '0')}</div></div>
          <div className="glass-inner rounded-xl p-3"><div className="text-muted">Rolling limit</div><div className="font-semibold">{formatAmount(s(leash.rolling_limit) || '0')}</div></div>
        </div>
        {tokenMetadata.data && <p className="text-xs text-muted">{tokenMetadata.data.symbol} · {decimals} decimals (NEP-141)</p>}
        {tokenConfig.data && <p className="text-xs text-muted">On-chain token configuration: {tokenConfig.data.decimals} decimals · cap {fmtToken(tokenConfig.data.max_balance_cap, tokenConfig.data.decimals)}</p>}
        {tokenMetadata.data && tokenConfig.data && !decimalsVerified && <p className="text-xs text-danger">Token metadata/configuration mismatch. Amount transactions are disabled.</p>}
        {tokenMetadata.error && <p className="text-xs text-danger">Token metadata unavailable: {(tokenMetadata.error as Error).message}</p>}
        <p className="text-xs text-muted">Expires {nsToDate(s(leash.expires_at_ns))} · Approval {String(leash.approval_required)} · Paused {String(leash.paused)} · Revoked {String(leash.revoked)}</p>
      </Card>
      {canManage && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Owner actions</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label={`NEAR storage available (${s(storageBalance.data?.available || '0')} yoctoNEAR)`} value={storageTopUp} onChange={(e)=>setStorageTopUp(e.target.value)} />
            <div className="flex items-end"><Button size="sm" disabled={busy} onClick={()=>{
              try {
                const amount = parseToken(storageTopUp, 24)
                void call('Deposit NEAR storage', 'storage_deposit', { account_id: null, registration_only: false }, 30, amount)
              } catch (error) {
                toast.error(error instanceof Error ? error.message : String(error))
              }
            }}>Add storage</Button></div>
          </div>
          <Button size="sm" variant="outline" disabled={busy || !storageBalance.data?.available || storageBalance.data.available === '0'} onClick={()=>void call('Withdraw available NEAR storage', 'storage_withdraw', { amount: null }, 30, '1')}>Withdraw available storage balance</Button>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label={`Fund amount (${decimals ?? '?'} token decimals)`} value={fundAmount} onChange={(e)=>setFundAmount(e.target.value)} />
            <div className="flex items-end"><Button disabled={busy || !decimalsVerified} onClick={()=>{
              const amount = parseAmount(fundAmount)
              if (amount) void fund('Fund leash', s(leash.token_contract), id, amount)
            }}>Fund via ft_transfer_call</Button></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={()=>run(leash.paused?'Resume':'Pause', leash.paused?'resume_leash':'pause_leash', {leash_id:id})}>{leash.paused?'Resume':'Pause'}</Button>
            <Button size="sm" variant="outline" disabled={busy || Boolean(leash.revoked)} onClick={()=>run('Revoke leash and refund available balance', 'revoke', {leash_id:id})}>Revoke + refund</Button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Withdraw amount" value={withdrawAmount} onChange={(e)=>setWithdrawAmount(e.target.value)} />
            <div className="flex items-end"><Button size="sm" disabled={busy || !decimalsVerified} onClick={()=>{
              const amount = parseAmount(withdrawAmount)
              if (amount) void run('Withdraw available', 'withdraw_available', {leash_id:id, amount, recipient:null})
            }}>Withdraw available</Button></div>
          </div>
          <p className="text-xs text-muted">Withdrawals are callback-finalized; reserved funds cannot be withdrawn.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="New agent account" value={newAgent} onChange={(e)=>setNewAgent(e.target.value)} placeholder="agent.testnet" />
            <div className="flex items-end"><Button size="sm" variant="outline" disabled={busy || !newAgent.trim()} onClick={()=>void run('Rotate agent', 'set_agent', {leash_id:id, agent_id:newAgent.trim()})}>Set agent</Button></div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Payee account" value={newPayee} onChange={(e)=>setNewPayee(e.target.value)} placeholder="vendor.testnet" />
            <div className="flex items-end gap-2"><Button size="sm" variant="outline" disabled={busy || !newPayee.trim()} onClick={()=>void run('Add payee', 'add_payee', {leash_id:id, payee:newPayee.trim()})}>Add</Button><Button size="sm" variant="outline" disabled={busy || !newPayee.trim()} onClick={()=>void run('Remove payee', 'remove_payee', {leash_id:id, payee:newPayee.trim()})}>Remove</Button></div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Auto-approve limit" value={autoApprove} onChange={(e)=>setAutoApprove(e.target.value)} />
            <div className="flex items-end"><Button size="sm" variant="outline" disabled={busy || !decimalsVerified} onClick={()=>{ const amount=parseAmount(autoApprove); if(amount!==null) void run('Set auto-approve limit','set_auto_approve_limit',{leash_id:id,amount}) }}>Update</Button></div>
          </div>
          <Button size="sm" variant="outline" disabled={busy} onClick={()=>void run(leash.approval_required?'Disable required approvals':'Require owner approvals','update_permissions',{leash_id:id,per_payment_limit:s(leash.per_payment_limit),rolling_limit:s(leash.rolling_limit),cooldown_ns:Number(leash.cooldown_ns),expires_at_ns:leash.expires_at_ns ?? null,approval_required:!Boolean(leash.approval_required),max_pending_payments:Number(leash.max_pending_payments)})}>{leash.approval_required?'Disable required approvals':'Require owner approvals'}</Button>
        </Card>
      )}
      {canAgent && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Agent actions</h2>
          <Field label="Recipient (allowlisted)" value={payee} onChange={(e)=>setPayee(e.target.value)} placeholder="vendor.testnet" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Amount" value={payAmount} onChange={(e)=>setPayAmount(e.target.value)} />
            <Field label="Reason" value={reason} onChange={(e)=>setReason(e.target.value)} />
          </div>
          <Button disabled={busy || !decimalsVerified} onClick={async ()=>{ if (!payee) return toast.error('Recipient required'); const amount = parseAmount(payAmount); if (!amount) return; await run('Request payment', 'request_payment', {leash_id:id, recipient: payee.trim(), amount, reason: reason || null, approval_expires_at_ns: null}); }}>Request payment</Button>
        </Card>
      )}
      {!readOnly && connected && (isOwner || isAgent) && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Create schedule</h2>
          <Field label="Recipient" value={scheduleRecipient} onChange={(e)=>setScheduleRecipient(e.target.value)} placeholder="vendor.testnet" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Amount" value={scheduleAmount} onChange={(e)=>setScheduleAmount(e.target.value)} />
            <Field label="Start after (minutes)" value={scheduleDelayMinutes} onChange={(e)=>setScheduleDelayMinutes(e.target.value)} />
            <Field label="Repeat interval (hours; 0 = once)" value={scheduleIntervalHours} onChange={(e)=>setScheduleIntervalHours(e.target.value)} />
            <Field label="Maximum runs (0 = unlimited recurring)" value={scheduleMaxRuns} onChange={(e)=>setScheduleMaxRuns(e.target.value)} />
          </div>
          <Button disabled={busy || !decimalsVerified || !scheduleRecipient.trim()} onClick={()=>{
            const amount=parseAmount(scheduleAmount); if(!amount) return
            try {
              const delay=BigInt(scheduleDelayMinutes); const interval=BigInt(scheduleIntervalHours); const maxRuns=Number(scheduleMaxRuns)
              if(delay<0n || interval<0n || !Number.isSafeInteger(maxRuns) || maxRuns<0) throw new Error('Schedule timing and run count must be non-negative whole numbers')
              const executeAfter=(BigInt(Date.now())*1000000n)+(delay*60n*1000000000n)
              void run('Create schedule','create_schedule',{leash_id:id,recipient:scheduleRecipient.trim(),amount,execute_after_ns:Number(executeAfter),expires_at_ns:null,reason:reason||null,interval_ns:Number(interval*60n*60n*1000000000n),max_runs:maxRuns})
            } catch(error) { toast.error(error instanceof Error ? error.message : String(error)) }
          }}>Create schedule</Button>
        </Card>
      )}
      <Card className="space-y-2">
        <h2 className="font-semibold">Payments</h2>
        {((payments.data as View[])||[]).length === 0 && <p className="text-sm text-muted">No payments.</p>}
        {((payments.data as View[])||[]).map((p)=> (
          <div key={s(p.payment_id)} className="rounded-xl border border-white/10 p-3 text-sm">
            <div className="flex items-center justify-between gap-2"><span>#{s(p.payment_id)} → {shortId(s(p.recipient))}</span><span className="text-xs">{s(p.status)}</span></div>
            <div className="text-muted">{formatAmount(s(p.amount)||'0')} · reserved {String(p.reserved)} {p.reason ? `· ${s(p.reason)}` : ''}</div>
            {canManage && s(p.status) === 'PendingApproval' && (
              <div className="mt-2 flex gap-2">
                <Button size="sm" disabled={busy} onClick={()=>run('Approve payment', 'approve_payment', {leash_id:id, payment_id:Number(p.payment_id)})}>Approve</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={()=>run('Reject payment', 'reject_payment', {leash_id:id, payment_id:Number(p.payment_id)})}>Reject</Button>
              </div>
            )}
          </div>
        ))}
      </Card>
      <Card className="space-y-2">
        <h2 className="font-semibold">Schedules / withdrawals</h2>
        <p className="text-xs text-muted">Schedules: {((schedules.data as View[])||[]).length}. Withdrawals: {((withdrawals.data as View[])||[]).length}. Supported token config: {NEAR_ENV.supportedTokenContracts.join(', ') || 'not configured'}.</p>
        {((schedules.data as View[])||[]).map((schedule)=> (<div key={s(schedule.schedule_id)} className="rounded-xl border border-white/10 p-2 text-xs"><div>Schedule #{s(schedule.schedule_id)} · {formatAmount(s(schedule.amount)||'0')} · runs {s(schedule.runs)}/{s(schedule.max_runs)||'∞'} · {schedule.active?'active':'terminal'}</div>{!readOnly && connected && Boolean(schedule.active) && <div className="mt-2 flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>void run('Execute schedule','execute_schedule',{leash_id:id,schedule_id:Number(schedule.schedule_id)})}>Execute if due</Button>{(isOwner || accountId===s(schedule.creator)) && <Button size="sm" variant="outline" disabled={busy} onClick={()=>void run('Cancel schedule','cancel_schedule',{leash_id:id,schedule_id:Number(schedule.schedule_id)})}>Cancel</Button>}</div>}</div>))}
        {((withdrawals.data as View[])||[]).map((w)=> (<div key={s(w.withdrawal_id)} className="rounded-xl border border-white/10 p-2 text-xs">Withdrawal #{s(w.withdrawal_id)} · {formatAmount(s(w.amount)||'0')} · {s(w.status)} · reserved {String(w.reserved)}</div>))}
      </Card>
      {!connected && <Card className="text-sm text-muted">Connect a NEAR wallet for owner/agent actions.</Card>}
    </div>
  )
}
