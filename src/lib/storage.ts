/**
 * Duenner Wrapper um `localStorage`.
 *
 * Im privaten Modus mancher Browser wirft schon der reine Zugriff, und bei
 * vollem Speicher wirft `setItem`. Beides darf die App nie zum Absturz bringen —
 * Offline-Spiegelung ist eine Verbesserung, keine Voraussetzung.
 */

function available(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage
  } catch {
    return false
  }
}

export function readJson<T>(key: string, fallback: T): T {
  if (!available()) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch (e) {
    console.warn('[gym-tracker] Konnte %s nicht lesen:', key, e)
    return fallback
  }
}

export function writeJson(key: string, value: unknown): void {
  if (!available()) return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    console.warn('[gym-tracker] Konnte %s nicht schreiben:', key, e)
  }
}

export function removeKey(key: string): void {
  if (!available()) return
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* egal */
  }
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  // Fallback fuer aeltere WebViews
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
