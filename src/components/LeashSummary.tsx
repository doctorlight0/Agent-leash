import { navigate } from '@/lib/router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatUSDC, formatAddress, formatRelativeTime } from '@/lib/utils'
import { Shield, Clock, AlertTriangle, CheckCircle, XCircle, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LeashSummaryProps {
  leash: LeashSummaryData
}

interface LeashSummaryData {
  id: string
  agent: string
  owner: string
  balance: string
  daily_cap: string
  per_payment_limit: string
  monthly_cap: string
  monthly_spent: string
  paused: boolean
  revoked: boolean
  expires_at: string
  created_at: string
}

export function LeashSummary({ leash }: LeashSummaryProps) {
  const isExpired = leash.expires_at && BigInt(leash.expires_at) < BigInt(Date.now() * 1_000_000)
  const isActive = !leash.revoked && !isExpired && !leash.paused

  const status = leash.revoked ? 'Revoked' : isExpired ? 'Expired' : leash.paused ? 'Paused' : 'Active'

  const handleClick = () => {
    navigate(`/leash/${leash.id}`)
  }

  return (
    <Card className="h-full transition-all hover:shadow-lg cursor-pointer" onClick={handleClick}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg truncate">Leash #{leash.id}</CardTitle>
<p className="text-xs text-muted-foreground font-mono truncate">
        Agent: {formatAddress(leash.agent)}
            </p>
          </div>
          <Badge variant={isActive ? 'success' : leash.revoked ? 'destructive' : isExpired ? 'warning' : leash.paused ? 'secondary' : 'default'}>
            {status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Available Balance</p>
            <p className="font-mono font-semibold">{formatUSDC(leash.balance)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Monthly Spent</p>
            <p className="font-mono font-semibold">
              {formatUSDC(leash.monthly_spent)} / {formatUSDC(leash.monthly_cap || '0')}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Daily Cap</p>
            <p className="font-mono font-semibold">{formatUSDC(leash.daily_cap)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Per Payment Limit</p>
            <p className="font-mono font-semibold">{formatUSDC(leash.per_payment_limit)}</p>
          </div>
        </div>

        {leash.expires_at && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
            <Clock className="h-3 w-3" />
            <span>Expires: {formatRelativeTime(BigInt(leash.expires_at))}</span>
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <Button variant="ghost" size="sm" className="flex-1" onClick={(e) => {
            e.stopPropagation()
            navigate(`/leash/${leash.id}`)
          }}>
            View Details
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
