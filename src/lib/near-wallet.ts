import { setupWalletSelector, type WalletModuleFactory, type WalletSelector } from '@near-wallet-selector/core'
import type { WalletSelectorModal } from '@near-wallet-selector/modal-ui'
import { setupModal } from '@near-wallet-selector/modal-ui'
import { NEAR_ENV } from './near-config'

let selector: WalletSelector | null = null
let modal: WalletSelectorModal | null = null
let initPromise: Promise<WalletSelector | null> | null = null

async function loadModules(): Promise<WalletModuleFactory[]> {
  const loaders: Array<{ name: string; load: () => Promise<WalletModuleFactory> }> = [
    {
      name: 'MyNearWallet',
      load: async () => {
        const mod = await import('@near-wallet-selector/my-near-wallet')
        return mod.setupMyNearWallet({ walletUrl: NEAR_ENV.walletUrl })
      },
    },
    {
      name: 'Meteor',
      load: async () => {
        const mod = await import('@near-wallet-selector/meteor-wallet')
        return mod.setupMeteorWallet()
      },
    },
    {
      name: 'Sender',
      load: async () => {
        const mod = await import('@near-wallet-selector/sender')
        return mod.setupSender()
      },
    },
    {
      name: 'HERE',
      load: async () => {
        const mod = await import('@near-wallet-selector/here-wallet')
        return mod.setupHereWallet()
      },
    },
  ]
  const results = await Promise.allSettled(loaders.map(({ load }) => load()))
  return results.flatMap((result, index) => {
    if (result.status === 'fulfilled') return [result.value]
    console.warn(`NEAR wallet adapter failed to load: ${loaders[index].name}`, result.reason)
    return []
  })
}

export async function initNearWallet(): Promise<WalletSelector | null> {
  if (selector) return selector
  if (initPromise) return initPromise
  if (!NEAR_ENV.contractId) return null
  initPromise = (async () => {
    try {
      const modules = await loadModules()
      if (modules.length === 0) {
        throw new Error('NEAR wallet selector could not load any supported wallet adapters.')
      }
      selector = await setupWalletSelector({
        network: {
          networkId: NEAR_ENV.networkId,
          nodeUrl: NEAR_ENV.nodeUrl,
          helperUrl: NEAR_ENV.helperUrl || '',
          explorerUrl: NEAR_ENV.explorerUrl,
          indexerUrl: NEAR_ENV.indexerUrl,
        },
        modules,
      })
      modal = setupModal(selector, {
        contractId: NEAR_ENV.contractId,
        description: 'Connect a NEAR wallet to manage Agent Leash.',
        theme: 'dark',
      })
      return selector
    } catch (e) {
      console.error('NEAR wallet selector init failed', e)
      selector = null
      modal = null
      throw e
    } finally {
      initPromise = null
    }
  })()
  return initPromise
}

export async function initNearWalletSafe(): Promise<{selector: WalletSelector | null; modalAvailable: boolean}> {
  const sec = await initNearWallet()
  return { selector: sec, modalAvailable: !!modal }
}

export function showNearWalletModal() {
  if (!modal) {
    throw new Error('The NEAR wallet connection dialog is unavailable. Please retry wallet initialization.')
  }
  modal.show()
}

export function hideNearWalletModal() {
  modal?.hide()
}

export function getNearSelector() {
  return selector
}
