import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format token amount assuming 6 decimals (legacy helper). Prefer token-aware formatting when decimals are known. */
export function formatUSDC(amount: string | number | bigint): string {
  try {
    const num = typeof amount === 'bigint' ? amount : BigInt(amount)
    const negative = num < 0n
    const abs = negative ? -num : num
    const divisor = 10n ** 6n
    const whole = abs / divisor
    const fraction = abs % divisor
    const sign = negative ? '-' : ''
    if (fraction === 0n) return `${sign}${whole.toString()}`
    const fractionStr = fraction.toString().padStart(6, '0').replace(/0+$/, '')
    return `${sign}${whole.toString()}.${fractionStr}`
  } catch {
    return String(amount)
  }
}

/** Truncate account/address for display (NEAR account IDs or hex addresses). */
export function formatAddress(address: string, chars = 6): string {
  if (!address) return ''
  if (address.length <= chars * 2 + 3) return address
  return `${address.slice(0, chars)}…${address.slice(-chars)}`
}

export function formatRelativeTime(timestampNs: bigint): string {
  const now = BigInt(Date.now() * 1_000_000)
  const diff = timestampNs > now ? timestampNs - now : now - timestampNs
  const seconds = Number(diff / 1_000_000_000n)

  if (seconds < 60) return timestampNs > now ? 'soon' : 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${timestampNs > now ? 'from now' : 'ago'}`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${timestampNs > now ? 'from now' : 'ago'}`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ${timestampNs > now ? 'from now' : 'ago'}`

  const date = new Date(Number(timestampNs / 1_000_000n))
  return date.toLocaleDateString()
}

export function formatFullDate(timestampNs: bigint): string {
  const date = new Date(Number(timestampNs / 1_000_000n))
  return date.toLocaleString()
}

export function parseUSDC(amount: string): bigint {
  const cleaned = amount.trim()
  if (!cleaned) return 0n
  const negative = cleaned.startsWith('-')
  const s = negative ? cleaned.slice(1) : cleaned
  const [whole, fraction = ''] = s.split('.')
  const paddedFraction = fraction.padEnd(6, '0').slice(0, 6)
  const value = BigInt(whole || '0') * 10n ** 6n + BigInt(paddedFraction || '0')
  return negative ? -value : value
}