import type { ReactNode } from 'react'
import { IconDumbbell } from './ui/Icons'

/**
 * Rahmen der vier Anmeldeseiten.
 *
 * Bewusst immer dunkel — im Design ist der Einstiegsscreen tiefschwarz mit
 * Lime-Schein, unabhaengig davon, wie hell die App danach ist. Der Umschalter
 * fuer Hell/Dunkel sitzt im Konto-Menue innerhalb der App.
 *
 * `.on-ink` markiert den Teilbaum als dauerhaft dunkle Flaeche, damit z. B. das
 * Kalendersymbol nativer Felder umgefaerbt wird.
 */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="on-ink relative flex min-h-dvh flex-col bg-ink text-on-ink">
      {/* Der Lime-Schein oben rechts — die wiederkehrende Geste des Designs. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[240px]"
        style={{
          background:
            'radial-gradient(120% 100% at 80% 0%, rgb(198 242 78 / 0.26), transparent 60%)',
        }}
      />

      <main className="relative flex flex-1 items-center justify-center px-6 py-10">
        <div className="animate-rise w-full max-w-sm">
          <span className="grid size-12 place-items-center rounded-[15px] bg-accent text-[24px] text-accent-ink">
            <IconDumbbell />
          </span>

          <h1 className="font-display mt-6 text-[40px] leading-[0.95] uppercase">{title}</h1>
          {description && (
            <p className="mt-4 text-[15px] leading-relaxed font-medium text-on-ink-muted text-pretty">
              {description}
            </p>
          )}

          <div className="mt-8">{children}</div>

          {footer && (
            <div className="mt-7 text-center text-[14px] font-semibold text-on-ink-muted">
              {footer}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

/** Fehlermeldung im dunklen Auth-Kontext. */
export function InkAlert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-[15px] border border-[color-mix(in_oklab,var(--danger)_45%,transparent)] bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] px-4 py-3 text-[14px] leading-snug font-bold text-[var(--danger-hi)]"
    >
      {children}
    </p>
  )
}

/** Eingabefeld im dunklen Auth-Kontext. */
export function inkFieldClasses(invalid?: boolean): string {
  return [
    'h-13 w-full rounded-[15px] border bg-[var(--ink-2)] px-4 text-base font-semibold text-on-ink',
    'placeholder:font-medium placeholder:text-on-ink-subtle outline-none',
    'transition-[border-color,box-shadow] duration-[var(--dur-fast)]',
    'focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_22%,transparent)]',
    invalid ? 'border-[var(--danger)]' : 'border-[var(--ink-line)]',
  ].join(' ')
}

/** Beschriftung im dunklen Auth-Kontext. */
export function InkField({
  label,
  error,
  aside,
  children,
}: {
  label: ReactNode
  error?: string
  aside?: ReactNode
  children: (props: { id: string; invalid: boolean }) => ReactNode
}) {
  const id = `f-${String(label).replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[12.5px] font-bold text-on-ink-muted">
          {label}
        </label>
        {aside}
      </div>
      {children({ id, invalid: !!error })}
      {error && (
        <p role="alert" className="text-[12.5px] leading-snug font-bold text-[var(--danger-hi)]">
          {error}
        </p>
      )}
    </div>
  )
}
