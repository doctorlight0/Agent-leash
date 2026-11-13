import { createWalletClient, http, type Address, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import { CHAIN, RPC_URL } from './chain'

/**
 * The demo world lives only in this browser (localStorage): one agent key and a few payee keys.
 * These are throwaway testnet keys that only ever hold small amounts of test USDC for gas.
 */
const STORAGE_KEY = 'agent-leash:demo-world:v1'

export const DEMO_PAYEE_LABELS = ['Demo API provider', 'Demo data feed', 'Demo unlisted payee'] as const

interface Stored {
  agent: Hex
  payees: Hex[]
}

function load(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Stored
      if (parsed.agent && parsed.payees?.length === DEMO_PAYEE_LABELS.length) return parsed
    }
  } catch {
    // fall through and create a fresh world
  }
  const fresh: Stored = {
    agent: generatePrivateKey(),
    payees: DEMO_PAYEE_LABELS.map(() => generatePrivateKey()),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh))
  return fresh
}

export interface DemoWorld {
  agent: PrivateKeyAccount
  payees: { label: string; address: Address }[]
}

export function getDemoWorld(): DemoWorld {
  const stored = load()
  return {
    agent: privateKeyToAccount(stored.agent),
    payees: stored.payees.map((key, i) => ({
      label: DEMO_PAYEE_LABELS[i],
      address: privateKeyToAccount(key).address,
    })),
  }
}

export function demoAgentWallet() {
  return createWalletClient({ account: getDemoWorld().agent, chain: CHAIN, transport: http(RPC_URL) })
}

export function payeeLabel(address: string): string | undefined {
  const lower = address.toLowerCase()
  return getDemoWorld().payees.find((p) => p.address.toLowerCase() === lower)?.label
}

export function isDemoAgent(address: string): boolean {
  return getDemoWorld().agent.address.toLowerCase() === address.toLowerCase()
}
