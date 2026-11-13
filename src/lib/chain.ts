import { createPublicClient, http, erc20Abi, type Address } from 'viem'
import { arc, arcTestnet } from 'viem/chains'
import { buildAddressExplorerUrl, buildTxExplorerUrl, getUsdc, requireChain } from '@/onchain-facts'
import { Amount, formatUsdc, gasTokenToUsdc, parseUsdc, usdcToGasToken } from '@/onchain-money'

/** Set VITE_NETWORK=mainnet to run the app against Arc Mainnet (real USDC). Anything else means Arc Testnet. */
export const IS_MAINNET = (import.meta.env.VITE_NETWORK as string | undefined) === 'mainnet'
export const CHAIN = IS_MAINNET ? arc : arcTestnet
export const CHAIN_ID = CHAIN.id
/** The active network, shown in the UI header and dashboard. */
export const NETWORK_NAME = IS_MAINNET ? 'Network' : 'Network'

const usdcFact = getUsdc(CHAIN_ID)
if (!usdcFact) throw new Error(`USDC is missing from the onchain facts`)

export const USDC_ADDRESS = usdcFact.address as Address
export { erc20Abi }

const rawAddress = (IS_MAINNET ? import.meta.env.VITE_AGENT_LEASH_ADDRESS_MAINNET : import.meta.env.VITE_AGENT_LEASH_ADDRESS) as string | undefined
export const LEASH_ADDRESS = (rawAddress ?? '') as Address
export const DEPLOY_BLOCK = BigInt(
  ((IS_MAINNET ? import.meta.env.VITE_AGENT_LEASH_DEPLOY_BLOCK_MAINNET : import.meta.env.VITE_AGENT_LEASH_DEPLOY_BLOCK) as string | undefined) ?? '0',
)

/** Default balance cap offered when creating a leash (10 USDC), in base units. */
export const DEFAULT_CAP = 10_000_000n
/** Highest cap the contract accepts per leash (1,000,000 USDC), in base units. */
export const CAP_CEILING = 1_000_000_000_000n

export const RPC_URL = requireChain(CHAIN_ID).rpcUrls[0]

export const publicClient = createPublicClient({ chain: arcTestnet, transport: http(RPC_URL) })

export const txUrl = (hash: string) => buildTxExplorerUrl(CHAIN_ID, hash)
export const addressUrl = (address: string) => buildAddressExplorerUrl(CHAIN_ID, address)

/** "1.50" style USDC string from base units (at least two decimals). */
export function usd(raw: bigint): string {
  const s = formatUsdc(raw)
  if (!s.includes('.')) return `${s}.00`
  const [, frac] = s.split('.')
  return frac.length < 2 ? `${s}${'0'.repeat(2 - frac.length)}` : s
}

export function tryParseUsdc(value: string): bigint | undefined {
  const v = value.trim()
  if (!v) return undefined
  try {
    return parseUsdc(v)
  } catch {
    return undefined
  }
}

/** Native gas balance (18-decimal view) of an address, shown as USDC base units (6-decimal view). */
export async function gasBalanceAsUsdc(address: Address): Promise<bigint> {
  const native = await publicClient.getBalance({ address })
  return gasTokenToUsdc(CHAIN_ID, Amount.fromRaw(native, requireChain(CHAIN_ID).nativeCurrency.decimals)).raw
}

/** USDC base units expressed in the native 18-decimal view, for `value` on a plain transfer. */
export function usdcAsNativeValue(raw: bigint): bigint {
  return usdcToGasToken(CHAIN_ID, Amount.fromRaw(raw, 6)).raw
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

export function fmtCooldown(seconds: number): string {
  if (seconds === 0) return 'none'
  if (seconds % 86400 === 0) return `${seconds / 86400} day${seconds === 86400 ? '' : 's'}`
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds === 3600 ? '' : 's'}`
  if (seconds % 60 === 0) return `${seconds / 60} min`
  return `${seconds}s`
}