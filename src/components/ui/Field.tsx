import { forwardRef, useId } from 'react'
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/cn'
import { IconAlert, IconChevronDown } from './Icons'

/**
 * Formularbausteine.
 *
 * Alle Eingaben sind mindestens 48 px hoch und haben eine Schriftgroesse von
 * 16 px — darunter zoomt iOS Safari beim Fokussieren automatisch hinein, was
 * die Bedienung mit einer Hand ruiniert.
 */

const controlBase =
  'w-full rounded-[var(--radius-md)] border bg-surface-2 px-3.5 text-base text-fg ' +
  'placeholder:text-subtle transition-[border-color,background-color,box-shadow] ' +
  'duration-[var(--dur-fast)] outline-none ' +
  'focus:border-[var(--accent)] focus:bg-surface ' +
  'focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_22%,transparent)] ' +
  'disabled:opacity-50'

const controlError =
  'border-[var(--danger)] focus:border-[var(--danger)] ' +
  'focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--danger)_22%,transparent)]'

/* -------------------------------------------------------------------------- */

export interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  error?: string
  /** Zusatz rechts neben dem Label, z. B. eine Einheit oder ein Hinweis. */
  aside?: ReactNode
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode
  className?: string
}

export function Field({ label, hint, error, aside, children, className }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errId = `${id}-err`
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(' ')

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {(label || aside) && (
        <div className="flex items-baseline justify-between gap-3">
          {label && (
            <label htmlFor={id} className="text-[13px] font-semibold text-muted">
              {label}
            </label>
          )}
          {aside && <span className="text-[12px] text-subtle">{aside}</span>}
        </div>
      )}

      {children({ id, describedBy: describedBy || undefined, invalid: !!error })}

      {hint && !error && (
        <p id={hintId} className="text-[12.5px] leading-snug text-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errId}
          role="alert"
          className="flex items-start gap-1.5 text-[12.5px] leading-snug font-medium text-danger"
        >
          <IconAlert className="mt-px shrink-0 text-[14px]" />
          {error}
        </p>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ className, invalid, ...rest }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(controlBase, 'h-12', invalid ? controlError : 'border-line', className)}
      {...rest}
    />
  )
})

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        controlBase,
        'min-h-24 resize-y py-3 leading-relaxed',
        invalid ? controlError : 'border-line',
        className
      )}
      {...rest}
    />
  )
})

/**
 * Auswahlfeld.
 *
 * `tone="ink"` ist die Variante fuer die dauerhaft dunklen Karten. Sie bekommt
 * eine eigene Klassenkette statt zusaetzlicher Ueberschreibungen: Farbklassen
 * gleicher Spezifitaet haetten sich sonst je nach Reihenfolge im Stylesheet
 * gegenseitig ausgestochen — genau das ist beim ersten Versuch passiert.
 */
export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; tone?: 'default' | 'ink' }
>(function Select({ className, invalid, tone = 'default', children, ...rest }, ref) {
  const inkBase =
    'w-full rounded-[var(--radius-md)] border border-[var(--ink-line)] bg-[var(--ink-2)] px-3.5 ' +
    'text-base font-semibold text-[var(--on-ink)] outline-none ' +
    'transition-[border-color,box-shadow] duration-[var(--dur-fast)] ' +
    'focus:border-[var(--accent)] ' +
    'focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_22%,transparent)]'

  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          tone === 'ink' ? inkBase : controlBase,
          'h-12 appearance-none pr-11',
          tone === 'ink' ? '' : invalid ? controlError : 'border-line',
          className
        )}
        {...rest}
      >
        {children}
      </select>
      <IconChevronDown
        className={cn(
          'pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[18px]',
          tone === 'ink' ? 'text-[var(--on-ink-muted)]' : 'text-subtle'
        )}
      />
    </div>
  )
})

/* -------------------------------------------------------------------------- */

/**
 * Zahlenfeld mit grossen Plus/Minus-Knoepfen.
 *
 * Auf dem Handy ist das native Steppen nicht bedienbar und die Tastatur mit
 * schwitzigen Fingern unzuverlaessig — ein Tipp auf "+" ist deutlich robuster.
 * `inputMode` steuert, welche Tastatur erscheint: ganze Zahlen ohne Komma,
 * Gewichte mit.
 */
export const NumberField = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> & {
    value: string
    onValueChange: (v: string) => void
    step?: number
    min?: number
    max?: number
    decimal?: boolean
    invalid?: boolean
    /** Grosse Variante fuer die Satz-Eingabe im Training. */
    emphasis?: boolean
    /**
     * Plus/Minus-Knoepfe anzeigen.
     *
     * In schmalen Spalten ausschalten: zwei Knoepfe zu je 44 px lassen in einem
     * Drittel von 390 px nichts mehr fuer die Zahl uebrig.
     */
    steppers?: boolean
  }
>(function NumberField(
  {
    value,
    onValueChange,
    step = 1,
    min = 0,
    max,
    decimal = false,
    invalid,
    emphasis = false,
    steppers = true,
    className,
    placeholder,
    ...rest
  },
  ref
) {
  const bump = (dir: 1 | -1) => {
    const current = parseFloat((value || String(placeholder ?? '0')).replace(',', '.'))
    const start = Number.isFinite(current) ? current : 0
    let next = start + dir * step
    if (min !== undefined) next = Math.max(min, next)
    if (max !== undefined) next = Math.min(max, next)
    // Gleitkomma aufraeumen: 0.1 + 0.2 soll 0,3 ergeben, nicht 0,30000000000000004
    const rounded = Math.round(next * 100) / 100
    onValueChange(decimal ? String(rounded).replace('.', ',') : String(Math.round(rounded)))
  }

  return (
    <div
      className={cn(
        'flex items-stretch overflow-hidden rounded-[var(--radius-md)] border bg-surface-2',
        'transition-[border-color,box-shadow] duration-[var(--dur-fast)]',
        'focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_22%,transparent)]',
        invalid ? 'border-[var(--danger)]' : 'border-line',
        emphasis ? 'h-14' : 'h-12',
        className
      )}
    >
      {steppers && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Verringern"
          onClick={() => bump(-1)}
          className="grid w-11 shrink-0 place-items-center text-muted transition-colors hover:bg-surface-3 hover:text-fg active:bg-surface-3"
        >
          <IconMinusGlyph />
        </button>
      )}
      <input
        ref={ref}
        type="text"
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          // Nur Ziffern und ein Trenner. Verhindert, dass die Tastatur eines
          // fremden Layouts Buchstaben durchreicht.
          const raw = e.target.value.replace(decimal ? /[^\d.,]/g : /[^\d]/g, '')
          onValueChange(raw)
        }}
        className={cn(
          'tnum min-w-0 flex-1 bg-transparent text-center font-semibold outline-none',
          'placeholder:font-medium placeholder:text-subtle',
          emphasis ? 'text-[22px]' : 'text-base'
        )}
        {...rest}
      />
      {steppers && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Erhöhen"
          onClick={() => bump(1)}
          className="grid w-11 shrink-0 place-items-center text-muted transition-colors hover:bg-surface-3 hover:text-fg active:bg-surface-3"
        >
          <IconPlusGlyph />
        </button>
      )}
    </div>
  )
})

function IconMinusGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
      <path d="M5 12h14" />
    </svg>
  )
}

function IconPlusGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
