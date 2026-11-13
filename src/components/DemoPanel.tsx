import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import { Bot, Check, Clock, Fuel, Info, ShieldAlert, Zap } from 'lucide-react'
import { gasBalanceAsUsdc, short, txUrl, usd, usdcAsNativeValue } from '@/lib/chain'
import { getDemoWorld, isDemoAgent } from '@/lib/demo'
import { runBiteTest, runDemoAgent, type LogLine, type Tone } from '@/lib/demoRunner'
import { friendlyError } from '@/lib/errors'
import { useSend } from '@/hooks/useSend'
import { useNow } from '@/hooks/useNow'
import type { LeashData } from '@/hooks/useLeash'
import { Button, Card } from './ui'

const FUEL = 200_000n // 0.20 USDC of gas money for the demo agent
const MIN_GAS = 30_000n // 0.03 USDC

const TONE: Record<Tone, { icon: typeof Check; cls: string }> = {
  ok: { icon: Check, cls: 'border-ok/40 bg-ok/10 text-ok' },
  reject: { icon: ShieldAlert, cls: 'border-danger/50 bg-danger/10 text-danger' },
  queued: { icon: Clock, cls: 'border-accent/40 bg-accent/10 text-accent' },
  info: { icon: Info, cls: 'border-line bg-surface2 text-muted' },
}

export function DemoPanel({ leashId, leash, allowlisted, isOwner }: { leashId: bigint; leash: LeashData; allowlisted: Address[]; isOwner: boolean }) {
  const qc = useQueryClient()
  const { send, busy: funding } = useSend()
  const [lines, setLines] = useState<LogLine[]>([])
  const [running, setRunning] = useState<'demo' | 'bite' | null>(null)
  const counter = useRef(0)
  const now = useNow()

  const agentAddr = getDemoWorld().agent.address
  const mine = isDemoAgent(leash.agent)
  const { data: gas } = useQuery({
    queryKey: ['demo-gas', agentAddr],
    queryFn: () => gasBalanceAsUsdc(agentAddr),
    refetchInterval: 6000,
  })
  const needsFuel = gas !== undefined && gas < MIN_GAS
  const inactive = leash.revoked || Number(leash.expiresAt) <= now

  const emit = (line: Omit<LogLine, 'id'>) => setLines((cur) => [...cur, { ...line, id: counter.current++ }])

  const run = async (kind: 'demo' | 'bite') => {
    setLines([])
    setRunning(kind)
    try {
      const ctx = { leashId, allowlisted }
      await (kind === 'demo' ? runDemoAgent(ctx, emit) : runBiteTest(ctx, emit))
    } catch (err) {
      emit({ tone: 'info', title: friendlyError(err) })
    } finally {
      setRunning(null)
      await qc.invalidateQueries()
    }
  }

  const fuel = () =>
    send('Demo agent fueled', (wc) => wc.sendTransaction({ to: agentAddr, value: usdcAsNativeValue(FUEL), account: wc.account, chain: wc.chain }))

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Bot className="h-5 w-5 text-accent" aria-hidden />
        <h3 className="display text-lg font-semibold">Demo agent</h3>
      </div>
      {!mine ? (
        <p className="mt-2 text-sm text-muted">
          This leash uses a different agent address, so the built-in demo agent can't spend from it. Create a leash and pick "Use the built-in demo agent" to try the demo.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted text-pretty">
            A throwaway wallet in this browser plays the agent. It makes small real payments, and the contract enforces every rule on it.
          </p>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-surface2 px-3.5 py-2.5 text-xs">
            <span className="mono text-muted">{short(agentAddr)}</span>
            <span className="tabular-nums text-muted">gas wallet: {gas !== undefined ? usd(gas) : '…'} USDC</span>
          </div>
          {needsFuel && (
            <div className="mt-3 rounded-xl border border-accent/40 bg-accent/5 p-3.5">
              <p className="text-sm text-pretty">The demo agent needs a little USDC to pay network fees before it can send payments.</p>
              <Button size="sm" variant="outline" className="mt-2 w-full" onClick={fuel} loading={funding} disabled={!isOwner}>
                <Fuel className="h-4 w-4" /> {isOwner ? `Send ${usd(FUEL)} USDC for gas` : 'Connect as the owner to fuel it'}
              </Button>
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button onClick={() => run('demo')} loading={running === 'demo'} disabled={running !== null || needsFuel || inactive}>
              <Zap className="h-4 w-4" /> Run demo agent
            </Button>
            <Button variant="outline" onClick={() => run('bite')} loading={running === 'bite'} disabled={running !== null || inactive}>
              Bite Test
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Bite Test: the agent tries to overspend on purpose. The attempts run against the live contract without sending funds, so only the rejection shows.
          </p>
        </>
      )}
      {lines.length > 0 && (
        <ul className="mt-3 space-y-2" aria-live="polite">
          {lines.map((l) => {
            const T = TONE[l.tone]
            return (
              <li key={l.id} className={`flex gap-2.5 rounded-xl border p-3 ${T.cls}`}>
                <T.icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-pretty">{l.title}</p>
                  {l.detail && <p className="mt-0.5 text-ink/80 text-pretty">{l.detail}</p>}
                  {l.code && <p className="mono mt-1 text-[11px] opacity-80">revert: {l.code}</p>}
                  {l.hash && (
                    <a href={txUrl(l.hash)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs underline decoration-dotted">
                      view transaction
                    </a>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
