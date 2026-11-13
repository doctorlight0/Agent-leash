import { BaseError, ContractFunctionRevertedError } from 'viem'
import { usd } from './chain'

export interface Rejection {
  /** Custom error name from the contract, e.g. OverPerPaymentLimit. */
  name: string
  /** Short rule label. */
  rule: string
  /** Plain-English explanation. */
  detail: string
}

const n = (v: unknown): bigint => (typeof v === 'bigint' ? v : 0n)

const RULES: Record<string, (args: readonly unknown[]) => { rule: string; detail: string }> = {
  OverPerPaymentLimit: (a) => ({
    rule: 'Per-payment limit',
    detail: `Tried ${usd(n(a[0]))} USDC, but a single payment is capped at ${usd(n(a[1]))} USDC.`,
  }),
  OverDailyCap: (a) => ({
    rule: 'Daily cap',
    detail: `Tried ${usd(n(a[0]))} USDC, but only ${usd(n(a[1]))} USDC is left in the rolling 24 hour allowance.`,
  }),
  CooldownActive: (a) => ({
    rule: 'Cooldown',
    detail: `The agent must wait until ${new Date(Number(n(a[0])) * 1000).toLocaleTimeString()} before paying again.`,
  }),
  Expired: () => ({ rule: 'Expiry', detail: 'This leash has expired, so the agent can no longer act.' }),
  Revoked: () => ({ rule: 'Revoked', detail: 'The owner revoked this leash. The agent is permanently stopped.' }),
  ZeroReason: () => ({ rule: 'Reason required', detail: 'Every payment must explain why it is being made.' }),
  ReasonTooLong: () => ({ rule: 'Reason length', detail: 'The reason is longer than 280 bytes.' }),
  NotAgent: () => ({ rule: 'Agent only', detail: 'Only the agent address named on this leash can spend from it.' }),
  NotOwner: () => ({ rule: 'Owner only', detail: 'Only the owner of this leash can do that.' }),
  InsufficientBalance: (a) => ({
    rule: 'Balance',
    detail: `Needs ${usd(n(a[0]))} USDC but the leash only holds ${usd(n(a[1]))} USDC.`,
  }),
  BalanceCapExceeded: (a) => ({ rule: 'Balance cap', detail: `A leash can never hold more than its cap of ${usd(n(a[1]))} USDC.` }),
  WindowFull: () => ({ rule: 'Payment count', detail: 'The agent already made 32 payments in the last 24 hours.' }),
  TooManyPending: () => ({ rule: 'Pending requests', detail: 'There are already 20 requests waiting for approval.' }),
  ZeroAmount: () => ({ rule: 'Amount', detail: 'The amount must be greater than zero.' }),
  ZeroAddress: () => ({ rule: 'Address', detail: 'The zero address is not allowed.' }),
  ExpiryInPast: () => ({ rule: 'Expiry', detail: 'The expiry time must be in the future.' }),
  InvalidLimits: () => ({ rule: 'Limits', detail: 'Limits must be above zero and the per-payment limit cannot exceed the daily cap.' }),
  RequestNotPending: () => ({ rule: 'Request', detail: 'That request is no longer pending.' }),
  Paused: () => ({ rule: 'Paused', detail: 'The owner paused this leash. The agent cannot spend until it is resumed.' }),
  InvalidCap: () => ({ rule: 'Balance cap', detail: 'The balance cap must be above 0 and at most 1,000,000 USDC.' }),
  PayeeNotAllowed: () => ({ rule: 'Allowlist', detail: 'Add this payee to the allowlist first.' }),
  OverPayeeDailyCap: (a) => ({
    rule: 'Payee daily limit',
    detail: `Tried ${usd(n(a[0]))} USDC, but only ${usd(n(a[1]))} USDC is left for this payee today.`,
  }),
  TooManySchedules: () => ({ rule: 'Recurring payments', detail: 'A leash can have at most 20 active recurring payments.' }),
  ScheduleNotActive: () => ({ rule: 'Recurring payment', detail: 'That recurring payment is no longer active.' }),
  ScheduleNotDue: (a) => ({
    rule: 'Not due yet',
    detail: `The next payment is due at ${new Date(Number(n(a[0])) * 1000).toLocaleString()}.`,
  }),
  InvalidSchedule: () => ({ rule: 'Recurring payment', detail: 'The repeat interval must be between 1 hour and 366 days.' }),
  TooManyPayees: () => ({ rule: 'Payees', detail: 'At most 10 payees can be added when creating a leash.' }),
}

/** Decode a viem error into the contract rule that stopped it, if it was a contract revert. */
export function decodeRejection(err: unknown): Rejection | undefined {
  if (!(err instanceof BaseError)) return undefined
  const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError)
  if (!(reverted instanceof ContractFunctionRevertedError)) return undefined
  const name = reverted.data?.errorName
  if (!name) return undefined
  const make = RULES[name]
  const info = make ? make(reverted.data?.args ?? []) : { rule: name, detail: reverted.shortMessage }
  return { name, ...info }
}

export function isUserRejection(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return msg.includes('user rejected') || msg.includes('user denied') || msg.includes('rejected the request')
}

/** One-line message that is safe to show in the UI. */
export function friendlyError(err: unknown): string {
  const rej = decodeRejection(err)
  if (rej) return `${rej.rule}: ${rej.detail}`
  const msg = err instanceof Error ? err.message.toLowerCase() : ''
  if (msg.includes('insufficient funds') || msg.includes('exceeds balance')) {
    return 'Not enough USDC in this wallet to cover the amount and gas.'
  }
  if (msg.includes('network') || msg.includes('timeout') || msg.includes('fetch')) {
    return 'Network issue. Check your connection and try again.'
  }
  if (err instanceof BaseError) return err.shortMessage
  return 'Something went wrong. Please try again.'
}
