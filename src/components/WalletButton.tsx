import { useNear } from '@/hooks/useNear'
import { Button } from '@/components/ui/button'
import { Wallet, LogOut, Loader2 } from 'lucide-react'

export function WalletButton() {
  const { connected, connecting, accountId, connect, disconnect, ready } = useNear()

  if (!ready) {
    return (
      <Button disabled className="gap-2" aria-label="Loading NEAR wallet">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="hidden sm:inline">Loading wallet…</span>
        <span className="sm:hidden">Loading…</span>
      </Button>
    )
  }

  if (connecting) {
    return (
      <Button disabled className="gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Connecting…
      </Button>
    )
  }

  if (connected) {
    return (
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
        <span className="flex min-w-0 max-w-[5.5rem] items-center gap-1.5 font-mono text-[11px] text-muted-foreground sm:max-w-[10rem]" title={accountId || ''}>
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
          <span className="truncate">{accountId}</span>
        </span>
        <Button variant="outline" size="sm" onClick={() => void disconnect()} className="gap-1" aria-label="Disconnect NEAR wallet">
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Disconnect</span>
        </Button>
      </div>
    )
  }

  return (
    <Button onClick={() => void connect()} className="gap-2" data-testid="connect-wallet-button">
      <Wallet className="h-4 w-4" />
      <span className="hidden sm:inline">Connect Wallet</span>
      <span className="sm:hidden">Connect</span>
    </Button>
  )
}
