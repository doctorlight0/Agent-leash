import { motion } from 'framer-motion'
import { usd } from '@/lib/chain'

interface Props {
  balance: bigint
  totalFunded: bigint
  remainingDaily: bigint
  revoked: boolean
  expired: boolean
}

const X0 = 28
const FULL = 244

/** The remaining budget as a tether: it shortens as the agent spends. */
export function Tether({ balance, totalFunded, remainingDaily, revoked, expired }: Props) {
  const frac = totalFunded > 0n ? Math.min(1, Number((balance * 10000n) / totalFunded) / 10000) : 0
  const len = revoked ? 0 : Math.max(frac > 0 ? 10 : 0, FULL * frac)
  const agentX = X0 + len
  const dailyFrac = totalFunded > 0n ? Math.min(frac, Number(((remainingDaily < balance ? remainingDaily : balance) * 10000n) / totalFunded) / 10000) : 0
  const dailyX = X0 + FULL * dailyFrac
  const showDaily = !revoked && dailyFrac < frac - 0.02 && frac > 0
  const dim = revoked || expired
  const stroke = revoked ? 'var(--danger)' : dim ? 'var(--muted)' : 'var(--accent)'
  const lineStroke = revoked || dim ? stroke : 'url(#tether-grad)'

  return (
    <div className="relative">
      <svg viewBox="0 0 320 96" className="w-full" role="img" aria-label={`Leash with ${usd(balance)} USDC remaining`}>
        <defs>
          <linearGradient id="tether-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ffd23f" stopOpacity="0.35" />
            <stop offset="1" stopColor="#ffd23f" />
          </linearGradient>
          <filter id="tether-glow" x="-20%" y="-80%" width="140%" height="260%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* full-length track */}
        <line x1={X0} y1="40" x2={X0 + FULL} y2="40" stroke="var(--line-strong)" strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" />
        {/* tether */}
        <motion.line
          x1={X0}
          y1="40"
          initial={false}
          animate={{ x2: agentX }}
          transition={{ type: 'spring', stiffness: 90, damping: 18 }}
          y2="40"
          stroke={lineStroke}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={revoked ? '3 9' : '14 5'}
          opacity={dim ? 0.5 : 1}
          filter={dim ? undefined : 'url(#tether-glow)'}
        />
        {/* owner anchor */}
        <circle cx={X0} cy="40" r="10" fill="var(--surface-2)" stroke={stroke} strokeWidth="3" />
        <text x={X0} y="72" textAnchor="middle" fill="var(--muted)" fontSize="10" fontWeight="600" letterSpacing="1">OWNER</text>
        {/* agent */}
        <motion.g initial={false} animate={{ x: revoked ? FULL + 14 : agentX - X0 }} transition={{ type: 'spring', stiffness: 90, damping: 18 }}>
          <circle cx={X0} cy="40" r="11" fill={revoked ? 'var(--surface-2)' : stroke} opacity={dim ? 0.6 : 1} stroke={revoked ? 'var(--danger)' : 'none'} strokeWidth="2" filter={dim ? undefined : 'url(#tether-glow)'} />
          <text x={X0} y="44" textAnchor="middle" fill="var(--accent-ink)" fontSize="11" fontWeight="700">{revoked ? '' : 'AI'}</text>
          <text x={X0} y="72" textAnchor="middle" fill="var(--muted)" fontSize="10" fontWeight="600" letterSpacing="1">AGENT</text>
        </motion.g>
        {revoked && (
          <g stroke="var(--danger)" strokeWidth="3" strokeLinecap="round">
            <line x1={X0 + 26} y1="30" x2={X0 + 38} y2="50" />
            <line x1={X0 + 38} y1="30" x2={X0 + 26} y2="50" />
          </g>
        )}
        {showDaily && (
          <g>
            <line x1={dailyX} y1="27" x2={dailyX} y2="53" stroke="var(--ink)" strokeWidth="2" />
            <text x={dailyX} y="20" textAnchor="middle" fill="var(--ink)" fontSize="9" fontWeight="600" letterSpacing="1">TODAY'S LIMIT</text>
          </g>
        )}
      </svg>
      <p className="-mt-1 text-center text-xs text-muted">
        {revoked
          ? 'Cut. The agent can no longer spend.'
          : expired
            ? 'Expired. The agent can no longer spend.'
            : totalFunded === 0n
              ? 'No funds yet. The leash has no slack.'
              : `${usd(balance)} of ${usd(totalFunded)} USDC left on the leash`}
      </p>
    </div>
  )
}
