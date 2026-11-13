import { useSyncExternalStore } from 'react'
import { getDemoWorld } from './demo'
import { IS_MAINNET, short } from './chain'

/** Friendly names for addresses, saved only in this browser. */
const KEY = 'agent-leash:payee-names:v1'
const listeners = new Set<() => void>()
let cache: Record<string, string> | undefined

function read(): Record<string, string> {
  if (cache) return cache
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>
  } catch {
    cache = {}
  }
  return cache
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function setPayeeName(address: string, name: string) {
  const next = { ...read() }
  const trimmed = name.trim().slice(0, 40)
  if (trimmed) next[address.toLowerCase()] = trimmed
  else delete next[address.toLowerCase()]
  cache = next
  localStorage.setItem(KEY, JSON.stringify(next))
  listeners.forEach((l) => l())
}

function nameOf(address: string): string | undefined {
  const saved = read()[address.toLowerCase()]
  if (saved) return saved
  if (IS_MAINNET) return undefined
  return getDemoWorld().payees.find((p) => p.address.toLowerCase() === address.toLowerCase())?.label
}

/** Re-renders when a name changes. Returns the saved name, a demo label, or undefined. */
export function usePayeeName(address: string): string | undefined {
  const value = useSyncExternalStore(subscribe, () => nameOf(address) ?? '')
  return value || undefined
}

/** "Alice (0x12…ab)" style label. */
export function usePayeeLabel(address: string): string {
  const name = usePayeeName(address)
  return name ? `${name} (${short(address)})` : short(address)
}

export function payeeNameNow(address: string): string | undefined {
  return nameOf(address)
}
