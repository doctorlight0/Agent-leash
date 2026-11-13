import { useEffect, useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { buildShareLink } from '@/lib/share'
import { Button } from './ui'

/** Copy / share the read-only public link of a leash. The base URL is resolved once on mount. */
export function ShareButton({ leashId }: { leashId: bigint }) {
  const [link, setLink] = useState<string>()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let live = true
    void buildShareLink(`/l/${leashId.toString()}`).then((l) => {
      if (live) setLink(l)
    })
    return () => {
      live = false
    }
  }, [leashId])

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Could not copy. Select the link and copy it by hand.')
    }
  }

  const share = async () => {
    if (!link) return
    try {
      await navigator.share({ title: `Agent Leash #${leashId.toString()}`, url: link })
    } catch {
      await copy()
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="ghost" onClick={copy} disabled={!link}>
        {copied ? <Check className="h-4 w-4 text-ok" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Copied' : 'Copy public link'}
      </Button>
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <Button size="sm" variant="ghost" onClick={share} disabled={!link} aria-label="Share">
          <Share2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
