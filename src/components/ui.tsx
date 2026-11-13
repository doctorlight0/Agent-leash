import { clsx } from 'clsx'
import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { Check, Copy, Loader2 } from 'lucide-react'
import { usd } from '@/lib/chain'

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={clsx('glass min-w-0 overflow-hidden rounded-3xl p-4 sm:p-6', className)}>{children}</section>
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-xl bg-white/5', className)} />
}

type Variant = 'primary' | 'ghost' | 'danger' | 'outline'

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  onClick?: () => unknown
  variant?: Variant
  loading?: boolean
  size?: 'md' | 'sm'
}

const VARIANTS: Record<Variant, string> = {
  primary: 'btn-accent text-accentInk hover:brightness-105',
  ghost: 'bg-white/[0.06] text-ink hover:bg-white/10 border border-white/[0.06]',
  outline: 'border border-lineStrong text-ink hover:bg-white/5',
  danger: 'bg-danger text-white hover:brightness-110',
}

export function Button({ variant = 'primary', loading, size = 'md', className, children, disabled, onClick, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      onClick={onClick ? () => void onClick() : undefined}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex max-w-full items-center justify-center gap-2 whitespace-normal rounded-2xl text-center font-semibold leading-tight transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100',
        size === 'md' ? 'min-h-[52px] px-5 text-[15px] sm:px-6' : 'min-h-[44px] px-4 text-sm',
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string
  suffix?: ReactNode
}

export function Field({ label, hint, error, suffix, className, ...rest }: FieldProps) {
  return (
    <label className={clsx('block', className)}>
      {label && <span className="label">{label}</span>}
      <span
        className={clsx(
          'glass-inner mt-1.5 flex min-h-[52px] items-center gap-2 rounded-2xl px-4 transition focus-within:border-accent/70 focus-within:bg-white/[0.05]',
          error && '!border-danger/70',
        )}
      >
        <input
          {...rest}
          className="min-w-0 flex-1 bg-transparent py-3 text-base tabular-nums text-ink outline-none placeholder:text-muted/50"
        />
        {suffix && <span className="shrink-0 text-xs font-semibold tracking-wide text-muted">{suffix}</span>}
      </span>
      {error ? <span className="mt-1.5 block text-xs text-danger">{error}</span> : hint ? <span className="mt-1.5 block text-xs text-muted">{hint}</span> : null}
    </label>
  )
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'min-h-[38px] rounded-full border px-3.5 text-xs font-semibold transition active:scale-95',
        active ? 'border-accent/70 bg-accent/15 text-accent' : 'border-white/10 text-muted hover:border-white/25 hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

export function Stat({ label, value, sub, meter }: { label: string; value: ReactNode; sub?: ReactNode; meter?: number }) {
  return (
    <div className="glass-inner rounded-2xl p-4">
      <div className="label">{label}</div>
      <div className="display mt-1.5 text-[22px] font-semibold tabular-nums leading-none">{value}</div>
      {meter !== undefined && (
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full origin-left rounded-full bg-accent"
            initial={false}
            animate={{ scaleX: Math.max(0, Math.min(1, meter)) }}
            transition={{ type: 'spring', stiffness: 120, damping: 22 }}
          />
        </div>
      )}
      {sub && <div className="mt-2 text-xs text-muted">{sub}</div>}
    </div>
  )
}

export function SectionTitle({ n, title, sub }: { n: string; title: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="display mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-xs font-bold text-accent">
        {n}
      </span>
      <div>
        <h3 className="display text-lg font-semibold leading-tight">{title}</h3>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
    </div>
  )
}

interface TabDef<T extends string> {
  id: T
  label: string
  badge?: number
}

/** Segmented tab bar with an animated selection pill. */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: TabDef<T>[]; value: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" className="glass flex max-w-full gap-1 overflow-x-auto rounded-2xl p-1">
      {tabs.map((t) => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={clsx(
              'relative flex min-h-[44px] min-w-max flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors',
              active ? 'text-accentInk' : 'text-muted hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId="tab-pill"
                className="btn-accent absolute inset-0 rounded-xl"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{t.label}</span>
            {!!t.badge && (
              <span
                className={clsx(
                  'relative rounded-full px-1.5 text-[10px] font-bold',
                  active ? 'bg-accentInk/80 text-accent' : 'bg-accent text-accentInk',
                )}
              >
                {t.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function CopyButton({ text, label = 'Copy', className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            setDone(true)
            setTimeout(() => setDone(false), 1600)
          })
          .catch(() => undefined)
      }}
      className={clsx(
        'inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-muted transition hover:bg-white/10 hover:text-ink',
        className,
      )}
    >
      {done ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? 'Copied' : label}
    </button>
  )
}

/** USDC amount that eases to its new value when live data changes. */
export function AnimatedUsdc({ value }: { value: bigint }) {
  const [display, setDisplay] = useState(value)
  const ref = useRef(Number(value))
  useEffect(() => {
    const target = Number(value)
    let raf = 0
    const tick = () => {
      ref.current += (target - ref.current) * 0.16
      if (Math.abs(target - ref.current) < 1) ref.current = target
      setDisplay(BigInt(Math.round(ref.current)))
      if (ref.current !== target) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{usd(display)}</>
}
