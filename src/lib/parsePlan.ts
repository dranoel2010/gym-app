/**
 * Parser fuer den Planimport (Spec §4.8).
 *
 * Das Herzstueck des Import-Screens. Rein, ohne Seiteneffekte, ueber
 * `parsePlan.test.ts` abgesichert.
 */

export interface ParsedExercise {
  exercise_name: string
  target_sets: number
  target_reps: number
  target_weight: number
}

export interface ParseResult {
  exercises: ParsedExercise[]
  /** `null`, solange nichts schiefging. Leerer Text ist KEIN Fehler. */
  error: string | null
}

const DEFAULT_SETS = 3
const DEFAULT_REPS = 10
const DEFAULT_WEIGHT = 0

/** Deutsches Dezimalkomma wird unterstuetzt. */
export function toNum(v: unknown): number | null {
  if (typeof v === 'number') return isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(',', '.'))
    return isNaN(n) ? null : n
  }
  return null
}

/**
 * Normalisierung der Zielwerte.
 *
 * Der Parser gibt nie etwas zurueck, das die CHECK-Constraints der Datenbank
 * verletzen wuerde (`target_sets > 0`, `target_reps > 0`, `target_weight >= 0`).
 * Unbrauchbare Werte fallen auf den Standardwert zurueck, statt den Import
 * spaeter an einem Datenbankfehler scheitern zu lassen.
 */
function normSets(n: number | null): number {
  if (n === null) return DEFAULT_SETS
  const i = Math.round(n)
  return i >= 1 ? i : DEFAULT_SETS
}
function normReps(n: number | null): number {
  if (n === null) return DEFAULT_REPS
  const i = Math.round(n)
  return i >= 1 ? i : DEFAULT_REPS
}
function normWeight(n: number | null): number {
  if (n === null) return DEFAULT_WEIGHT
  return n >= 0 ? Math.round(n * 10) / 10 : DEFAULT_WEIGHT
}

/* ---------------------------------------------------------------------------
   Modus A — JSON
   --------------------------------------------------------------------------- */

const NAME_KEYS = ['exercise_name', 'name', 'exercise', 'uebung'] as const
const SETS_KEYS = ['target_sets', 'sets', 'saetze', 'sätze'] as const
const REPS_KEYS = ['target_reps', 'reps', 'wdh', 'wiederholungen'] as const
const WEIGHT_KEYS = ['target_weight', 'weight', 'gewicht', 'kg'] as const

function pick(obj: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k]
  }
  return undefined
}

function parseJsonMode(text: string): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { exercises: [], error: 'Ungültiges JSON.' }
  }

  let list: unknown[]
  if (Array.isArray(parsed)) {
    list = parsed
  } else if (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as { exercises?: unknown }).exercises)
  ) {
    // Das Exportformat aus Spec §4.6 — Export -> Import ist damit verlustfrei.
    list = (parsed as { exercises: unknown[] }).exercises
  } else if (parsed && typeof parsed === 'object') {
    list = [parsed]
  } else {
    return { exercises: [], error: 'Kein gültiger Eintrag im JSON gefunden.' }
  }

  const exercises: ParsedExercise[] = []
  for (const raw of list) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const obj = raw as Record<string, unknown>

    const nameRaw = pick(obj, NAME_KEYS)
    const name = typeof nameRaw === 'string' ? nameRaw.trim() : ''
    if (!name) continue

    exercises.push({
      exercise_name: name,
      target_sets: normSets(toNum(pick(obj, SETS_KEYS))),
      target_reps: normReps(toNum(pick(obj, REPS_KEYS))),
      target_weight: normWeight(toNum(pick(obj, WEIGHT_KEYS))),
    })
  }

  if (exercises.length === 0) {
    return { exercises: [], error: 'Kein gültiger Eintrag im JSON gefunden.' }
  }
  return { exercises, error: null }
}

/* ---------------------------------------------------------------------------
   Modus B — zeilenweise
   --------------------------------------------------------------------------- */

/** Fuehrende Aufzaehlungszeichen: `- `, `* `, `• `, `1. `, `1) ` */
const BULLET_RE = /^\s*(?:[-*•]\s+|\d+[.)]\s+)/

const SETS_REPS_RE = /(\d+)\s*[x×*]\s*(\d+)/i
const WEIGHT_RE = /@\s*([\d.,]+)|([\d.,]+)\s*kg/i

const HEADER_NAME_RE = /name|übung|uebung|exercise/i
const HEADER_HINT_RE = /satz|sätze|saetze|set|rep|wdh|wiederhol|gewicht|weight|kg/i

const NUMERIC_RE = /^-?[\d.,]+$/

function isNumericField(s: string): boolean {
  const t = s.trim()
  return t !== '' && NUMERIC_RE.test(t) && toNum(t) !== null
}

