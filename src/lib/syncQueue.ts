/**
 * Offline-Warteschlange (Spec §3.6).
 *
 * v1 war nominell eine PWA, aber ohne jede Offline-Faehigkeit — im Keller ohne
 * Empfang liess sich kein Satz speichern. Genau dort wird die App aber benutzt.
 *
 * Ablauf beim Loggen eines Satzes:
 *   1. Der Client vergibt die `id` selbst (UUID) und die `set_number` lokal.
 *   2. Der Satz erscheint SOFORT in der Liste und liegt sofort im lokalen
 *      Spiegel — unabhaengig davon, ob Netz da ist.
 *   3. Der Insert wandert in diese Warteschlange und laeuft asynchron nach.
 *   4. Schlaegt er wegen fehlender Verbindung fehl, bleibt er drin und wird bei
 *      der naechsten Gelegenheit erneut gesendet. Die Reihenfolge bleibt.
 *
 * Weil die `id` vom Client kommt, ist ein erneutes Senden ungefaehrlich:
 * derselbe Satz kann nicht zweimal entstehen. Und `set_number` wird beim
 * Nachsenden NICHT neu berechnet — sonst wuerde ein Satz, der offline als
 * Nummer 3 geloggt wurde, beim Sync zur Nummer 1 werden.
 */

import { supabase } from './supabase'
import { readJson, writeJson } from './storage'
import { isOffline } from './errors'
import type { WorkoutSet } from './database.types'

const QUEUE_KEY = 'gt.queue.v1'

export type PendingOp =
  | { kind: 'insert_set'; opId: string; setId: string; row: NewSetRow; createdAt: number }
  | { kind: 'update_set'; opId: string; setId: string; patch: SetPatch; createdAt: number }
  | { kind: 'delete_set'; opId: string; setId: string; createdAt: number }
  | { kind: 'finish_workout'; opId: string; workoutId: string; finishedAt: string; createdAt: number }

export interface NewSetRow {
  id: string
  workout_id: string
  exercise_name: string
  set_number: number
  reps: number
  weight: number
  rir: number | null
  note: string | null
  logged_at: string
}

export interface SetPatch {
  reps?: number
  weight?: number
  rir?: number | null
  note?: string | null
}

export interface SyncState {
  /** Wie viele Saetze warten noch auf die Uebertragung? */
  pendingSets: number
  /** Gesamtzahl offener Vorgaenge (inkl. Aenderungen und Abschluss). */
  pendingTotal: number
  syncing: boolean
  online: boolean
}

type Listener = (state: SyncState) => void

const listeners = new Set<Listener>()
let syncing = false
let flushTimer: ReturnType<typeof setTimeout> | null = null

/* --------------------------------------------------------------------------
   Zustand
   -------------------------------------------------------------------------- */

function loadQueue(): PendingOp[] {
  return readJson<PendingOp[]>(QUEUE_KEY, [])
}

function saveQueue(ops: PendingOp[]): void {
  writeJson(QUEUE_KEY, ops)
  emit()
}

export function getSyncState(): SyncState {
  const ops = loadQueue()
  return {
    pendingSets: ops.filter((o) => o.kind === 'insert_set').length,
    pendingTotal: ops.length,
    syncing,
    online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  }
}

function emit(): void {
  const state = getSyncState()
  for (const l of listeners) l(state)
}

export function subscribeSync(listener: Listener): () => void {
  listeners.add(listener)
  listener(getSyncState())
  return () => {
    listeners.delete(listener)
  }
}

/** IDs der Saetze, die noch nicht beim Server angekommen sind. */
export function pendingSetIds(): Set<string> {
  const ids = new Set<string>()
  for (const op of loadQueue()) {
    if (op.kind === 'insert_set') ids.add(op.setId)
  }
  return ids
}

/* --------------------------------------------------------------------------
   Vorgaenge einstellen
   -------------------------------------------------------------------------- */

function enqueue(op: PendingOp): void {
  saveQueue([...loadQueue(), op])
  void flush()
}

export function queueInsertSet(row: NewSetRow): void {
  enqueue({
    kind: 'insert_set',
    opId: row.id,
    setId: row.id,
    row,
    createdAt: Date.now(),
  })
}

/**
 * Aenderung eines Satzes.
 *
 * Liegt der Insert noch in der Warteschlange, wird direkt dieser angepasst,
 * statt eine zweite Operation anzuhaengen. Sonst wuerde ein Update auf einer
 * Zeile landen, die es serverseitig noch gar nicht gibt.
 */
export function queueUpdateSet(setId: string, patch: SetPatch): void {
  const ops = loadQueue()
  const idx = ops.findIndex((o) => o.kind === 'insert_set' && o.setId === setId)
  if (idx >= 0) {
    const op = ops[idx] as Extract<PendingOp, { kind: 'insert_set' }>
    ops[idx] = { ...op, row: { ...op.row, ...patch } }
    saveQueue(ops)
    void flush()
    return
  }
  enqueue({ kind: 'update_set', opId: crypto.randomUUID(), setId, patch, createdAt: Date.now() })
}

/**
 * Loeschen eines Satzes.
 *
 * Ist der Satz noch gar nicht uebertragen, faellt der Insert einfach weg — es
 * gibt nichts zu loeschen. Rueckgabe sagt, ob serverseitig noch etwas zu tun
 * ist.
 */
