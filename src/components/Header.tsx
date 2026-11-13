import { useNear } from '@/hooks/useNear'
import { useNavigate } from '@/lib/router'
import { WalletButton } from '@/components/WalletButton'
import { Logo } from '@/components/Logo'
import { cn } from '@/lib/utils'
import { AlertCircle, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

const navigation = [
  { name: 'Overview', href: '/overview' },
  { name: 'Leashes', href: '/leashes' },
  { name: 'Payroll', href: '/payroll' },
  { name: 'Workers', href: '/workers' },
  { name: 'Funding', href: '/funding' },
  { name: 'Approvals', href: '/approvals' },
  { name: 'Vigil', href: '/vigil' },
  { name: 'Beneficiaries', href: '/beneficiaries' },
  { name: 'Activity', href: '/activity' },
  { name: 'Settings', href: '/settings' },
] as const

export function Header() {
  const { connected, accountId, networkId, error } = useNear()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const goTo = (href: string) => {
    setMenuOpen(false)
    navigate(href)
  }

  return (
    <header className="app-header sticky top-0 z-50 w-full border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="app-container">
        {error && (
          <div className="mt-2 flex min-w-0 items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}
        <div className="flex min-h-16 items-center gap-2 py-2 sm:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-4 xl:gap-6">
            <button className="flex shrink-0 items-center gap-2" onClick={() => goTo('/overview')} aria-label="Agent Leash overview">
              <Logo className="h-8 w-8 shrink-0" />
              <span className="hidden font-display text-xl font-semibold sm:inline">Agent Leash</span>
            </button>

            <nav className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 xl:flex" aria-label="Main navigation">
              {navigation.map((item) => (
                <button
                  key={item.name}
                  onClick={() => goTo(item.href)}
                  className={cn(
                    'flex min-h-10 items-center rounded-lg px-2 py-2 text-sm font-medium transition-colors 2xl:px-3',
                    'hover:bg-accent hover:text-accent-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                  )}
                >
                  {item.name}
                </button>
              ))}
            </nav>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <span className="hidden items-center rounded-md border border-border px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground lg:inline-flex">
              {networkId}
            </span>
            <WalletButton />
            <Button
              variant="outline"
              size="icon"
              className="xl:hidden"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="responsive-navigation"
              aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {menuOpen && (
          <nav id="responsive-navigation" className="grid grid-cols-2 gap-1 border-t border-border/60 pb-3 pt-2 sm:grid-cols-3 lg:grid-cols-5 xl:hidden" aria-label="Responsive navigation">
            {navigation.map((item) => (
              <button
                key={item.name}
                onClick={() => goTo(item.href)}
                className={cn(
                  'flex min-h-11 items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                )}
              >
                {item.name}
              </button>
            ))}
            <div className="col-span-2 flex items-center justify-center gap-2 pt-1 text-xs text-muted-foreground sm:col-span-3 lg:col-span-5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
              <span>{networkId}</span>
              {connected && accountId ? <span className="max-w-[14rem] truncate font-mono" title={accountId}>{accountId}</span> : <span>Wallet disconnected</span>}
            </div>
          </nav>
        )}
      </div>
    </header>
  )
}