/**
 * Waehlt genau EIN Trennzeichen pro Zeile, in der Reihenfolge Tab, `;`, `,`.
 *
 * Wichtig fuer das deutsche Dezimalkomma: `Bankdrücken;3;10;62,5` darf nur am
 * Semikolon getrennt werden — waehrend an allen drei Zeichen gleichzeitig
 * getrennt wuerde, zerfiele `62,5` in zwei Felder.
 *
 * Das Komma wird ausserdem nur dann als Trennzeichen akzeptiert, wenn die Zeile
 * keine Freitext-Merkmale traegt (`3x10`, `@60`, `60 kg`). Sonst wuerde
 * `Bankdrücken 3x10 @62,5` faelschlich als CSV mit zwei Feldern gelesen.
 */
function chooseSeparator(line: string): string | null {
  if (line.includes('\t')) return '\t'
  if (line.includes(';')) return ';'
  if (line.includes(',')) {
    const looksLikeFreeText =
      SETS_REPS_RE.test(line) || line.includes('@') || /[\d.,]+\s*kg/i.test(line)
    return looksLikeFreeText ? null : ','
  }
  return null
}

function isHeaderLine(line: string): boolean {
  const sep = chooseSeparator(line)
  if (!sep) return false
  const fields = line.split(sep).map((f) => f.trim())
  if (fields.length < 2) return false
  if (!HEADER_NAME_RE.test(fields[0])) return false
  // Sobald irgendwo eine Zahl steht, ist es eine Datenzeile, keine Kopfzeile.
  if (fields.slice(1).some(isNumericField)) return false
  if (!HEADER_HINT_RE.test(line)) return false
  return true
}

function parseCsvLine(line: string): ParsedExercise | null {
  const sep = chooseSeparator(line)
  if (!sep) return null

  const fields = line.split(sep).map((f) => f.trim())
  if (fields.length < 2) return null
  if (fields[0] === '') return null
  // Alle weiteren Felder muessen leer oder Zahlen sein.
  if (!fields.slice(1).every((f) => f === '' || isNumericField(f))) return null

  return {
    exercise_name: fields[0],
    target_sets: normSets(toNum(fields[1] ?? '')),
    target_reps: normReps(toNum(fields[2] ?? '')),
    target_weight: normWeight(toNum(fields[3] ?? '')),
  }
}

function parseFreeTextLine(line: string): ParsedExercise | null {
  let rest = line

  let sets: number | null = null
  let reps: number | null = null
  const sr = rest.match(SETS_REPS_RE)
  if (sr) {
    sets = toNum(sr[1])
    reps = toNum(sr[2])
    rest = rest.replace(sr[0], ' ')
  }

  let weight: number | null = null
  const w = rest.match(WEIGHT_RE)
  if (w) {
    weight = toNum(w[1] ?? w[2])
    rest = rest.replace(w[0], ' ')
  }

  // Abschließende Trennzeichen entfernen. Neben `-` und `–` auch der
  // Geviertstrich `—`, den Textverarbeitungen gern automatisch einsetzen.
  const name = rest
    .replace(/\s+/g, ' ')
    .replace(/[-–—@\s]+$/, '')
    .trim()
  if (!name) return null

  return {
    exercise_name: name,
    target_sets: normSets(sets),
    target_reps: normReps(reps),
    target_weight: normWeight(weight),
  }
}

function parseLineMode(text: string): ParseResult {
  const exercises: ParsedExercise[] = []
  let firstContentLineSeen = false

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(BULLET_RE, '').trim()
    if (!line) continue

    // Kopfzeilenerkennung gilt nur fuer die allererste nicht-leere Zeile.
    if (!firstContentLineSeen) {
      firstContentLineSeen = true
      if (isHeaderLine(line)) continue
    }

    const parsed = parseCsvLine(line) ?? parseFreeTextLine(line)
    if (parsed) exercises.push(parsed)
  }

  if (exercises.length === 0) {
    return { exercises: [], error: 'Keine Übungen erkannt. Prüfe das Format.' }
  }
  return { exercises, error: null }
}

/* ---------------------------------------------------------------------------
   Einstieg
   --------------------------------------------------------------------------- */

export function parsePlan(text: string): ParseResult {
  const trimmed = (text ?? '').trim()

  // Leerer Text: 0 Uebungen und KEINE Fehlermeldung. Der Nutzer hat einfach
  // noch nichts eingegeben — das ist kein Fehlerzustand.
  if (!trimmed) return { exercises: [], error: null }

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return parseJsonMode(trimmed)
  }
  return parseLineMode(text)
}

/** Beispieltext fuer das Platzhalterfeld des Import-Screens. */
export const IMPORT_PLACEHOLDER = `Bankdrücken Langhantel 3x10 @60
Kniebeuge 4x8 @80
Klimmzüge 3x8
Rudern Kabel 3x12 @50
Plank`
