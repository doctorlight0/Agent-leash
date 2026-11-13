import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Circle, KeyRound } from 'lucide-react'
import { clsx } from 'clsx'
import { IS_MAINNET, LEASH_ADDRESS, NETWORK_NAME, RPC_URL, addressUrl, gasBalanceAsUsdc, short, usd } from '@/lib/chain'
import { USDC_DECIMALS } from '@/onchain-facts'
import type { LeashData } from '@/hooks/useLeash'
import { Card, Chip, CopyButton } from './ui'

const MIN_GAS = 30_000n

const CHAIN_EXPORT = IS_MAINNET ? 'arc' : 'arcTestnet'

function script(leashId: bigint): string {
  return `// agent-pay.ts  (run with: bun run agent-pay.ts   or   npx tsx agent-pay.ts)
// bun add viem   |   export AGENT_PRIVATE_KEY=0x...   (the key of the agent wallet only)
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { ${CHAIN_EXPORT} } from 'viem/chains'

const LEASH_CONTRACT = '${LEASH_ADDRESS}' as const
const LEASH_ID = ${leashId.toString()}n
const RPC_URL = '${RPC_URL}'

const abi = parseAbi([
  'function pay(uint256 leashId, address payee, uint128 amount, string reason) returns (uint32 requestId)',
  'error OverPerPaymentLimit(uint256 amount, uint256 limit)',
  'error OverDailyCap(uint256 requested, uint256 remaining)',
  'error CooldownActive(uint256 availableAt)',
  'error Expired()',
  'error Revoked()',
  'error ZeroReason()',
  'error WindowFull()',
  'error InsufficientBalance(uint256 requested, uint256 available)',
])

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as \`0x\${string}\`)
const publicClient = createPublicClient({ chain: ${CHAIN_EXPORT}, transport: http(RPC_URL) })
const wallet = createWalletClient({ account, chain: ${CHAIN_EXPORT}, transport: http(RPC_URL) })

export async function payWithLeash(payee: Address, amountUsdc: string, reason: string) {
  const amount = parseUnits(amountUsdc, ${USDC_DECIMALS}) // USDC has ${USDC_DECIMALS} decimals
  try {
    // Simulate first: the contract tells you which rule would stop the payment, at no cost.
    const { result, request } = await publicClient.simulateContract({
      account, address: LEASH_CONTRACT, abi, functionName: 'pay', args: [LEASH_ID, payee, amount, reason],
    })
    const hash = await wallet.writeContract(request)
    await publicClient.waitForTransactionReceipt({ hash })
    return result === 0
      ? { status: 'paid' as const, hash }
      : { status: 'needs_owner_approval' as const, requestId: result, hash }
  } catch (err: any) {
    const rule = err?.walk?.((e: any) => e?.data?.errorName)?.data
    return { status: 'rejected' as const, rule: rule?.errorName ?? err?.shortMessage, details: rule?.args }
  }
}

// Example:
// console.log(await payWithLeash('0xPayeeAddress...', '0.05', 'paid API usage'))
`
}

function toolDefinition(leashId: bigint): string {
  return `// Tool definition for an LLM agent (OpenAI / Anthropic style function calling)
{
  "name": "pay_with_leash",
  "description": "Pay a recipient in USDC from your limited budget (leash #${leashId.toString()}). Always include a short, honest reason. Returns paid, needs_owner_approval, or rejected with the rule that stopped it.",
  "parameters": {
    "type": "object",
    "properties": {
      "payee":  { "type": "string", "description": "Recipient wallet address (0x...)" },
      "amount": { "type": "string", "description": "Amount in USDC, for example \\"0.05\\"" },
      "reason": { "type": "string", "description": "Why this payment is needed. Required." }
    },
    "required": ["payee", "amount", "reason"]
  }
}

// Suggested system prompt line:
// "You have a small USDC budget enforced by a smart contract. If a payment is rejected, do not try to
//  work around the rule (splitting payments, retrying faster). Report the rule that blocked you and wait."`
}

const RULES: [string, string][] = [
  ['OverPerPaymentLimit', 'Amount is bigger than the per-payment limit.'],
  ['OverDailyCap', 'The rolling 24 hour allowance is used up.'],
  ['CooldownActive', 'Too soon after the last payment.'],
  ['Expired', 'The leash has expired.'],
  ['Revoked', 'The owner revoked the leash.'],
  ['ZeroReason', 'A reason is required.'],
  ['WindowFull', '32 payments already made in the last 24 hours.'],
  ['InsufficientBalance', 'The leash balance is too low.'],
]

