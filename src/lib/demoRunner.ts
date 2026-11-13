import type { Address, Hex } from 'viem'
import { agentLeashAbi } from './agentLeashAbi'
import { LEASH_ADDRESS, publicClient, usd } from './chain'
import { decodeRejection } from './errors'
import { demoAgentWallet, getDemoWorld } from './demo'
import { readLeash, type LeashData } from '@/hooks/useLeash'

export type Tone = 'ok' | 'reject' | 'queued' | 'info'

export interface LogLine {
  id: number
  tone: Tone
  title: string
  detail?: string
  code?: string
  hash?: Hex
}

export type Emit = (line: Omit<LogLine, 'id'>) => void

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const min = (a: bigint, b: bigint) => (a < b ? a : b)

/** Smallest practical demo amounts, in USDC base units. */
const CENTS = (n: bigint) => n * 10_000n

async function chainNow(): Promise<number> {
  const block = await publicClient.getBlock()
  return Number(block.timestamp)
}

interface PayArgs {
  leashId: bigint
  payee: Address
  amount: bigint
  reason: string
  sender?: Address
}

async function simulatePay(a: PayArgs) {
  return publicClient.simulateContract({
    account: a.sender ?? getDemoWorld().agent.address,
    address: LEASH_ADDRESS,
    abi: agentLeashAbi,
    functionName: 'pay',
    args: [a.leashId, a.payee, a.amount, a.reason],
  })
}

