import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Button } from './Button'
import { IconAlert, IconRefresh } from './Icons'

/**
 * Ladezustand, Leerzustand, Fehlerzustand (Spec §3.2 / §3.3).
 *
 * Jeder Bereich, der Daten laedt, benutzt genau diese drei. In v1 fehlten sie
 * an mehreren Stellen — Screens hingen dauerhaft im Ladezustand oder zeigten
 * wortlos nichts an.
 */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden="true" />
}

/** Platzhalter fuer eine Liste von Karten. */
export function SkeletonList({ rows = 3, height = 'h-20' }: { rows?: number; height?: string }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Wird geladen">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn('rounded-[var(--radius-lg)]', height)} />
      ))}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-[var(--radius-lg)] border border-dashed border-line px-6 py-12 text-center',
        className
      )}
    >
      {icon && (
        <div className="mb-4 grid size-14 place-items-center rounded-full border border-line bg-surface text-[24px] text-subtle">
          {icon}
        </div>
      )}
      <p className="text-[16px] font-semibold text-fg text-balance">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-xs text-[14px] leading-relaxed text-muted text-balance">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/**
 * Ladefehler mit "Erneut versuchen" — Spec §3.2 macht den Button zur Pflicht.
 * Ein Fehlerzustand ohne Ausweg ist eine Sackgasse.
 */
export function ErrorState({
  message,
  onRetry,
  retrying = false,
  className,
}: {
  message: string
  onRetry?: () => void
  retrying?: boolean
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--danger)]/35 bg-[var(--danger-soft)] p-4',
        className
      )}
    >
      <div className="flex items-start gap-2.5">
        <IconAlert className="mt-0.5 shrink-0 text-[18px] text-danger" />
        <p className="text-[14.5px] leading-relaxed font-medium text-fg">{message}</p>
      </div>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          loading={retrying}
          icon={<IconRefresh />}
        >
          Erneut versuchen
        </Button>
      )}
    </div>
  )
}

/** Zentrierter Ladezustand fuer ganze Seiten. */
export function PageLoader({ label = 'Wird geladen …' }: { label?: string }) {
  return (
    <div
      className="flex min-h-[50dvh] flex-col items-center justify-center gap-3"
      role="status"
      aria-live="polite"
    >
      <span className="animate-spin-slow inline-block size-7 rounded-full border-[2.5px] border-line-strong border-t-[var(--accent)]" />
      <p className="text-[14px] text-muted">{label}</p>
    </div>
  )
}
