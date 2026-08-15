/**
 * Datum und Zeitzone (Spec §3.1).
 *
 * Grundregel: Alle Datumsberechnungen laufen in der LOKALEN Zeitzone, nie in
 * UTC. Ein Training, das um 23:30 endet, gehoert zu diesem Tag, nicht zum
 * naechsten. `toISOString()` ist deshalb in dieser App verboten, wo immer es
 * um Kalendertage geht.
 */

/** `YYYY-MM-DD` in lokaler Zeit. */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Heute als `YYYY-MM-DD`. */
export function todayStr(): string {
  return localDateStr(new Date())
}

/**
 * `YYYY-MM-DD` -> Date auf lokale Mitternacht.
 * `new Date('2026-08-15')` waere UTC-Mitternacht und damit in Deutschland der
 * 15.08. um 02:00 — bei Zeitzonen westlich von UTC sogar der Vortag.
 */
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** Anzeigeformat: `15.08.26` */
export function formatDate(input: string | Date): string {
  const d = typeof input === 'string' ? parseLocalDate(input.slice(0, 10)) : input
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/** Kurzformat fuer Diagrammachsen: `15.08.` */
export function formatDateAxis(input: string | Date): string {
  const d = typeof input === 'string' ? parseLocalDate(input.slice(0, 10)) : input
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

/** `15.08.26, 19:42` */
export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Nur Uhrzeit: `19:42` */
export function formatTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

/** Verstrichene Zeit umgangssprachlich: "seit 42 Min.", "seit 2 Std. 5 Min." */
export function formatElapsed(from: string | Date, now: Date = new Date()): string {
  const start = typeof from === 'string' ? new Date(from) : from
  const mins = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 60000))
  if (mins < 1) return 'gerade eben'
  if (mins < 60) return `${mins} Min.`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h < 24) return m === 0 ? `${h} Std.` : `${h} Std. ${m} Min.`
  const d = Math.floor(h / 24)
  return d === 1 ? '1 Tag' : `${d} Tagen`
}

/** Montag der Woche, in der `d` liegt — auf lokale Mitternacht normalisiert. */
export function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  // getDay(): 0 = Sonntag. Die Woche beginnt Montag (Spec §3.8).
  const offset = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - offset)
  return x
}

/**
 * Wochenschluessel = Datum des Montags als `YYYY-MM-DD`.
 * Ueber den Jahreswechsel hinweg stabil — anders als eine ISO-Wochennummer,
 * bei der KW 1 und KW 53 aneinandergrenzen koennen.
 */
export function weekKey(d: Date): string {
  return localDateStr(startOfWeek(d))
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Ganze Tage zwischen zwei Kalendertagen, lokal gerechnet. */
export function daysBetween(a: Date, b: Date): number {
  const d1 = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const d2 = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((d2.getTime() - d1.getTime()) / 86_400_000)
}

/** Datumsgrenze fuer Abfragen: ISO-Zeitstempel vor `days` Tagen. */
export function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}
