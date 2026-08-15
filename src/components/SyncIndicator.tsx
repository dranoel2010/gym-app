import { useEffect, useState } from 'react'
import { flush, subscribeSync, type SyncState } from '@/lib/syncQueue'
import { cn } from '@/lib/cn'
import { IconCloudOff, IconRefresh } from './ui/Icons'

/**
 * Sichtbarer Hinweis auf noch nicht uebertragene Saetze (Spec §3.6, Punkt 5).
 *
 * Bleibt unsichtbar, solange alles synchron und die Verbindung da ist — ein
 * dauerhaftes Statussymbol waere nur Rauschen.
 */
export function SyncIndicator({ className }: { className?: string }) {
  const [state, setState] = useState<SyncState | null>(null)

  useEffect(() => subscribeSync(setState), [])

  if (!state) return null
  const { pendingSets, pendingTotal, syncing, online } = state
  if (pendingTotal === 0 && online) return null

  const label =
    pendingSets > 0
      ? `${pendingSets} ${pendingSets === 1 ? 'Satz' : 'Sätze'} noch nicht synchronisiert`
      : pendingTotal > 0
        ? `${pendingTotal} Änderungen noch nicht synchronisiert`
        : 'Offline – Änderungen werden lokal gespeichert'

  return (
    <button
      type="button"
      onClick={() => void flush()}
      aria-live="polite"
      title={online ? 'Jetzt erneut senden' : 'Keine Verbindung'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold',
        'transition-colors duration-[var(--dur-fast)]',
        online
          ? 'border-[color-mix(in_oklab,var(--warn)_35%,transparent)] bg-[var(--warn-soft)] text-[var(--warn)] hover:brightness-105'
          : 'border-line bg-surface-2 text-muted',
        className
      )}
    >
      {online ? (
        <IconRefresh className={cn('text-[13px]', syncing && 'animate-spin-slow')} />
      ) : (
        <IconCloudOff className="text-[13px]" />
      )}
      <span className="max-w-[16ch] truncate">{label}</span>
    </button>
  )
}
