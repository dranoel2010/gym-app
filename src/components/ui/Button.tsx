import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'

/**
 * Knoepfe nach dem Design: fette Manrope-800-Beschriftung, grosse Radien,
 * Lime-Flaeche mit tiefschwarzer Schrift.
 *
 * `ink` ist die Umkehrung aus dem Plan-Detail-Screen ("Push Day starten"):
 * schwarze Flaeche, Lime-Schrift. Sie kommt zum Einsatz, wenn schon ein
 * Lime-Element in der Naehe ist und ein zweites die Hierarchie zerstoeren wuerde.
 */
type Variant = 'primary' | 'ink' | 'secondary' | 'ghost' | 'danger' | 'quiet' | 'on-ink'
type Size = 'sm' | 'md' | 'lg'

const base =
  'relative inline-flex items-center justify-center gap-2 font-sans font-extrabold ' +
  'select-none transition-[transform,background-color,border-color,color,box-shadow,opacity] ' +
  'duration-[var(--dur-fast)] ease-[var(--ease-out)] ' +
  'active:scale-[0.975] disabled:pointer-events-none disabled:opacity-40 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'

const variants: Record<Variant, string> = {
  // Flach, ohne Schein: im Design leuchtet nur der schwebende Plus-Knopf,
  // nicht jede Primäraktion.
  primary: 'bg-accent text-accent-ink hover:bg-accent-hi',
  ink: 'bg-ink text-accent hover:brightness-125',
  secondary: 'bg-surface text-fg border border-line hover:border-line-strong hover:bg-surface-2',
  ghost: 'text-muted hover:text-fg hover:bg-surface-2',
  danger: 'bg-danger text-[var(--danger-ink)] hover:bg-danger-hi',
  quiet: 'text-danger hover:bg-[var(--danger-soft)]',
  // Fuer Knoepfe, die auf einer dauerhaft dunklen Flaeche sitzen.
  'on-ink': 'border border-[var(--ink-line)] bg-transparent text-on-ink hover:bg-[var(--ink-3)]',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 rounded-[12px] px-3.5 text-[13px]',
  md: 'min-h-[var(--tap-min)] rounded-[15px] px-4 text-[15px]',
  lg: 'min-h-[56px] rounded-[18px] px-5 text-[17px]',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  block?: boolean
  icon?: ReactNode
  iconRight?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    block = false,
    icon,
    iconRight,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      // Waehrend eines Ladevorgangs gesperrt — das ist zugleich der
      // Doppelklick-Schutz, den Spec §3.2 fuer jede schreibende Aktion verlangt.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], sizes[size], block && 'w-full', className)}
      {...rest}
    >
      {loading ? (
        <Spinner />
      ) : (
        icon && <span className="shrink-0 text-[1.15em] leading-none">{icon}</span>
      )}
      {children}
      {iconRight && !loading && (
        <span className="shrink-0 text-[1.15em] leading-none">{iconRight}</span>
      )}
    </button>
  )
})

function Spinner() {
  return (
    <span
      className="animate-spin-slow inline-block size-[1.05em] shrink-0 rounded-full border-2 border-current border-r-transparent"
      aria-hidden="true"
    />
  )
}

/** Optisch identisch zum Button, navigiert aber statt zu handeln. */
export function LinkButton({
  to,
  variant = 'primary',
  size = 'md',
  block = false,
  icon,
  iconRight,
  className,
  children,
}: {
  to: string
  variant?: Variant
  size?: Size
  block?: boolean
  icon?: ReactNode
  iconRight?: ReactNode
  className?: string
  children?: ReactNode
}) {
  return (
    <Link to={to} className={cn(base, variants[variant], sizes[size], block && 'w-full', className)}>
      {icon && <span className="shrink-0 text-[1.15em] leading-none">{icon}</span>}
      {children}
      {iconRight && <span className="shrink-0 text-[1.15em] leading-none">{iconRight}</span>}
    </Link>
  )
}

/** Quadratischer Knopf fuer reine Symbolaktionen (Loeschen, Bearbeiten …). */
export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string
    variant?: Variant
    loading?: boolean
  }
>(function IconButton({ label, variant = 'ghost', loading, className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      disabled={rest.disabled || loading}
      className={cn(
        base,
        variants[variant],
        'size-11 shrink-0 rounded-[13px] p-0 text-[19px] shadow-none',
        className
      )}
      {...rest}
    >
      {loading ? <Spinner /> : children}
    </button>
  )
})

/**
 * Runder Knopf im Stil der −15 / +15 Tasten des Pausen-Timers.
 * Sitzt immer auf einer dunklen Flaeche.
 */
export function RoundButton({
  label,
  onClick,
  children,
  className,
  disabled,
}: {
  label: string
  onClick: () => void
  children: ReactNode
  className?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-full border-[1.5px] border-[var(--ink-line)]',
        'text-[13px] font-extrabold text-on-ink transition-[background-color,transform] duration-[var(--dur-fast)]',
        'hover:bg-[var(--ink-3)] active:scale-95 disabled:opacity-40',
        className
      )}
    >
      {children}
    </button>
  )
}
