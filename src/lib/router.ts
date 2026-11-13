import { useEffect, useState } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'overview' }
  | { name: 'leashes' }
  | { name: 'leashNew' }
  | { name: 'leash'; id: bigint; readOnly?: boolean }
  | { name: 'payroll' }
  | { name: 'payrollNew' }
  | { name: 'payrollGroup'; groupId: bigint }
  | { name: 'workers' }
  | { name: 'funding' }
  | { name: 'approvals' }
  | { name: 'vigil' }
  | { name: 'beneficiaries' }
  | { name: 'activity' }
  | { name: 'settings' }
  | { name: 'public'; id: bigint }

export function parseRoute(pathname: string): Route {
  if (pathname === '/' || pathname === '/home') return { name: 'home' }
  if (pathname === '/overview') return { name: 'overview' }
  if (pathname === '/leashes') return { name: 'leashes' }
  if (pathname === '/leashes/new') return { name: 'leashNew' }
  if (pathname === '/payroll') return { name: 'payroll' }
  if (pathname === '/payroll/new') return { name: 'payrollNew' }
  if (pathname === '/workers') return { name: 'workers' }
  if (pathname === '/funding') return { name: 'funding' }
  if (pathname === '/approvals') return { name: 'approvals' }
  if (pathname === '/vigil') return { name: 'vigil' }
  if (pathname === '/beneficiaries') return { name: 'beneficiaries' }
  if (pathname === '/activity') return { name: 'activity' }
  if (pathname === '/settings') return { name: 'settings' }

  const manage = /^\/leash\/(\d{1,18})\/?$/.exec(pathname)
  if (manage) return { name: 'leash', id: BigInt(manage[1]) }

  const pub = /^\/l\/(\d{1,18})\/?$/.exec(pathname)
  if (pub) return { name: 'public', id: BigInt(pub[1]) }

  const payrollGroup = /^\/payroll\/(\d{1,18})\/?$/.exec(pathname)
  if (payrollGroup) return { name: 'payrollGroup', groupId: BigInt(payrollGroup[1]) }

  return { name: 'overview' }
}

export function navigate(path: string) {
  if (window.location.pathname === path) return
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top: 0 })
}

export function useNavigate() {
  return navigate
}

export function useRoute(): Route {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return parseRoute(path)
}