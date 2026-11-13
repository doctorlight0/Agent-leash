import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { actionCreators, type WalletSelector } from '@near-wallet-selector/core'
import { NEAR_ENV } from '@/lib/near-config'
import { viewFunction } from '@/lib/near-client'
import {
  initNearWalletSafe,
  showNearWalletModal,
  hideNearWalletModal,
  getNearSelector,
} from '@/lib/near-wallet'

interface NearContextType {
  connected: boolean
  connecting: boolean
  accountId: string | null
  selector: WalletSelector | null
  networkId: string
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  view: (method: string, args: Record<string, unknown>) => Promise<unknown>
  call: (method: string, args: Record<string, unknown>, deposit?: string, gas?: string) => Promise<unknown>
  callToken: (tokenContract: string, method: string, args: Record<string, unknown>, deposit?: string, gas?: string) => Promise<unknown>
  ready: boolean
  error: string | null
}

const NearContext = createContext<NearContextType | null>(null)

const DEFAULT_GAS = '300000000000000'

export function NearWalletProvider({ children }: { children: ReactNode }) {
  const [selector, setSelector] = useState<WalletSelector | null>(null)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let subscription: { unsubscribe: () => void } | null = null

    const init = async () => {
      try {
        if (!NEAR_ENV.contractId) {
          setReady(true)
          return
        }
        const { selector: ws, modalAvailable } = await initNearWalletSafe()
        if (cancelled) return
        if (!ws) {
          setError(modalAvailable ? 'Wallet selector unavailable.' : 'No NEAR wallet extension detected. Install MyNearWallet, Meteor, Sender, or HERE for testnet.')
          setReady(true)
          return
        }
        setSelector(ws)
        const syncState = (state: ReturnType<WalletSelector['store']['getState']>) => {
          const active = state.accounts.find((a) => a.active) ?? state.accounts[0] ?? null
          setAccountId(active?.accountId ?? null)
          setConnected(!!active?.accountId)
        }
        syncState(ws.store.getState())
        subscription = ws.store.observable.subscribe(syncState)
        setReady(true)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setReady(true)
        }
      }
    }

    void init()
    return () => {
      cancelled = true
      subscription?.unsubscribe()
    }
  }, [])

  const connect = useCallback(async () => {
    setError(null)
    setConnecting(true)
    try {
      let ws = selector || getNearSelector()
      if (!ws) {
        const { selector: newWs } = await initNearWalletSafe()
        ws = newWs
      }
      if (!ws) {
        throw new Error('No wallet adapters could be initialized. Refresh the page or use a supported NEAR web wallet.')
      }
      if (!selector) {
        setSelector(ws)
      }
      try {
        showNearWalletModal()
      } catch (e) {
        // Modal may not be available on first try; re-init will set it next time
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setConnecting(false)
    }
  }, [selector])

  const disconnect = useCallback(async () => {
    const ws = selector || getNearSelector()
    if (!ws) {
      setAccountId(null)
      setConnected(false)
      return
    }
    setError(null)
    try {
      const wallet = await ws.wallet()
      await wallet.signOut()
      hideNearWalletModal()
      setAccountId(null)
      setConnected(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [selector])

  const view = useCallback(async (method: string, args: Record<string, unknown>) => {
    try {
      return await viewFunction(method, args)
    } catch (e) {
      console.error('View call failed:', method, e)
      return null
    }
  }, [])

  const call = useCallback(async (method: string, args: Record<string, unknown>, deposit = '0', gas = DEFAULT_GAS) => {
    const ws = selector || getNearSelector()
    if (!ws) throw new Error('Wallet not initialized')
    const wallet = await ws.wallet()
    if (!NEAR_ENV.contractId) throw new Error('NEAR contract ID not configured')
    const action = actionCreators.functionCall(method, args, BigInt(gas), BigInt(deposit))
    return wallet.signAndSendTransaction({
      receiverId: NEAR_ENV.contractId,
      actions: [action],
    })
  }, [selector])

  const callToken = useCallback(async (tokenContract: string, method: string, args: Record<string, unknown>, deposit = '0', gas = DEFAULT_GAS) => {
    const ws = selector || getNearSelector()
    if (!ws) throw new Error('Wallet not initialized')
    const wallet = await ws.wallet()
    const action = actionCreators.functionCall(method, args, BigInt(gas), BigInt(deposit))
    return wallet.signAndSendTransaction({
      receiverId: tokenContract,
      actions: [action],
    })
  }, [selector])

  const value = useMemo(() => ({
    connected,
    connecting,
    accountId,
    selector,
    networkId: NEAR_ENV.networkId,
    connect,
    disconnect,
    view,
    call,
    callToken,
    ready,
    error,
  }), [connected, connecting, accountId, selector, connect, disconnect, view, call, callToken, ready, error])

  return <NearContext.Provider value={value}>{children}</NearContext.Provider>
}

export function useNear() {
  const context = useContext(NearContext)
  if (!context) {
    throw new Error('useNear must be used within NearWalletProvider')
  }
  return context
}