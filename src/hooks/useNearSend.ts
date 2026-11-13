import { useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useNear } from './useNear'
import { NEAR_ENV } from '@/lib/near-config'

type TxResult = { status?: { Failure?: unknown; SuccessValue?: string }; transaction?: { hash?: string }; transaction_outcome?: { id?: string; outcome?: { status?: { Failure?: unknown } } } }

function txStatus(result: unknown): { ok: boolean; message: string } {
  if (!result) return { ok: false, message: 'No wallet result returned' }
  const r = result as TxResult
  const failure = r?.status?.Failure || r?.transaction_outcome?.outcome?.status?.Failure
  if (failure) return { ok: false, message: typeof failure === 'string' ? failure : JSON.stringify(failure) }
  return { ok: true, message: r?.transaction?.hash || r?.transaction_outcome?.id || 'submitted' }
}

export function useNearSend() {
  const { call, callToken, connected } = useNear()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)

  async function send(label: string, fn: () => Promise<unknown>) {
    if (!connected) throw new Error('Connect a NEAR wallet first')
    setBusy(true)
    try {
      const res = await fn()
      const st = txStatus(res)
      if (!st.ok) throw new Error(st.message)
      toast.success(`${label} submitted`, { description: st.message })
      await qc.invalidateQueries()
      return res
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/reject|denied|cancel/i.test(msg)) toast.error('Transaction cancelled')
      else toast.error(label + ' failed', { description: msg })
      throw e
    } finally {
      setBusy(false)
    }
  }

  return {
    busy,
    call: (label: string, method: string, args: Record<string, unknown>, gasTgas?: number, deposit?: string) =>
      send(label, () => call(method, args, deposit, gasTgas ? (gasTgas * 1_000_000_000_000).toString() : undefined)),
    /** Fund via NEP-141 ft_transfer_call (contract receives in ft_on_transfer). */
    fund: (label: string, token: string, leashId: number, amount: string) =>
      send(label, () => {
        if (!NEAR_ENV.contractId) throw new Error('NEAR contract ID not configured')
        return callToken(token, 'ft_transfer_call', {
          receiver_id: NEAR_ENV.contractId,
          amount,
          msg: JSON.stringify({ Fund: { leash_id: leashId } }),
        }, '1', '80000000000000')
      }),
  }
}

export function useNearTokenSend() {
  const { callToken, connected } = useNear()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)

  async function send(label: string, fn: () => Promise<unknown>) {
    if (!connected) throw new Error('Connect a NEAR wallet first')
    setBusy(true)
    try {
      const res = await fn()
      const st = txStatus(res)
      if (!st.ok) throw new Error(st.message)
      toast.success(`${label} submitted`, { description: st.message })
      await qc.invalidateQueries()
      return res
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/reject|denied|cancel/i.test(msg)) toast.error('Transaction cancelled')
      else toast.error(label + ' failed', { description: msg })
      throw e
    } finally {
      setBusy(false)
    }
  }

  return {
    busy,
    fund: (label: string, token: string, leashId: number, amount: string) =>
      send(label, () => {
        if (!NEAR_ENV.contractId) throw new Error('NEAR contract ID not configured')
        return callToken(token, 'ft_transfer_call', {
          receiver_id: NEAR_ENV.contractId,
          amount,
          msg: JSON.stringify({ Fund: { leash_id: leashId } }),
        }, '1', '80000000000000')
      }),
  }
}