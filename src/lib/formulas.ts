/**
 * Zentrale Berechnungsformeln (Spec §3.8).
 *
 * Bewusst frei von React, Supabase und Datumsformatierung: alles hier ist eine
 * reine Funktion auf einfachen Daten und damit direkt testbar.
 */

import { localDateStr, startOfWeek, weekKey, addDays } from './date'

export interface SetLike {
  exercise_name: string
  set_number: number
  reps: number
  weight: number
}

/** Volumen eines Satzes in kg·Wdh. */
export function setVolume(reps: number, weight: number): number {
  return reps * weight
}

/**
 * Streak = aufeinanderfolgende Kalenderwochen mit mindestens einem
 * abgeschlossenen Training, rueckwaerts ab der laufenden Woche.
 *
 * Die laufende Woche ohne Training beendet den Streak nicht — sie wird
 * uebersprungen. Sonst stuende der Wert jeden Montagmorgen auf 0.
 *
 * (v1 zaehlte Kalendertage. Bei Krafttraining mit Ruhetagen stand die Kennzahl
 * dadurch praktisch immer auf 0 oder 1 und war wertlos.)
 */
export function weekStreak(finishedDates: Array<string | Date>, now: Date = new Date()): number {
  const weeks = new Set<string>()
  for (const d of finishedDates) {
    const date = typeof d === 'string' ? new Date(d) : d
    if (Number.isNaN(date.getTime())) continue
    weeks.add(weekKey(date))
  }
  if (weeks.size === 0) return 0

  let cursor = startOfWeek(now)
  // Laufende Woche noch ohne Training: nicht als Abbruch werten.
  if (!weeks.has(localDateStr(cursor))) cursor = addDays(cursor, -7)

  let streak = 0
  while (weeks.has(localDateStr(cursor))) {
    streak++
    cursor = addDays(cursor, -7)
  }
  return streak
}

/** Ø Trainings/Woche: Workouts der letzten 28 Tage ÷ 4, auf 1 Nachkommastelle. */
export function avgWorkoutsPerWeek(
  finishedDates: Array<string | Date>,
  now: Date = new Date()
): number {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 27)
  let count = 0
  for (const d of finishedDates) {
    const date = typeof d === 'string' ? new Date(d) : d
    if (Number.isNaN(date.getTime())) continue
    if (date >= cutoff && date <= now) count++
  }
  return Math.round((count / 4) * 10) / 10
}

/**
 * Ist eine Uebung eine reine Koerpergewichtsuebung?
 *
 * Bei `weight = 0` ist das Volumen 0 — Klimmzuege waeren sonst eine Nulllinie
 * im Diagramm. Solche Uebungen werden nach Gesamtwiederholungen ausgewertet.
 */
export function isBodyweightExercise(sets: Array<{ weight: number }>): boolean {
  return sets.length > 0 && sets.every((s) => (s.weight ?? 0) === 0)
}

export interface DailyPoint {
  /** `YYYY-MM-DD`, lokal */
  date: string
  value: number
}

/**
 * Tagesvolumen einer Uebung ueber die Zeit.
 *
 * `dateOf` liefert den Kalendertag eines Satzes — in der Statistik ist das der
 * Tag des zugehoerigen Workouts (`finished_at`), nicht der des Satzes selbst.
 * Bei einem Training ueber Mitternacht bleiben so alle Saetze zusammen.
 */
export function dailySeries(
  sets: Array<SetLike & { day: string }>,
  exerciseName: string
): { points: DailyPoint[]; unit: 'volume' | 'reps' } {
  const mine = sets.filter((s) => s.exercise_name === exerciseName)
  const unit = isBodyweightExercise(mine) ? 'reps' : 'volume'

  const byDay = new Map<string, number>()
  for (const s of mine) {
    const add = unit === 'reps' ? s.reps : setVolume(s.reps, s.weight)
    byDay.set(s.day, (byDay.get(s.day) ?? 0) + add)
  }

  const points = [...byDay.entries()]
    .map(([date, value]) => ({ date, value: Math.round(value) }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return { points, unit }
}

/**
 * Referenzsatz aus der letzten Session: der Satz mit dem hoechsten Gewicht,
 * bei Gleichstand der mit den meisten Wiederholungen.
 *
 * (v1 nahm den Satz mit der hoechsten `set_number`, also den letzten. Nach
 * einem Dropset war der Vorschlag dadurch absurd niedrig.)
 */
export function bestSet<T extends { reps: number; weight: number }>(sets: T[]): T | null {
  let best: T | null = null
  for (const s of sets) {
    if (!best) {
      best = s
      continue
    }
    if (s.weight > best.weight) best = s
    else if (s.weight === best.weight && s.reps > best.reps) best = s
  }
  return best
}

/** Epley-Formel. Aktuell nicht in der Oberflaeche verwendet — siehe README. */
export function e1rm(weight: number, reps: number): number {
  return Math.round(weight * (1 + reps / 30) * 10) / 10
}

/** Gesamtvolumen einer Satzliste, auf ganze Zahl gerundet. */
export function totalVolume(sets: Array<{ reps: number; weight: number }>): number {
  return Math.round(sets.reduce((sum, s) => sum + setVolume(s.reps, s.weight), 0))
}

/** Zahl mit deutschem Dezimaltrenner, ohne unnoetige Nullen: 62,5 / 60 */
export function formatNumber(n: number, maxDecimals = 1): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: maxDecimals })
}

/** Kompakte Gewichtsangabe fuer Listen: `60 kg`, `62,5 kg`, `KG` bei 0. */
export function formatWeight(w: number): string {
  return w === 0 ? 'KG' : `${formatNumber(w)} kg`
}

/** Tag eines Workouts als lokaler `YYYY-MM-DD`-Schluessel. */
export function workoutDay(finishedAt: string | null, startedAt: string): string {
  return localDateStr(new Date(finishedAt ?? startedAt))
}
