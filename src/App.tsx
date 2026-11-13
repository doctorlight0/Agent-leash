import { useRoute } from '@/lib/router'
import { NEAR_ENV } from '@/lib/near-config'
import { Header } from '@/components/Header'
import { Overview } from '@/components/Overview'
import { LeashesList } from '@/components/LeashesList'
import { NearDashboard } from '@/components/NearDashboard'
import { PayrollDashboard } from '@/components/PayrollDashboard'
import { WorkersDashboard } from '@/components/WorkersDashboard'
import { FundingDashboard } from '@/components/FundingDashboard'
import { ApprovalsDashboard } from '@/components/ApprovalsDashboard'
import { VigilDashboard } from '@/components/VigilDashboard'
import { BeneficiariesDashboard } from '@/components/BeneficiariesDashboard'
import { ActivityDashboard } from '@/components/ActivityDashboard'
import { SettingsDashboard } from '@/components/SettingsDashboard'
import { Home } from '@/components/Home'
import { NearCreateLeash } from '@/components/NearCreateLeash'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function App() {
  const route = useRoute()
  return (
    <div className="min-h-dvh bg-background text-foreground">
      {!NEAR_ENV.contractId ? (
        <div className="app-container py-8">
          <div className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
            NEAR contract not configured. Set <code>VITE_NEAR_CONTRACT_ID</code> in your environment (see <code>.env.near.example</code>).
            Agent Leash runs against native NEAR contracts only.
          </div>
        </div>
      ) : (
        <>
          <Header />
          <main className="app-container pb-[max(2rem,env(safe-area-inset-bottom))] pt-4">
            {renderRoute(route)}
          </main>
        </>
      )}
    </div>
  )
}

function renderRoute(route: ReturnType<typeof useRoute>) {
  switch (route.name) {
    case 'home':
      return <Home />
    case 'overview':
      return <Overview />
    case 'leashes':
      return <LeashesList />
    case 'leashNew':
      return (
        <div className="mx-auto max-w-3xl space-y-4">
          <NearCreateLeash />
        </div>
      )
    case 'leash':
      return <NearDashboard key={`leash-${route.id.toString()}`} id={Number(route.id)} readOnly={false} />
    case 'payroll':
      return <PayrollDashboard />
    case 'payrollNew':
      return (
        <Card className="mx-auto max-w-2xl space-y-3 p-4 sm:p-6">
          <h1 className="text-2xl font-semibold">Create Payroll Group</h1>
          <p className="text-sm text-muted-foreground">
            Payroll group creation is available via the contract API (<code>create_payroll_group</code>) and is not yet exposed as a dedicated form in this UI.
            Use the NEAR dashboard flows or contract calls with verified parameters. Existing payroll groups can be managed from Payroll, Workers, and Funding.
          </p>
          <Button variant="outline" onClick={() => window.history.length > 1 ? window.history.back() : undefined}>Go back</Button>
        </Card>
      )
    case 'payrollGroup':
      return <PayrollDashboard groupId={Number(route.groupId)} />
    case 'workers':
      return <WorkersDashboard />
    case 'funding':
      return <FundingDashboard />
    case 'approvals':
      return <ApprovalsDashboard />
    case 'vigil':
      return <VigilDashboard />
    case 'beneficiaries':
      return <BeneficiariesDashboard />
    case 'activity':
      return <ActivityDashboard />
    case 'settings':
      return <SettingsDashboard />
    case 'public':
      return <NearDashboard key={`public-${route.id.toString()}`} id={Number(route.id)} readOnly={true} />
    default:
      return <Overview />
  }
}
