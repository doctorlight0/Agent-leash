import { useQuery } from '@tanstack/react-query'
import { decodeEventLog, pad, toHex, type Address, type Hex } from 'viem'
import { agentLeashAbi } from '@/lib/agentLeashAbi'
import { LEASH_ADDRESS, publicClient } from '@/lib/chain'

export type EventKind =
  | 'LeashCreated'
  | 'Funded'
  | 'PayeeAdded'
  | 'PayeeRemoved'
  | 'LimitsUpdated'
  | 'Paid'
  | 'Queued'
  | 'Approved'
  | 'Rejected'
  | 'Revoked'
  | 'Withdrawn'
  | 'PayeeLimitsSet'
  | 'AutoApproveLimitSet'
  | 'PausedSet'
  | 'ScheduleCreated'
  | 'ScheduleExecuted'
  | 'ScheduleCancelled'

export interface LeashEvent {
  kind: EventKind
  blockNumber: bigint
  logIndex: number
  txHash: Hex
  args: Record<string, unknown>
}

export interface RequestInfo {
  requestId: number
  payee: Address
  amount: bigint
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  blockNumber: bigint
}

export interface DerivedEvents {
  events: LeashEvent[]
  payees: Address[]
  requests: RequestInfo[]
  totalFunded: bigint
  headBlock: bigint
}

interface RawLog {
  blockNumber: Hex
  logIndex: Hex
  transactionHash: Hex
  data: Hex
  topics: Hex[]
}

const cache = new Map<string, { events: LeashEvent[]; next: bigint }>()

async function fetchRange(id: bigint, from: bigint, to: bigint): Promise<RawLog[]> {
  const logs = await publicClient.request({
    method: 'eth_getLogs',
    params: [
      {
        address: LEASH_ADDRESS,
        fromBlock: toHex(from),
        toBlock: toHex(to),
        topics: [null, pad(toHex(id), { size: 32 })],
      },
    ],
  })
  return logs as unknown as RawLog[]
}

function decode(log: RawLog): LeashEvent | undefined {
  try {
    const parsed = decodeEventLog({ abi: agentLeashAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] })
    return {
      kind: parsed.eventName,
      blockNumber: BigInt(log.blockNumber),
      logIndex: Number(BigInt(log.logIndex)),
      txHash: log.transactionHash,
      args: (parsed.args ?? {}) as unknown as Record<string, unknown>,
    }
  } catch {
    return undefined
  }
}

async function scan(id: bigint, createdAtBlock: bigint): Promise<DerivedEvents> {
  const key = id.toString()
  const entry = cache.get(key) ?? { events: [], next: createdAtBlock }
  const head = await publicClient.getBlockNumber()
  let chunk = 5000n
  let from = entry.next
  while (from <= head) {
    const to = from + chunk - 1n > head ? head : from + chunk - 1n
    try {
      const logs = await fetchRange(id, from, to)
      for (const log of logs) {
        const ev = decode(log)
        if (ev) entry.events.push(ev)
      }
      from = to + 1n
    } catch (err) {
      chunk /= 2n
      if (chunk < 50n) throw err
    }
  }
  entry.next = head + 1n
  cache.set(key, entry)
  return derive(entry.events, head)
}

function derive(raw: LeashEvent[], headBlock: bigint): DerivedEvents {
  const events = [...raw].sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
  )
  const payees = new Set<Address>()
  const requests = new Map<number, RequestInfo>()
  let totalFunded = 0n
  for (const ev of events) {
    const a = ev.args
    if (ev.kind === 'PayeeAdded') payees.add((a.payee as Address).toLowerCase() as Address)
    if (ev.kind === 'PayeeRemoved') payees.delete((a.payee as Address).toLowerCase() as Address)
    if (ev.kind === 'Funded') totalFunded += a.amount as bigint
    if (ev.kind === 'Queued') {
      const requestId = Number(a.requestId)
      requests.set(requestId, {
        requestId,
        payee: a.payee as Address,
        amount: a.amount as bigint,
        reason: a.reason as string,
        status: 'pending',
        blockNumber: ev.blockNumber,
      })
    }
    if (ev.kind === 'Approved' || ev.kind === 'Rejected') {
      const r = requests.get(Number(a.requestId))
      if (r) r.status = ev.kind === 'Approved' ? 'approved' : 'rejected'
    }
  }
  return { events, payees: [...payees], requests: [...requests.values()], totalFunded, headBlock }
}

export function useLeashEvents(id: bigint, createdAtBlock: bigint | undefined) {
  return useQuery({
    queryKey: ['leash-events', id.toString()],
    enabled: createdAtBlock !== undefined,
    refetchInterval: 5000,
    retry: 1,
    queryFn: () => scan(id, createdAtBlock ?? 0n),
  })
}

const blockTimes = new Map<string, number>()

/** Block timestamps (seconds) for the given blocks, fetched once and cached. */
export function useBlockTimes(blocks: bigint[]) {
  const key = blocks.map((b) => b.toString()).join(',')
  return useQuery({
    queryKey: ['block-times', key],
    enabled: blocks.length > 0,
    queryFn: async () => {
      await Promise.all(
        blocks
          .filter((b) => !blockTimes.has(b.toString()))
          .map(async (b) => {
            const block = await publicClient.getBlock({ blockNumber: b })
            blockTimes.set(b.toString(), Number(block.timestamp))
          }),
      )
      return new Map(blockTimes)
    },
  })
}
