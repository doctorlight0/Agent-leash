import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { DerivedEvents } from './useLeashEvents'
import { usd } from '@/lib/chain'

const KEY = 'agent-leash:browser-alerts'

function notify(title: string, body: string) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && localStorage.getItem(KEY) === '1') {
    try {
      new Notification(title, { body })
    } catch {
      // some browsers block constructing notifications outside a service worker
    }
  }
}

/** Browser alerts are opt-in. Returns whether they are on and a toggle. */
export function useBrowserAlerts() {
  const supported = typeof Notification !== 'undefined'
  const [on, setOn] = useState(() => supported && Notification.permission === 'granted' && localStorage.getItem(KEY) === '1')
  const toggle = async () => {
    if (!supported) return
    if (on) {
      localStorage.setItem(KEY, '0')
      setOn(false)
      return
    }
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    if (perm === 'granted') {
      localStorage.setItem(KEY, '1')
      setOn(true)
    }
  }
  return { supported, on, toggle }
}

/**
 * Watches a leash while its page is open and tells the owner when something needs attention:
 * a new approval request, payments being rejected is not visible onchain, so only requests and revokes.
 */
export function useLeashAlerts(leashId: bigint, derived: DerivedEvents | undefined, enabled: boolean) {
  const seen = useRef<Set<string> | undefined>(undefined)

  useEffect(() => {
    if (!enabled || !derived) return
    const ids = new Set(derived.requests.filter((r) => r.status === 'pending').map((r) => String(r.requestId)))
    if (seen.current === undefined) {
      seen.current = ids
      return
    }
    for (const r of derived.requests) {
      const key = String(r.requestId)
      if (r.status === 'pending' && !seen.current.has(key)) {
        const text = `Leash #${leashId.toString()}: the agent asks to pay ${usd(r.amount)} USDC. "${r.reason}"`
        toast.message('Approval needed', { description: text, duration: 10000 })
        notify('Approval needed', text)
      }
    }
    seen.current = ids
  }, [derived, enabled, leashId])
}
