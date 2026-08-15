import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Anzeigebausteine im Stil des Designs. */

export function Card({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'section' | 'li' | 'article'
}) {
  return <Tag className={cn('card p-4', className)}>{children}</Tag>
}

/**
 * Die dunkle Fokus-Karte des Designs — bleibt in beiden Modi tiefschwarz.
 * `glow` setzt den Lime-Schein in die obere rechte Ecke.
 */
export function InkCard({
  children,
  className,
  glow = true,
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  glow?: boolean
  as?: 'div' | 'section' | 'article'
}) {
  return (
    <Tag className={cn('ink-card on-ink p-5', glow && 'ink-glow', className)}>
      <div className="relative">{children}</div>
    </Tag>
  )
}

/** Kleine Grossbuchstaben-Zeile ueber einer Ueberschrift. */
export function Eyebrow({
  children,
  className,
  tone = 'accent',
}: {
  children: ReactNode
  className?: string
  tone?: 'accent' | 'muted'
}) {
  return (
    <div
      className={cn(
        'eyebrow',
        tone === 'accent' ? 'text-accent' : 'text-subtle',
        className
      )}
    >
      {children}
    </div>
  )
}

export function SectionTitle({
  children,
  action,
  className,
}: {
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-3 flex items-baseline justify-between gap-3', className)}>
      <h2 className="font-display text-[18px]">{children}</h2>
      {action}
    </div>
  )
}

type Tone = 'neutral' | 'accent' | 'ink' | 'success' | 'warn' | 'danger'

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted border-line',
  accent: 'bg-accent text-accent-ink border-transparent',
  ink: 'bg-ink text-accent border-transparent',
  success: 'bg-[var(--success-soft)] text-[var(--success)] border-transparent',
  warn: 'bg-[var(--warn-soft)] text-[var(--warn)] border-transparent',
  danger: 'bg-[var(--danger-soft)] text-danger border-transparent',
}

export function Badge({
  children,
  tone = 'neutral',
  className,
  icon,
  uppercase = false,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
  icon?: ReactNode
  uppercase?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-extrabold whitespace-nowrap',
        uppercase && 'tracking-[0.08em] uppercase',
        toneClasses[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  )
}

/**
 * Kennzahlkachel — weisse Karte, Zahl in Archivo Black, Label darunter.
 * Genau die Dreier-Reihe vom Dashboard des Designs.
 */
export function StatTile({
  label,
  value,
  unit,
  hint,
  className,
}: {
  label: string
  value: ReactNode
  unit?: string
  hint?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('card p-4', className)}>
      <div className="font-display tnum flex items-baseline gap-0.5 text-[26px] leading-none">
        {value}
        {unit && <span className="text-[14px] text-muted">{unit}</span>}
      </div>
      <div className="mt-1.5 text-[12px] font-semibold text-muted">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] font-semibold text-subtle">{hint}</div>}
    </div>
  )
}

/**
 * Segmentierte Auswahl.
 *
 * `pill` ist die Wochen/Monat-Umschaltung aus dem Statistik-Screen,
 * `grid` die Wochenbewertung 1–5 im Check-in.
 */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  name,
  ariaLabel,
  variant = 'grid',
  /** Erneuter Klick auf denselben Wert hebt die Auswahl auf (Spec §4.11). */
  allowDeselect = true,
  className,
}: {
  options: Array<{ value: T; label: ReactNode; title?: string }>
  value: T | null
  onChange: (v: T | null) => void
  name: string
  ariaLabel?: string
  variant?: 'grid' | 'pill'
  allowDeselect?: boolean
  className?: string
}) {
  const isPill = variant === 'pill'

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        isPill
          ? 'inline-flex gap-1 rounded-full bg-surface-3 p-1'
          : 'grid gap-1.5 rounded-[var(--radius-md)] border border-line bg-surface-2 p-1.5',
        className
      )}
      style={isPill ? undefined : { gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}
    >
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            name={name}
            title={opt.title}
            aria-checked={active}
            onClick={() => onChange(active && allowDeselect ? null : opt.value)}
            className={cn(
              'font-sans font-extrabold transition-[background-color,color,transform] duration-[var(--dur-fast)] active:scale-[0.97]',
              isPill
                ? 'rounded-full px-4 py-1.5 text-[12.5px]'
                : 'tap flex items-center justify-center rounded-[12px] text-[15px]',
              active
                ? isPill
                  ? 'bg-ink text-on-ink'
                  : 'bg-accent text-accent-ink'
                : 'text-muted hover:bg-surface-3 hover:text-fg'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Nummerierte Listenzeile — die "01 Bankdrücken · 4 Sätze · 8–10 Wdh."-Zeile
 * aus dem Plan-Detail des Designs.
 */
export function NumberedRow({
  index,
  title,
  subtitle,
  trailing,
  dimmed = false,
  className,
}: {
  index: number
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  dimmed?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3.5 rounded-[18px] border border-line bg-surface px-4 py-3.5',
        dimmed && 'opacity-55',
        className
      )}
    >
      <div className="font-display tnum grid size-11 shrink-0 place-items-center rounded-[12px] bg-surface-2 text-[15px] text-subtle">
        {String(index).padStart(2, '0')}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-extrabold">{title}</div>
        {subtitle && (
          <div className="mt-0.5 truncate text-[12px] font-semibold text-muted">{subtitle}</div>
        )}
      </div>
      {trailing}
    </div>
  )
}

/** Zeile fuer Verlaufslisten: Datum links, Werte rechts. */
export function DataRow({
  primary,
  secondary,
  values,
  action,
  className,
}: {
  primary: ReactNode
  secondary?: ReactNode
  values?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-[18px] border border-line bg-surface px-4 py-3',
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-extrabold">{primary}</div>
        {secondary && (
          <div className="mt-0.5 truncate text-[12px] font-semibold text-muted">{secondary}</div>
        )}
      </div>
      {values && (
        <div className="tnum shrink-0 text-right text-[13px] font-semibold text-muted">{values}</div>
      )}
      {action}
    </div>
  )
}

/**
 * Fortschrittsbalken aus Segmenten — im Design die Uebungsleiste oben im
 * Training. Zeigt auf einen Blick, wie weit die Einheit ist.
 */
export function SegmentBar({
  total,
  done,
  className,
  onInk = false,
}: {
  total: number
  done: number
  className?: string
  onInk?: boolean
}) {
  return (
    <div
      className={cn('flex gap-[5px]', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-label={`${done} von ${total} Übungen abgeschlossen`}
    >
      {Array.from({ length: Math.max(total, 1) }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-[5px] flex-1 rounded-full transition-colors duration-[var(--dur)]',
            i < done ? 'bg-accent' : onInk ? 'bg-[var(--ink-line)]' : 'bg-surface-3'
          )}
        />
      ))}
    </div>
  )
}