type View = 'script' | 'tool' | 'errors'

export function AgentSetup({ leashId, leash, payees, requestCount }: { leashId: bigint; leash: LeashData; payees: number; requestCount: number }) {
  const [view, setView] = useState<View>('script')
  const { data: gas } = useQuery({
    queryKey: ['agent-gas', leash.agent],
    queryFn: () => gasBalanceAsUsdc(leash.agent),
    refetchInterval: 8000,
  })

  const steps = [
    { done: leash.balance > 0n, title: 'Leash is funded', note: `${usd(leash.balance)} USDC on the leash` },
    { done: payees > 0, title: 'At least one payee is allowed', note: payees > 0 ? `${payees} on the allowlist` : 'Add one, or every payment will wait for your approval' },
    { done: gas !== undefined && gas >= MIN_GAS, title: 'Agent wallet can pay network fees', note: gas === undefined ? 'Checking…' : `${usd(gas)} USDC in the agent wallet. Fees are paid in USDC.` },
    { done: leash.lastPaymentAt > 0n || requestCount > 0, title: 'Agent has made its first call', note: 'Shows up here as soon as it pays or asks' },
  ]
  const text = view === 'script' ? script(leashId) : view === 'tool' ? toolDefinition(leashId) : ''

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="display text-lg font-semibold">Connect your agent</h3>
        <p className="mt-0.5 text-sm text-muted text-pretty">
          Your agent keeps its own key. It calls the leash contract to pay, and the contract enforces your rules.
        </p>
      </div>

      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.title} className="glass-inner flex items-start gap-3 rounded-2xl p-3.5">
            {s.done ? (
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok/20 text-ok"><Check className="h-3 w-3" /></span>
            ) : (
              <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted/60" aria-label={`Step ${i + 1} not done`} />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold">{s.title}</p>
              <p className="text-xs text-muted text-pretty">{s.note}</p>
            </div>
          </li>
        ))}
      </ol>

      <dl className="glass-inner divide-y divide-white/5 rounded-2xl text-xs">
        {[
          ['Contract', short(LEASH_ADDRESS), LEASH_ADDRESS],
          ['Leash ID', leashId.toString(), leashId.toString()],
          ['Agent wallet', short(leash.agent), leash.agent],
          ['Network', NETWORK_NAME, NETWORK_NAME],
        ].map(([k, shown, full]) => (
          <div key={k} className="flex items-center justify-between gap-3 px-3.5 py-1.5">
            <dt className="text-muted">{k}</dt>
            <dd className="flex items-center gap-1">
              {k === 'Contract' || k === 'Agent wallet' ? (
                <a href={addressUrl(full)} target="_blank" rel="noopener noreferrer" className="mono underline decoration-dotted">{shown}</a>
              ) : (
                <span className="mono">{shown}</span>
              )}
              {k !== 'Network' && <CopyButton text={full} label="" className="!min-h-[30px] !px-1.5" />}
            </dd>
          </div>
        ))}
      </dl>

      <div>
        <div className="mb-2 flex gap-2">
          <Chip active={view === 'script'} onClick={() => setView('script')}>Agent script</Chip>
          <Chip active={view === 'tool'} onClick={() => setView('tool')}>LLM tool</Chip>
          <Chip active={view === 'errors'} onClick={() => setView('errors')}>Rule errors</Chip>
        </div>
        {view === 'errors' ? (
          <ul className="glass-inner divide-y divide-white/5 rounded-2xl">
            {RULES.map(([name, text2]) => (
              <li key={name} className="px-3.5 py-2.5">
                <span className="mono text-xs text-accent">{name}</span>
                <p className="text-xs text-muted">{text2}</p>
              </li>
            ))}
            <li className="px-3.5 py-2.5 text-xs text-muted">
              A payee that is not on the allowlist is not an error: the call succeeds and returns a request number, and the owner decides.
            </li>
          </ul>
        ) : (
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-black/40">
            <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
              <span className="mono text-[11px] text-muted">{view === 'script' ? 'agent-pay.ts' : 'tool.json'}</span>
              <CopyButton text={text} label="Copy" />
            </div>
            <pre className={clsx('mono max-h-[320px] overflow-auto p-3.5 text-[11px] leading-relaxed text-ink/85')}>{text}</pre>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2.5 rounded-2xl border border-accent/25 bg-accent/5 p-3.5 text-xs text-muted">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <p className="text-pretty">
          Keep the agent's private key in an environment variable on the machine that runs the agent. Never paste it into a chat, a website or this app. Use a fresh wallet that only the agent controls.
        </p>
      </div>
    </Card>
  )
}
