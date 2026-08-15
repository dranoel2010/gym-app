import type { User } from '@supabase/supabase-js'

/**
 * Anzeigename des Nutzers.
 *
 * Liegt in `user_metadata` und damit in der Auth-Tabelle von Supabase — keine
 * eigene Profiltabelle, kein zusätzliches RLS. Ein Nutzer darf seine eigenen
 * Metadaten ohnehin ändern, und mehr als ein Anzeigename steht hier nicht.
 */

export const DISPLAY_NAME_KEY = 'display_name'
export const MAX_NAME_LENGTH = 40

export function displayNameOf(user: User | null): string | null {
  const raw = (user?.user_metadata as Record<string, unknown> | undefined)?.[DISPLAY_NAME_KEY]
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Was in der Begrüßung steht.
 *
 * Ohne hinterlegten Namen bewusst NICHT der Teil vor dem @ der E-Mail-Adresse:
 * "Hey, leonard.schroeter93" liest sich wie ein Datenbankeintrag, nicht wie
 * eine Begrüßung.
 */
export function greetingNameOf(user: User | null): string {
  return displayNameOf(user) ?? 'Athlet'
}

/** Initiale für den Avatar — aus dem Namen, sonst aus der E-Mail. */
export function initialOf(user: User | null): string {
  const name = displayNameOf(user)
  if (name) return name.charAt(0).toUpperCase()
  const email = user?.email ?? ''
  return email.trim().charAt(0).toUpperCase() || '?'
}
