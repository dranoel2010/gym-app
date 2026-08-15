import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'
import { Button } from './Button'
import { IconX } from './Icons'

/**
 * Modaler Dialog.
 *
 * Auf dem Handy faehrt er als Blatt von unten ein (dort ist der Daumen), am
 * Desktop erscheint er zentriert. Ohne Fremdbibliothek: Fokus wird beim
 * Oeffnen gesetzt, beim Schliessen zurueckgegeben, Escape und Klick auf den
 * Hintergrund schliessen — sofern erlaubt.
 */

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  /** Waehrend eines laufenden Vorgangs darf der Dialog nicht wegklickbar sein. */
  dismissable?: boolean
  className?: string
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissable = true,
  className,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  const handleClose = useCallback(() => {
    if (dismissable) onClose()
  }, [dismissable, onClose])

  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement as HTMLElement | null
    const scrollY = window.scrollY
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        handleClose()
        return
      }
      // Einfache Fokusfalle: Tab zirkuliert innerhalb des Dialogs.
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)

    const t = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        '[data-autofocus], button, input, select, textarea, a[href]'
      )
      target?.focus()
    }, 30)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      window.clearTimeout(t)
      document.body.style.overflow = ''
      window.scrollTo({ top: scrollY })
      previouslyFocused.current?.focus?.()
    }
  }, [open, handleClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="presentation"
    >
      <div
        className="animate-fade-in absolute inset-0 bg-[var(--scrim)]"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn(
          'animate-sheet-in relative z-10 flex max-h-[92dvh] w-full flex-col',
          'border border-line bg-surface shadow-[var(--shadow-lg)]',
          'rounded-t-[var(--radius-xl)] sm:max-w-md sm:rounded-[var(--radius-xl)]',
          className
        )}
      >
        {/* Griffleiste — signalisiert auf dem Handy die Herkunft von unten. */}
        <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-line-strong sm:hidden" />

        <div className="flex items-start gap-3 px-5 pt-4 pb-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-semibold text-balance">{title}</h2>
            {description && (
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{description}</p>
            )}
          </div>
          {dismissable && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Schließen"
              className="-mt-1 -mr-1.5 grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <IconX className="text-[18px]" />
            </button>
          )}
        </div>

        {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">{children}</div>}

        {footer && (
          <div className="pb-safe flex flex-col-reverse gap-2 px-5 pt-3 pb-5 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

/* -------------------------------------------------------------------------- */

/**
 * Rueckfrage vor Datenverlust (Spec §3.4).
 *
 * Der Text nennt konkret, WAS geloescht wird und WAS daran haengt. Waehrend des
 * Loeschens bleibt der Dialog offen und nicht schliessbar — schlaegt es fehl,
 * steht die Meldung direkt darin.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Löschen',
  cancelLabel = 'Abbrechen',
  destructive = true,
  loading = false,
  error,
  children,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: ReactNode
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
  error?: string | null
  children?: ReactNode
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      dismissable={!loading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading} className="sm:flex-none">
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            data-autofocus
            className="sm:flex-none"
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {error && (
        <p
          role="alert"
          className="mt-1 rounded-[var(--radius-sm)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] px-3 py-2.5 text-[13.5px] leading-snug font-medium text-danger"
        >
          {error}
        </p>
      )}
    </Dialog>
  )
}