/** One real agent payment. Returns false when the contract rejects it. */
async function realPay(a: PayArgs, emit: Emit): Promise<boolean> {
  try {
    const sim = await simulatePay(a)
    const hash = await demoAgentWallet().writeContract({
      address: LEASH_ADDRESS,
      abi: agentLeashAbi,
      functionName: 'pay',
      args: [a.leashId, a.payee, a.amount, a.reason],
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new Error('reverted')
    if (sim.result === 0) {
      emit({ tone: 'ok', title: `Paid ${usd(a.amount)} USDC`, detail: `"${a.reason}"`, hash })
    } else {
      emit({
        tone: 'queued',
        title: `Payee is not on the allowlist: queued ${usd(a.amount)} USDC for approval`,
        detail: `"${a.reason}" (request #${sim.result}). No money moved.`,
        hash,
      })
    }
    return true
  } catch (err) {
    const rej = decodeRejection(err)
    emit(
      rej
        ? { tone: 'reject', title: `Contract rejected: ${rej.rule}`, detail: rej.detail, code: rej.name }
        : { tone: 'info', title: 'Demo agent could not send the payment', detail: err instanceof Error ? err.message.slice(0, 140) : undefined },
    )
    return false
  }
}

async function waitForCooldown(leash: LeashData, emit: Emit): Promise<boolean> {
  const availableAt = Number(leash.lastPaymentAt) + leash.cooldown
  if (leash.lastPaymentAt === 0n) return true
  let wait = availableAt - (await chainNow())
  if (wait <= 0) return true
  if (wait > 45) {
    emit({ tone: 'info', title: `Cooldown is active for another ${Math.ceil(wait / 60)} min`, detail: 'The demo agent stops here instead of waiting.' })
    return false
  }
  emit({ tone: 'info', title: `Waiting ${wait}s for the cooldown to pass` })
  while (wait > -1) {
    await sleep(1000)
    wait = availableAt - (await chainNow())
    if (wait <= 0) break
  }
  return true
}

export interface DemoContext {
  leashId: bigint
  allowlisted: Address[]
}

export async function runDemoAgent(ctx: DemoContext, emit: Emit) {
  const world = getDemoWorld()
  const demoPayees = world.payees.map((p) => p.address)
  const listed = ctx.allowlisted
  const unlisted = demoPayees.find((p) => !listed.some((l) => l.toLowerCase() === p.toLowerCase())) ?? demoPayees[2]
  const steps: { payee: Address; cents: bigint; reason: string }[] = [
    ...(listed.length > 0
      ? [
          { payee: listed[0], cents: 5n, reason: 'paid API usage' },
          { payee: listed[1] ?? listed[0], cents: 3n, reason: 'bought a price feed snapshot' },
        ]
      : []),
    { payee: unlisted, cents: 4n, reason: 'new data vendor, asking permission to pay' },
  ]

  for (const step of steps) {
    let leash = await readLeash(ctx.leashId)
    if (leash.revoked || Number(leash.expiresAt) <= (await chainNow())) {
      await realPay({ leashId: ctx.leashId, payee: step.payee, amount: CENTS(1n), reason: step.reason }, emit).catch(() => undefined)
      return
    }
    const isListed = listed.some((l) => l.toLowerCase() === step.payee.toLowerCase())
    if (isListed && !(await waitForCooldown(leash, emit))) continue
    leash = await readLeash(ctx.leashId)
    const amount = min(CENTS(step.cents), leash.perPaymentLimit)
    if (isListed && amount > leash.balance) {
      emit({ tone: 'info', title: 'Out of budget', detail: 'The leash balance is too low for another payment.' })
      continue
    }
    await realPay({ leashId: ctx.leashId, payee: step.payee, amount, reason: step.reason }, emit)
  }
  emit({ tone: 'info', title: 'Demo run finished' })
}

/** The agent deliberately tries to break each rule. Rejections come from simulating the call against the live contract. */
export async function runBiteTest(ctx: DemoContext, emit: Emit) {
  const world = getDemoWorld()
  const demoPayees = world.payees.map((p) => p.address)
  const leash = await readLeash(ctx.leashId)
  const remaining = await publicClient.readContract({ address: LEASH_ADDRESS, abi: agentLeashAbi, functionName: 'remainingDaily', args: [ctx.leashId] })
  const listed = ctx.allowlisted[0]
  const anyPayee = listed ?? demoPayees[2]
  const now = await chainNow()

  const attempt = async (title: string, a: PayArgs) => {
    emit({ tone: 'info', title: `Trying: ${title}` })
    try {
      const sim = await simulatePay(a)
      emit({
        tone: 'queued',
        title: sim.result === 0 ? 'The contract would have allowed this' : 'Not rejected: the payee is unlisted, so it would wait for approval',
        detail: 'Nothing was sent.',
      })
    } catch (err) {
      const rej = decodeRejection(err)
      emit(rej ? { tone: 'reject', title: `Rejected by the contract: ${rej.rule}`, detail: rej.detail, code: rej.name } : { tone: 'info', title: 'Could not run this attempt' })
    }
  }

  const small = min(CENTS(1n), leash.perPaymentLimit)

  if (leash.revoked || Number(leash.expiresAt) <= now) {
    await attempt('spend from a leash that is no longer active', { leashId: ctx.leashId, payee: anyPayee, amount: small, reason: 'one more payment' })
    return
  }

  await attempt('pay without giving a reason', { leashId: ctx.leashId, payee: anyPayee, amount: small, reason: '' })

  if (listed) {
    await attempt(`spend ${usd(leash.perPaymentLimit + 1n)} USDC in one payment (limit ${usd(leash.perPaymentLimit)})`, {
      leashId: ctx.leashId,
      payee: listed,
      amount: leash.perPaymentLimit + 1n,
      reason: 'big purchase',
    })
  } else {
    emit({ tone: 'info', title: 'Skipped the per-payment test', detail: 'Add a payee to the allowlist first. Payments to unlisted payees wait for approval instead.' })
  }

  if (listed && remaining < leash.perPaymentLimit) {
    await attempt(`spend past the daily cap (${usd(remaining)} USDC left today)`, { leashId: ctx.leashId, payee: listed, amount: remaining + 1n, reason: 'trying to exceed my daily budget' })
  } else if (listed) {
    emit({ tone: 'info', title: 'Skipped the daily cap test', detail: `A single payment can't pass the cap yet: ${usd(remaining)} USDC of daily allowance is left. Run the demo agent a few times, then try again.` })
  }

  if (listed && leash.cooldown > 0) {
    const availableAt = Number(leash.lastPaymentAt) + leash.cooldown
    const small2 = min(CENTS(1n), remaining)
    if (small2 === 0n) {
      emit({ tone: 'info', title: 'Skipped the cooldown test', detail: 'No daily allowance left, so the cap would stop it first.' })
    } else {
      if (leash.lastPaymentAt === 0n || availableAt <= now) {
        emit({ tone: 'info', title: 'Making one small real payment to start the cooldown' })
        const ok = await realPay({ leashId: ctx.leashId, payee: listed, amount: small2, reason: 'bite test: first payment' }, emit)
        if (!ok) return
      }
      await attempt('pay again right away', { leashId: ctx.leashId, payee: listed, amount: small2, reason: 'bite test: second payment too soon' })
    }
  } else if (listed) {
    emit({ tone: 'info', title: 'Skipped the cooldown test', detail: 'This leash has no cooldown.' })
  }

  await attempt('a stranger tries to spend the agent\'s money', {
    leashId: ctx.leashId,
    payee: anyPayee,
    amount: small,
    reason: 'definitely the agent',
    sender: demoPayees[0],
  })
  emit({ tone: 'info', title: 'Bite test finished' })
}
