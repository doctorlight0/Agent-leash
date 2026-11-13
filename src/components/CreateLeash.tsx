import { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { isAddress, parseEventLogs, zeroAddress, type Address } from 'viem'
import { Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { agentLeashAbi } from '@/lib/agentLeashAbi'
import { CAP_CEILING, DEFAULT_CAP, IS_MAINNET, LEASH_ADDRESS, NETWORK_NAME, USDC_ADDRESS, erc20Abi, fmtCooldown, publicClient, short, tryParseUsdc, usd } from '@/lib/chain'
import { getDemoWorld } from '@/lib/demo'
import { navigate } from '@/lib/router'
import { useSend } from '@/hooks/useSend'
import { useNow } from '@/hooks/useNow'
import { Button, Card, Chip, Field, SectionTitle } from './ui'

const EXPIRY_PRESETS = [
  { label: '1 hour', seconds: 3600 },
  { label: '1 day', seconds: 86400 },
  { label: '7 days', seconds: 7 * 86400 },
  { label: '30 days', seconds: 30 * 86400 },
  { label: '90 days', seconds: 90 * 86400 },
] as const

const TEMPLATES = [
  { id: 'api', label: 'API spender', daily: '1.00', per: '0.25', cdValue: '10', cdUnit: 0, expiry: 1, cap: '10', fund: '2.00' },
  { id: 'subs', label: 'Subscriptions', daily: '5.00', per: '2.00', cdValue: '1', cdUnit: 2, expiry: 4, cap: '20', fund: '10.00' },
  { id: 'tips', label: 'Tips', daily: '2.00', per: '0.50', cdValue: '1', cdUnit: 1, expiry: 2, cap: '10', fund: '5.00' },
  { id: 'payroll', label: 'Payroll', daily: '1000.00', per: '500.00', cdValue: '0', cdUnit: 0, expiry: 4, cap: '1000', fund: '100.00' },
] as const

const UNITS = [
  { label: 'seconds', mult: 1 },
  { label: 'minutes', mult: 60 },
  { label: 'hours', mult: 3600 },
] as const

export function CreateLeash() {
  const { address: owner, isConnected } = useAccount()
  const { send, phase, busy } = useSend()
  const [agent, setAgent] = useState('')
  const [daily, setDaily] = useState('1.00')
  const [perPay, setPerPay] = useState('0.25')
  const [cdValue, setCdValue] = useState('10')
  const [cdUnit, setCdUnit] = useState(0)
  const [expiry, setExpiry] = useState(1)
  const [fund, setFund] = useState('2.00')
  const [cap, setCap] = useState(usd(DEFAULT_CAP).replace(/\.00$/, ''))
  const [ack, setAck] = useState(false)
  const [template, setTemplate] = useState<string>('api')
  const [payees, setPayees] = useState<string[]>([])
  const [step, setStep] = useState('')
  const now = useNow()

  const v = useMemo(() => {
    const dailyCap = tryParseUsdc(daily)
    const perPayment = tryParseUsdc(perPay)
    const funding = tryParseUsdc(fund)
    const balanceCap = tryParseUsdc(cap)
    const cooldown = Number(cdValue) * UNITS[cdUnit].mult
    const errors: Record<string, string> = {}
    if (!agent) errors.agent = 'Enter the agent wallet address'
    else if (!isAddress(agent) || agent.toLowerCase() === zeroAddress) errors.agent = 'Not a valid address'
    if (dailyCap === undefined || dailyCap <= 0n) errors.daily = 'Enter an amount above 0'
    if (perPayment === undefined || perPayment <= 0n) errors.perPay = 'Enter an amount above 0'
    else if (dailyCap !== undefined && perPayment > dailyCap) errors.perPay = 'Cannot be more than the daily cap'
    if (!Number.isFinite(cooldown) || cooldown < 0 || !Number.isInteger(cooldown)) errors.cd = 'Whole number, 0 or more'
    if (funding === undefined) errors.fund = 'Enter an amount'
    else if (balanceCap !== undefined && funding > balanceCap) errors.fund = 'Cannot be more than the balance cap'
    if (balanceCap === undefined || balanceCap <= 0n) errors.cap = 'Enter an amount above 0'
    else if (balanceCap > CAP_CEILING) errors.cap = 'The highest cap is 1,000,000 USDC'
    const cleanPayees = payees.map((p) => p.trim()).filter(Boolean)
    if (cleanPayees.some((p) => !isAddress(p) || p.toLowerCase() === zeroAddress)) errors.payees = 'One of the payee addresses is not valid'
    if (cleanPayees.length > 10) errors.payees = 'At most 10 payees'
    return { dailyCap, perPayment, funding, balanceCap, cooldown, errors, cleanPayees }
  }, [agent, daily, perPay, cdValue, cdUnit, fund, cap, payees])

  const valid = Object.keys(v.errors).length === 0
  const expiresDate = new Date((now + EXPIRY_PRESETS[expiry].seconds) * 1000)

  const useDemoAgent = () => setAgent(getDemoWorld().agent.address)
  const addDemoPayees = () => {
    const demo = getDemoWorld().payees.slice(0, 2).map((p) => p.address as string)
    setPayees((cur) => [...new Set([...cur.filter(Boolean), ...demo])])
  }

  const submit = async () => {
    if (!valid || !owner || v.dailyCap === undefined || v.perPayment === undefined || v.funding === undefined || v.balanceCap === undefined) return
    const funding = v.funding
    if (funding > 0n) {
      setStep('Allow the leash contract to take your USDC')
      const allowance = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [owner, LEASH_ADDRESS],
      })
      if (allowance < funding) {
        const ok = await send('USDC allowance set', (wc) =>
          wc.writeContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [LEASH_ADDRESS, funding] }),
        )
        if (!ok) return setStep('')
      }
    }
    setStep('Create the leash')
    const chainTime = (await publicClient.getBlock()).timestamp
    const expiresAt = chainTime + BigInt(EXPIRY_PRESETS[expiry].seconds)
    const receipt = await send('Leash created', (wc) =>
      wc.writeContract({
        address: LEASH_ADDRESS,
        abi: agentLeashAbi,
        functionName: 'createLeash',
        args: [agent as Address, v.dailyCap!, v.perPayment!, v.cooldown, expiresAt, v.balanceCap!, funding, v.cleanPayees as Address[]],
      }),
    )
    setStep('')
    if (!receipt) return
    const [created] = parseEventLogs({ abi: agentLeashAbi, logs: receipt.logs, eventName: 'LeashCreated' })
    if (created) navigate(`/leash/${created.args.leashId.toString()}`)
  }

  const fundNum = v.funding !== undefined ? Number(v.funding) / 1_000_000 : 0
  const capNum = v.balanceCap !== undefined && v.balanceCap > 0n ? Number(v.balanceCap) / 1_000_000 : 10
  const sliderStep = capNum <= 10 ? 0.25 : capNum <= 100 ? 1 : capNum <= 1000 ? 10 : 100

  const applyTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id)
    if (!t) return
    setTemplate(id)
    setDaily(t.daily)
    setPerPay(t.per)
    setCdValue(t.cdValue)
    setCdUnit(t.cdUnit)
    setExpiry(t.expiry)
    setCap(t.cap)
    setFund(t.fund)
  }
  const isDemo = !IS_MAINNET && agent.toLowerCase() === getDemoWorld().agent.address.toLowerCase()

  return (
    <Card className="space-y-7">
      <div>
        <h2 className="display text-[26px] font-semibold leading-tight">Put an agent on a leash</h2>
        <p className="mt-1 text-sm text-muted">Set the rules once. The contract enforces them on every payment.</p>
      </div>

      <div className="space-y-2.5">
        <span className="label">Start from a template</span>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <Chip key={t.id} active={template === t.id} onClick={() => applyTemplate(t.id)}>{t.label}</Chip>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <SectionTitle n="1" title="Who is the agent?" sub="Only this address can spend from the leash." />
        <Field
          label=""
          aria-label="Agent wallet"
          placeholder="0x… agent wallet address"
          value={agent}
          onChange={(e) => setAgent(e.target.value.trim())}
          error={agent ? v.errors.agent : undefined}
          autoCapitalize="off"
          spellCheck={false}
        />
        <div className="flex flex-wrap gap-2">
          {!IS_MAINNET && <Chip onClick={useDemoAgent} active={isDemo}>Use the built-in demo agent</Chip>}
        </div>
      </div>

      <div className="space-y-4">
        <SectionTitle n="2" title="Set the rules" sub="Limits the contract will not let the agent cross." />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Daily cap" inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} suffix="USDC" error={v.errors.daily} />
          <Field label="Per payment" inputMode="decimal" value={perPay} onChange={(e) => setPerPay(e.target.value)} suffix="USDC" error={v.errors.perPay} />
        </div>
        <div>
          <span className="label">Cooldown between payments</span>
          <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-2">
            <Field label="" aria-label="Cooldown" inputMode="numeric" value={cdValue} onChange={(e) => setCdValue(e.target.value)} error={v.errors.cd} className="[&>span:first-child]:mt-0" />
            <select
              aria-label="Cooldown unit"
              value={cdUnit}
              onChange={(e) => setCdUnit(Number(e.target.value))}
              className="glass-inner min-h-[52px] rounded-2xl px-3 text-sm text-ink"
            >
              {UNITS.map((u, i) => (
                <option key={u.label} value={i} className="bg-surface">{u.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <span className="label">Expires in</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {EXPIRY_PRESETS.map((p, i) => (
              <Chip key={p.label} active={expiry === i} onClick={() => setExpiry(i)}>{p.label}</Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <SectionTitle n="3" title="Fund it" sub="Set a balance cap once. The leash can never hold more than that." />
        <Field
          label="Balance cap"
          inputMode="decimal"
          value={cap}
          onChange={(e) => setCap(e.target.value.replace(/[^0-9.]/g, ''))}
          suffix="USDC"
          error={v.errors.cap}
          hint="Fixed forever once the leash is created. Highest allowed: 1,000,000 USDC."
        />
        <div className="glass-inner rounded-2xl p-4">
          <div className="flex items-baseline justify-between">
            <input
              aria-label="Fund amount"
              inputMode="decimal"
              value={fund}
              onChange={(e) => setFund(e.target.value.replace(/[^0-9.]/g, ''))}
              className="display w-32 bg-transparent text-4xl font-semibold tabular-nums outline-none"
            />
            <span className="text-sm font-semibold text-muted">USDC</span>
          </div>
          <input
            type="range"
            min={0}
            max={capNum}
            step={sliderStep}
            value={Math.min(capNum, fundNum)}
            onChange={(e) => setFund(Number(e.target.value).toFixed(2))}
            aria-label="Fund amount slider"
            className="mt-3 h-1.5 w-full cursor-pointer accent-[#ffd23f]"
          />
          <div className="mt-1 flex justify-between text-[11px] text-muted"><span>0</span><span>{capNum.toLocaleString()} USDC cap</span></div>
          <div className="mt-3 flex gap-2">
            {[10, 25, 50, 100].map((pct) => (
              <Chip key={pct} active={Math.abs(fundNum - (capNum * pct) / 100) < 1e-9} onClick={() => setFund(((capNum * pct) / 100).toFixed(2))}>
                {pct === 100 ? 'Max' : `${pct}%`}
              </Chip>
            ))}
          </div>
          {v.errors.fund && <p className="mt-2 text-xs text-danger">{v.errors.fund}</p>}
        </div>
      </div>

      <div className="space-y-3">
        <SectionTitle n="4" title="Who can it pay?" sub="Payments to anyone else wait for your approval." />
        <div className="flex flex-wrap gap-2">
          {!IS_MAINNET && <Chip onClick={addDemoPayees}>Add demo payees</Chip>}
          <Chip onClick={() => setPayees((p) => [...p, ''])}><Plus className="mr-0.5 inline h-3 w-3" />Add payee</Chip>
        </div>
        {payees.length === 0 && <p className="text-xs text-muted">No payees yet. You can add them later.</p>}
        {payees.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              aria-label={`Payee ${i + 1}`}
              value={p}
              placeholder="0x…"
              onChange={(e) => setPayees((cur) => cur.map((c, j) => (j === i ? e.target.value : c)))}
              className="mono glass-inner min-h-[48px] min-w-0 flex-1 rounded-2xl px-3.5 text-xs text-ink outline-none focus:border-accent/70"
              spellCheck={false}
            />
            <button
              type="button"
              aria-label="Remove payee"
              onClick={() => setPayees((cur) => cur.filter((_, j) => j !== i))}
              className="flex h-12 w-12 items-center justify-center rounded-2xl text-muted hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {v.errors.payees && <p className="text-xs text-danger">{v.errors.payees}</p>}
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-accent/25 bg-accent/[0.06] p-4">
        <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-accent">
          <ShieldCheck className="h-4 w-4" /> In plain English
        </div>
        <p className="text-sm leading-relaxed text-ink/90 text-pretty">
          This agent{agent && isAddress(agent) ? ` (${short(agent)})` : ''} can spend up to{' '}
          <b>{v.dailyCap !== undefined ? usd(v.dailyCap) : '…'} USDC per day</b> and{' '}
          <b>{v.perPayment !== undefined ? usd(v.perPayment) : '…'} USDC per payment</b>, waiting{' '}
          <b>{Number.isFinite(v.cooldown) ? fmtCooldown(Math.max(0, v.cooldown)) : '…'}</b> between payments, only to{' '}
          {v.cleanPayees.length > 0 ? <b>{v.cleanPayees.length} approved payee{v.cleanPayees.length > 1 ? 's' : ''}</b> : 'payees you add later'}.
          Anyone else needs your approval. It stops on {expiresDate.toLocaleString()}. You put in{' '}
          <b>{v.funding !== undefined ? usd(v.funding) : '…'} USDC</b> and can revoke or withdraw at any time.
        </p>
      </div>

      {IS_MAINNET && (
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#ff5252]" />
          <span className="text-pretty">
            I understand this leash holds <b>real USDC</b>, and transactions cannot be reversed. I checked the agent address and the amounts.
          </span>
        </label>
      )}

      {!isConnected ? (
        <ConnectKitButton.Custom>
          {({ show }) => (
            <Button onClick={show} className="w-full">Connect wallet to continue</Button>
          )}
        </ConnectKitButton.Custom>
      ) : (
        <Button onClick={submit} disabled={!valid || (IS_MAINNET && !ack)} loading={busy} className="w-full">
          {phase === 'wallet' ? 'Confirm in your wallet…' : phase === 'confirming' ? `Confirming on ${NETWORK_NAME}…` : 'Create leash'}
        </Button>
      )}
      {step && busy && <p className="text-center text-xs text-muted">Step: {step}</p>}
    </Card>
  )
}
