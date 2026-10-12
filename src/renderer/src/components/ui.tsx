import { type ButtonHTMLAttributes, type ReactNode, useEffect, useState } from 'react'
import { onPlaying } from '@/lib/audio'
import { IconVolume } from './icons'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
export { cx }

type Variant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger'

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[0.98] disabled:opacity-50',
        size === 'sm' && 'h-8 px-3 text-sm',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-6 text-base',
        variant === 'primary' && 'bg-ink text-paper hover:opacity-90',
        variant === 'accent' && 'bg-accent text-white hover:opacity-90',
        variant === 'secondary' && 'border border-line bg-surface hover:bg-paper',
        variant === 'ghost' && 'text-muted hover:bg-line/50 hover:text-ink',
        variant === 'danger' && 'border border-line text-accent hover:bg-accent-soft',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('card', className)}>{children}</div>
}

export function PageHeader({ title, jp, subtitle, right }: { title: string; jp?: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {jp && <span className="jp text-lg text-muted">{jp}</span>}
        </div>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {right}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; badge?: ReactNode }[] }) {
  return (
    <div className="mb-6 inline-flex rounded-xl border border-line bg-surface p-1">
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={cx(
            'flex h-8 items-center gap-2 rounded-lg px-4 text-sm transition',
            value === it.value ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
          )}
        >
          {it.label}
          {it.badge}
        </button>
      ))}
    </div>
  )
}

export function Progress({ value, max, color = 'bg-ink', className }: { value: number; max: number; color?: string; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className={cx('h-2 overflow-hidden rounded-full bg-line', className)}>
      <div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Badge({ children, tone = 'muted', className }: { children: ReactNode; tone?: 'muted' | 'accent' | 'indigo' | 'good' | 'warn'; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium',
        tone === 'muted' && 'bg-line/70 text-muted',
        tone === 'accent' && 'bg-accent-soft text-accent',
        tone === 'indigo' && 'bg-indigo-soft text-indigo',
        tone === 'good' && 'bg-good-soft text-good',
        tone === 'warn' && 'bg-warn-soft text-warn',
        className
      )}
    >
      {children}
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-paper px-1.5 py-0.5 font-sans text-[10px] text-muted">{children}</kbd>
}

export function Spinner({ className }: { className?: string }) {
  return <div className={cx('h-5 w-5 animate-spin rounded-full border-2 border-line border-t-ink', className)} />
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="jp mb-3 text-5xl text-line">〇</div>
      <div className="text-lg font-medium">{title}</div>
      {children && <div className="mt-2 max-w-md text-sm text-muted">{children}</div>}
    </div>
  )
}

/** Nút phát audio nhỏ; nhấp nháy khi đang phát. */
export function AudioButton({ onPlay, size = 'md', className, title = 'Nghe (R)' }: { onPlay: () => Promise<unknown>; size?: 'sm' | 'md' | 'lg'; className?: string; title?: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      title={title}
      onClick={async (e) => {
        e.stopPropagation()
        setBusy(true)
        try {
          await onPlay()
        } finally {
          setBusy(false)
        }
      }}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted transition hover:border-ink hover:text-ink',
        size === 'sm' && 'h-7 w-7',
        size === 'md' && 'h-9 w-9',
        size === 'lg' && 'h-16 w-16',
        busy && 'border-accent text-accent',
        className
      )}
    >
      <IconVolume size={size === 'lg' ? 28 : size === 'sm' ? 14 : 18} />
    </button>
  )
}

export function usePlaying() {
  const [p, setP] = useState(false)
  useEffect(() => {
    const off = onPlaying(setP)
    return () => {
      off()
    }
  }, [])
  return p
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm select-none">
      <span
        onClick={() => onChange(!checked)}
        className={cx('relative h-5 w-9 rounded-full transition', checked ? 'bg-ink' : 'bg-line')}
      >
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow transition', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
      {label}
    </label>
  )
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="text-xs tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  )
}

export function Segmented<T extends string | number>({ value, onChange, items, size = 'sm' }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[]; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {items.map((it) => (
        <button
          key={String(it.value)}
          onClick={() => onChange(it.value)}
          className={cx(
            'rounded-md px-2.5 transition',
            size === 'sm' ? 'h-7 text-xs' : 'h-8 text-sm',
            value === it.value ? 'bg-paper font-medium text-ink shadow-sm' : 'text-muted hover:text-ink'
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}
