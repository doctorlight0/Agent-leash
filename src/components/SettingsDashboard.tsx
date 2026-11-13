import { useNear } from '@/hooks/useNear'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Settings, Wallet, Download, Loader2 } from 'lucide-react'
import { formatAddress } from '@/lib/utils'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export function SettingsDashboard() {
  const { connected, accountId, disconnect } = useNear()
  const [activeTab, setActiveTab] = useState('general')
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState({
    theme: 'system',
    notifications: {
      email: true,
      push: true,
      paymentAlerts: true,
      vigilAlerts: true,
      payrollAlerts: true,
    },
    display: {
      currency: 'USDC',
      timezone: 'local',
      dateFormat: 'relative',
    },
    privacy: {
      showInPublicDirectory: false,
      shareAnalytics: true,
    },
  })

  const handleSave = async () => {
    setSaving(true)
    try {
      localStorage.setItem('agent-leash-settings', JSON.stringify(settings))
      await new Promise(r => setTimeout(r, 300))
      toast.success('Settings saved')
    } catch (error) {
      console.error('Failed to save settings:', error)
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleExportData = () => {
    const data = { settings, exportedAt: new Date().toISOString(), accountId }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `agent-leash-settings-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!connected) {
    return (
      <div className="text-center py-12">
        <Settings className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold">Connect Wallet</h2>
        <p className="text-muted-foreground">Connect your NEAR wallet to manage settings</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
          <p className="text-muted-foreground">Manage your preferences and account settings</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportData} className="gap-2">
            <Download className="h-4 w-4" />
            Export Data
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving} className="gap-2">
            <Loader2 className={cn('h-4 w-4', saving && 'animate-spin')} />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="display">Display</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Theme</CardTitle>
                <CardDescription>Choose your preferred color theme</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {['light', 'dark', 'system'].map(theme => (
                    <ThemeOption key={theme} theme={theme} selected={settings.theme === theme} onSelect={() => setSettings(prev => ({ ...prev, theme }))} />
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Default Currency</CardTitle>
                <CardDescription>Set your preferred display currency</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <select id="currency" value={settings.display.currency} onChange={(e) => setSettings(prev => ({ ...prev, display: { ...prev.display, currency: e.target.value } }))} className="w-full rounded-lg border border-input bg-background px-3 py-2">
                    <option value="USDC">USDC</option>
                    <option value="NEAR">NEAR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Local UI preferences (no external delivery configured)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <NotificationToggle label="Email Notifications" description="Local preference only" checked={settings.notifications.email} onChange={(checked) => setSettings(prev => ({ ...prev, notifications: { ...prev.notifications, email: checked } }))} />
              <NotificationToggle label="Push Notifications" description="Local preference only" checked={settings.notifications.push} onChange={(checked) => setSettings(prev => ({ ...prev, notifications: { ...prev.notifications, push: checked } }))} />
              <NotificationToggle label="Payment Alerts" description="Notify for payment events in UI" checked={settings.notifications.paymentAlerts} onChange={(checked) => setSettings(prev => ({ ...prev, notifications: { ...prev.notifications, paymentAlerts: checked } }))} />
              <NotificationToggle label="Vigil Alerts" description="Notify for vigil events in UI" checked={settings.notifications.vigilAlerts} onChange={(checked) => setSettings(prev => ({ ...prev, notifications: { ...prev.notifications, vigilAlerts: checked } }))} />
              <NotificationToggle label="Payroll Alerts" description="Notify for payroll events in UI" checked={settings.notifications.payrollAlerts} onChange={(checked) => setSettings(prev => ({ ...prev, notifications: { ...prev.notifications, payrollAlerts: checked } }))} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="display">
          <Card>
            <CardHeader>
              <CardTitle>Display Preferences</CardTitle>
              <CardDescription>Stored locally in this browser</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <select id="timezone" value={settings.display.timezone} onChange={(e) => setSettings(prev => ({ ...prev, display: { ...prev.display, timezone: e.target.value } }))} className="w-full rounded-lg border border-input bg-background px-3 py-2">
                  <option value="local">Local (Browser)</option>
                  <option value="utc">UTC</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateFormat">Date Format</Label>
                <select id="dateFormat" value={settings.display.dateFormat} onChange={(e) => setSettings(prev => ({ ...prev, display: { ...prev.display, dateFormat: e.target.value } }))} className="w-full rounded-lg border border-input bg-background px-3 py-2">
                  <option value="relative">Relative</option>
                  <option value="absolute">Absolute</option>
                  <option value="iso">ISO 8601</option>
                </select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="privacy">
          <Card>
            <CardHeader>
              <CardTitle>Privacy Settings</CardTitle>
              <CardDescription>Local preferences; no external analytics pipeline is wired in this build</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <NotificationToggle label="Public Directory" description="Local preference flag only" checked={settings.privacy.showInPublicDirectory} onChange={(checked) => setSettings(prev => ({ ...prev, privacy: { ...prev.privacy, showInPublicDirectory: checked } }))} />
              <NotificationToggle label="Share Analytics" description="Local preference flag only" checked={settings.privacy.shareAnalytics} onChange={(checked) => setSettings(prev => ({ ...prev, privacy: { ...prev.privacy, shareAnalytics: checked } }))} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account">
          <Card>
            <CardHeader><CardTitle>Connected Account</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted">
                <Wallet className="h-10 w-10 text-muted-foreground" />
                <div>
                  <p className="font-medium">Connected as</p>
                  <p className="font-mono text-lg" title={accountId || ''}>{formatAddress(accountId || '')}</p>
                  <p className="text-xs text-muted-foreground font-mono break-all">{accountId}</p>
                </div>
              </div>
              <Button variant="destructive" onClick={() => void disconnect()} className="w-full gap-2">
                <Wallet className="h-4 w-4" />
                Disconnect Wallet
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Danger Zone</CardTitle>
              <CardDescription>Irreversible local actions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-destructive">Clear Local Data</p>
                  <p className="text-sm text-muted-foreground">Remove cached settings from this browser</p>
                </div>
                <Button variant="destructive" onClick={() => {
                  if (confirm('This will clear local browser data for this app. Continue?')) {
                    localStorage.clear()
                    toast.info('Local data cleared')
                  }
                }}>Clear Data</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ThemeOption({ theme, selected, onSelect }: { theme: string; selected: boolean; onSelect: () => void }) {
  const themePreviews: Record<string, { bg: string; border: string }> = {
    light: { bg: 'bg-white', border: 'border-gray-300' },
    dark: { bg: 'bg-gray-900', border: 'border-gray-700' },
    system: { bg: 'bg-gradient-to-r from-white to-gray-900', border: 'border-gray-300' },
  }
  const preview = themePreviews[theme] || themePreviews.light
  return (
    <button type="button" onClick={onSelect} className={cn('relative p-4 rounded-lg border-2 transition-all', selected ? 'border-primary bg-primary/5' : 'border-transparent hover:border-gray-300', preview.border)}>
      <div className={cn('h-16 rounded mb-2', preview.bg)} />
      <span className="font-medium capitalize">{theme}</span>
      {selected && (
        <div className="absolute top-2 right-2 text-primary">
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
        </div>
      )}
    </button>
  )
}

function NotificationToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