export function queueDeleteSet(setId: string): { neededServerCall: boolean } {
  const ops = loadQueue()
  const hadInsert = ops.some((o) => o.kind === 'insert_set' && o.setId === setId)
  const rest = ops.filter((o) => !('setId' in o) || o.setId !== setId)

  if (hadInsert) {
    saveQueue(rest)
    return { neededServerCall: false }
  }

  saveQueue([
    ...rest,
    { kind: 'delete_set', opId: crypto.randomUUID(), setId, createdAt: Date.now() },
  ])
  void flush()
  return { neededServerCall: true }
}

export function queueFinishWorkout(workoutId: string, finishedAt: string): void {
  enqueue({
    kind: 'finish_workout',
    opId: crypto.randomUUID(),
    workoutId,
    finishedAt,
    createdAt: Date.now(),
  })
}

/* --------------------------------------------------------------------------
   Uebertragung
   -------------------------------------------------------------------------- */

/**
 * Ist der Fehler dauerhaft? Dann muss der Vorgang aus der Warteschlange
 * fliegen, sonst blockiert er alle nachfolgenden fuer immer.
 *
 * Dauerhaft sind vor allem Constraint-Verletzungen und RLS-Ablehnungen — die
 * werden auch beim hundertsten Versuch nicht besser.
 */
function isPermanent(error: unknown): boolean {
  if (isOffline(error)) return false
  const code = (error as { code?: string } | null)?.code ?? ''
  return (
    code.startsWith('22') || // Datentyp / Wertebereich
    code.startsWith('23') || // Constraint
    code === '42501' || // RLS
    code === 'PGRST204' ||
    code === 'PGRST301'
  )
}

async function runOp(op: PendingOp): Promise<void> {
  switch (op.kind) {
    case 'insert_set': {
      // upsert statt insert: Wurde die Zeile bei einem frueheren Versuch doch
      // geschrieben und ging nur die Antwort verloren, ist der zweite Versuch
      // damit folgenlos.
      const { error } = await supabase
        .from('workout_sets')
        .upsert(op.row, { onConflict: 'id', ignoreDuplicates: false })
      if (error) throw error
      return
    }
    case 'update_set': {
      const { error } = await supabase.from('workout_sets').update(op.patch).eq('id', op.setId)
      if (error) throw error
      return
    }
    case 'delete_set': {
      const { error } = await supabase.rpc('delete_set', { p_set_id: op.setId })
      if (error) throw error
      return
    }
    case 'finish_workout': {
      const { error } = await supabase
        .from('workouts')
        .update({ finished_at: op.finishedAt })
        .eq('id', op.workoutId)
        .is('finished_at', null)
      if (error) throw error
      return
    }
  }
}

let dropCallback: ((op: PendingOp, error: unknown) => void) | null = null

/** Meldung, wenn ein Vorgang dauerhaft scheitert und verworfen wird. */
export function onOpDropped(cb: (op: PendingOp, error: unknown) => void): void {
  dropCallback = cb
}

/**
 * Arbeitet die Warteschlange strikt der Reihe nach ab.
 *
 * Der erste Fehlschlag wegen fehlender Verbindung stoppt den Durchlauf — die
 * Reihenfolge muss erhalten bleiben, ein spaeteres Update darf nicht vor seinem
 * Insert ankommen.
 */
export async function flush(): Promise<void> {
  if (syncing) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    emit()
    return
  }

  const queue = loadQueue()
  if (queue.length === 0) {
    emit()
    return
  }

  syncing = true
  emit()

  try {
    for (const op of queue) {
      try {
        await runOp(op)
      } catch (error) {
        if (isPermanent(error)) {
          console.error('[gym-tracker] Vorgang dauerhaft fehlgeschlagen, verworfen:', op, error)
          dropCallback?.(op, error)
          // durchfallen lassen: der Vorgang wird unten mit entfernt
        } else {
          console.warn('[gym-tracker] Übertragung unterbrochen, wird erneut versucht:', error)
          // Alles ab hier bleibt in der Warteschlange.
          const remaining = loadQueue()
          const stopAt = remaining.findIndex((o) => o.opId === op.opId)
          saveQueue(stopAt >= 0 ? remaining.slice(stopAt) : remaining)
          scheduleRetry()
          return
        }
      }

      // Erledigt (oder verworfen): aus der Warteschlange nehmen. Frisch laden,
      // weil zwischenzeitlich neue Vorgaenge dazugekommen sein koennen.
      saveQueue(loadQueue().filter((o) => o.opId !== op.opId))
    }
  } finally {
    syncing = false
    emit()
  }
}

function scheduleRetry(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flush()
  }, 15_000)
}

/** Einmalig beim App-Start aufrufen. */
export function startSyncWatcher(): () => void {
  const onOnline = () => {
    emit()
    void flush()
  }
  const onOffline = () => emit()
  const onVisible = () => {
    if (document.visibilityState === 'visible') void flush()
  }

  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisible)

  const interval = setInterval(() => void flush(), 30_000)
  void flush()

  return () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    document.removeEventListener('visibilitychange', onVisible)
    clearInterval(interval)
  }
}

/* --------------------------------------------------------------------------
   Lokaler Spiegel eines aktiven Trainings
   -------------------------------------------------------------------------- */

export interface WorkoutMirror {
  workoutId: string
  sets: WorkoutSet[]
  /** Spontan hinzugefuegte Uebungen dieser Sitzung. */
  adHocExercises: string[]
  savedAt: number
}

function mirrorKey(workoutId: string): string {
  return `gt.mirror.${workoutId}`
}

export function saveMirror(m: WorkoutMirror): void {
  writeJson(mirrorKey(m.workoutId), m)
}

export function loadMirror(workoutId: string): WorkoutMirror | null {
  return readJson<WorkoutMirror | null>(mirrorKey(workoutId), null)
}
