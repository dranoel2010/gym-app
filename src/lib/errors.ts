import { toast } from 'sonner'

/**
 * Fehlerbehandlung (Spec §3.2) — verbindliche Regel.
 *
 * Jede schreibende Aktion hat drei sichtbare Ausgaenge: laeuft, erfolgreich,
 * fehlgeschlagen. Ein stiller Fehlschlag ist ein Bug.
 *
 * Rohe Supabase-Meldungen werden dem Nutzer NIE gezeigt (englisch, technisch,
 * teils verraten sie Interna) — aber immer per `console.error` mitgeloggt,
 * damit sie beim Debuggen nicht fehlen.
 */

export interface SupabaseLikeError {
  message?: string
  code?: string
  details?: string
  hint?: string
  status?: number
  name?: string
}

/** Uebersetzt bekannte Datenbankfehler in verstaendliches Deutsch. */
export function humanizeDbError(error: unknown, fallback: string): string {
  const e = (error ?? {}) as SupabaseLikeError
  const code = e.code ?? ''
  const msg = e.message ?? ''

  if (code === '23505' || /duplicate key/i.test(msg)) {
    return 'Für dieses Datum gibt es bereits einen Eintrag.'
  }
  if (code === '23514' || /violates check constraint/i.test(msg)) {
    return 'Ein Wert liegt außerhalb des erlaubten Bereichs.'
  }
  if (code === '23503' || /foreign key/i.test(msg)) {
    return 'Der zugehörige Eintrag existiert nicht mehr.'
  }
  if (code === '42501' || /row-level security/i.test(msg)) {
    return 'Keine Berechtigung für diese Aktion.'
  }
  if (code === 'PGRST116') {
    return 'Eintrag nicht gefunden.'
  }
  if (/Plan nicht gefunden/i.test(msg)) {
    return 'Plan nicht gefunden. Wurde er zwischenzeitlich gelöscht?'
  }
  if (isOffline(error)) {
    return 'Keine Verbindung. Prüfe dein Netz und versuche es erneut.'
  }
  return fallback
}

/** Netzwerkfehler vs. echte Serverantwort — wichtig fuer die Sync-Warteschlange. */
export function isOffline(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const e = (error ?? {}) as SupabaseLikeError
  const msg = e.message ?? ''
  return (
    e.name === 'TypeError' ||
    e.name === 'AuthRetryableFetchError' ||
    /failed to fetch|networkerror|network request failed|load failed/i.test(msg)
  )
}

/**
 * Einheitlicher Ausgang fuer fehlgeschlagene Schreibaktionen:
 * Toast fuer den Nutzer, Konsolenausgabe fuer die Fehlersuche.
 */
export function reportError(context: string, error: unknown, userMessage: string): void {
  console.error(`[gym-tracker] ${context}:`, error)
  toast.error(humanizeDbError(error, userMessage))
}

/** Auth-Fehler beim Setzen eines neuen Passworts (Spec §4.4). */
export function mapPasswordUpdateError(error: unknown): string {
  const e = (error ?? {}) as SupabaseLikeError
  const name = e.name ?? ''
  const code = e.code ?? ''
  const msg = e.message ?? ''

  if (name === 'AuthSessionMissingError' || /session.*missing/i.test(msg)) {
    return 'Deine Sitzung ist abgelaufen. Bitte fordere einen neuen Link zum Zurücksetzen an.'
  }
  if (code === 'same_password' || /should be different from the old password/i.test(msg)) {
    return 'Das neue Passwort muss sich vom bisherigen unterscheiden.'
  }
  if (code === 'weak_password' || /weak.?password/i.test(msg)) {
    return 'Dieses Passwort ist zu schwach. Bitte wähle ein sichereres.'
  }
  return 'Das Passwort konnte nicht geändert werden. Bitte versuche es erneut.'
}

/**
 * Ist ein Fehler beim Anfordern eines Reset-Links nur voruebergehend?
 *
 * Nur diese duerfen angezeigt werden. Alles andere — insbesondere "Nutzer
 * existiert nicht" — wird verschluckt, damit sich von aussen nicht ermitteln
 * laesst, welche E-Mail-Adressen ein Konto haben (Spec §4.3).
 */
export function isTransientAuthError(error: unknown): boolean {
  const e = (error ?? {}) as SupabaseLikeError
  const status = e.status ?? 0
  const code = e.code ?? ''
  return (
    status === 429 ||
    status >= 500 ||
    e.name === 'AuthRetryableFetchError' ||
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit'
  )
}
