import { navigate } from '@/lib/router'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Shield, CreditCard, Users, ShieldCheck, UserPlus, ArrowRight } from 'lucide-react'
import { useNear } from '@/hooks/useNear'
import { WalletButton } from '@/components/WalletButton'

export function Home() {
  const { connected } = useNear()
  const features = [
    { icon: Shield, title: 'AI Agent Spending Controls', description: 'Create leashes with daily caps, per-payment limits, cooldowns, and allowlists to control agent spending.', href: '/leashes', cta: 'Create Leash' },
    { icon: CreditCard, title: 'Automated Payroll', description: 'Set up payroll groups with workers and salaries. Execute and retry payroll via on-chain methods.', href: '/payroll', cta: 'Payroll' },
    { icon: Users, title: 'Worker Management', description: 'View and manage workers across payroll groups with real contract state.', href: '/workers', cta: 'Workers' },
    { icon: ShieldCheck, title: 'Vigil Protection', description: 'Configure check-ins and grace periods. Beneficiary settlement follows contract rules.', href: '/vigil', cta: 'Vigil' },
    { icon: UserPlus, title: 'Beneficiaries', description: 'Define beneficiaries and shares for vigil settlement from actual on-chain config.', href: '/beneficiaries', cta: 'Beneficiaries' },
    { icon: ArrowRight, title: 'Unified Dashboard', description: 'Leashes, payroll, approvals, funding, vigil, and activity in one NEAR-native interface.', href: '/overview', cta: 'Dashboard' },
  ]

  return (
    <div className="space-y-12">
      <section className="text-center space-y-6">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight min-[390px]:text-4xl sm:text-6xl">AI Agent Financial Management</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Native NEAR spending controls, payroll, and inactivity protection for AI agents. One contract, real on-chain state.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          {connected ? (
            <>
              <Button size="lg" onClick={() => navigate('/leashes')} className="gap-2">
                <Shield className="h-5 w-5" />
                Create First Leash
              </Button>
              <Button variant="outline" size="lg" onClick={() => navigate('/overview')}>View Dashboard</Button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <WalletButton />
              <p className="text-sm text-muted-foreground">Connect a NEAR wallet to create leashes and manage funds.</p>
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-3xl font-bold tracking-tight mb-8 text-center">Features</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <Card key={i} className="h-full hover:shadow-lg transition-shadow">
              <CardContent className="p-4 sm:p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground mb-4">{feature.description}</p>
                <Button variant="outline" onClick={() => navigate(feature.href)} className="w-full gap-2">
                  {feature.cta}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t pt-12">
        <h2 className="text-3xl font-bold tracking-tight mb-8 text-center">How It Works</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { step: '01', title: 'Create Leash', description: 'Define limits, cooldowns, expiry, and optional payees with a NEAR wallet transaction.' },
            { step: '02', title: 'Fund & Configure', description: 'Deposit supported NEP-141 tokens, configure payroll and vigil from real contract state.' },
            { step: '03', title: 'Monitor & Control', description: 'Approve/reject requests, manage settings, and track activity with on-chain confirmations.' },
          ].map((item, i) => (
            <Card key={i} className="relative">
              <CardContent className="p-4 sm:p-6">
                <div className="absolute -top-3 left-6 bg-background px-2 text-primary font-mono text-lg font-bold">{item.step}</div>
                <h3 className="text-xl font-semibold mt-4 mb-2">{item.title}</h3>
                <p className="text-muted-foreground">{item.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t pt-12">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="p-5 text-center sm:p-8 md:p-12">
            <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
            <p className="text-primary-foreground/80 mb-6 max-w-2xl mx-auto">
              Connect your NEAR wallet and create a leash with real on-chain enforcement.
            </p>
            {connected ? (
              <Button size="lg" onClick={() => navigate('/leashes/new')} className="gap-2 bg-primary-foreground text-primary hover:bg-primary-foreground/90">
                <Shield className="h-5 w-5" />
                Create Your First Leash
              </Button>
            ) : (
              <div className="flex justify-center"><WalletButton /></div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
