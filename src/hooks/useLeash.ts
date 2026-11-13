import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { agentLeashAbi } from '@/lib/agentLeashAbi'
import { LEASH_ADDRESS, publicClient } from '@/lib/chain'

export interface LeashData {
  owner: Address
  expiresAt: bigint
  revoked: boolean
  agent: Address
  createdAt: bigint
  dailyCap: bigint
  perPaymentLimit: bigint
  balance: bigint
  createdAtBlock: bigint
  lastPaymentAt: bigint
  cooldown: number
  nextRequestId: number
  pendingCount: number
  balanceCap: bigint
  autoApproveLimit: bigint
  paused: boolean
  nextScheduleId: number
  activeSchedules: number
}

export interface ScheduleData {
  id: number
  payee: Address
  amount: bigint
  interval: bigint
  nextDue: bigint
  maxRuns: number
  runs: number
  active: boolean
}

export interface PayeeConfigData {
  allowed: boolean
  perPaymentLimit: bigint
  dailyCap: bigint
  spent: bigint
  periodStart: bigint
}

export interface LeashState {
  id: bigint
  leash: LeashData
  spent: bigint
  remainingDaily: bigint
}

export async function readLeash(id: bigint): Promise<LeashData> {
  const data = await publicClient.readContract({
    address: LEASH_ADDRESS,
    abi: agentLeashAbi,
    functionName: 'getLeash',
    args: [id],
  })
  return data
}

export function useLeash(id: bigint) {
  return useQuery({
    queryKey: ['leash', id.toString()],
    refetchInterval: 4000,
    retry: 1,
    queryFn: async (): Promise<LeashState> => {
      const [leash, spent, remainingDaily] = await Promise.all([
        readLeash(id),
        publicClient.readContract({ address: LEASH_ADDRESS, abi: agentLeashAbi, functionName: 'spentInWindow', args: [id] }),
        publicClient.readContract({ address: LEASH_ADDRESS, abi: agentLeashAbi, functionName: 'remainingDaily', args: [id] }),
      ])
      return { id, leash, spent, remainingDaily }
    },
  })
}

/** Newest leashes first, read straight from the contract (no log scanning). */
export function useRecentLeashes(limit = 8) {
  return useQuery({
    queryKey: ['recent-leashes', limit],
    refetchInterval: 15000,
    queryFn: async () => {
      const next = await publicClient.readContract({ address: LEASH_ADDRESS, abi: agentLeashAbi, functionName: 'nextLeashId' })
      const ids: bigint[] = []
      for (let i = next - 1n; i >= 1n && ids.length < limit; i--) ids.push(i)
      const leashes = await Promise.all(ids.map((id) => readLeash(id)))
      return ids.map((id, i) => ({ id, leash: leashes[i] }))
    },
  })
}

export function useSchedules(id: bigint, nextScheduleId: number | undefined) {
  return useQuery({
    queryKey: ['schedules', id.toString(), nextScheduleId],
    enabled: nextScheduleId !== undefined,
    refetchInterval: 6000,
    queryFn: async (): Promise<ScheduleData[]> => {
      const ids = Array.from({ length: Math.max(0, (nextScheduleId ?? 1) - 1) }, (_, i) => i + 1)
      const rows = await Promise.all(
        ids.map((sid) =>
          publicClient.readContract({ address: LEASH_ADDRESS, abi: agentLeashAbi, functionName: 'getSchedule', args: [id, sid] }),
        ),
      )
      return rows.map((r, i) => ({ id: ids[i], ...(r as unknown as Omit<ScheduleData, 'id'>) }))
    },
  })
}

export function usePayeeConfigs(id: bigint, payees: Address[]) {
  const key = payees.join(',')
  return useQuery({
    queryKey: ['payee-configs', id.toString(), key],
    enabled: payees.length > 0,
    refetchInterval: 8000,
    queryFn: async () => {
      const rows = await Promise.all(
        payees.map((p) =>
          publicClient.readContract({ address: LEASH_ADDRESS, abi: agentLeashAbi, functionName: 'payeeConfig', args: [id, p] }),
        ),
      )
      const map = new Map<string, PayeeConfigData>()
      rows.forEach((r, i) => map.set(payees[i].toLowerCase(), r))
      return map
    },
  })
}
