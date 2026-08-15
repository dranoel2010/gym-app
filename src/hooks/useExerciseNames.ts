import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Bereits verwendete Uebungsnamen des Nutzers (Spec §3.9).
 *
 * Quelle ist die Postgres-Funktion `exercise_names()`: sie vereinigt
 * `plan_exercises` und `workout_sets` und dedupliziert ohne Ruecksicht auf
 * Gross-/Kleinschreibung. Das verhindert getrennte Statistikreihen durch
 * Schreibvarianten wie "Bankdrücken" vs. "Bankdruecken".
 *
 * Die Liste wird pro Sitzung einmal geholt und im Modul zwischengespeichert —
 * sie aendert sich selten und wird auf mehreren Screens gebraucht.
 */

let cache: string[] | null = null
let inflight: Promise<string[]> | null = null

async function load(): Promise<string[]> {
  if (cache) return cache
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const { data, error } = await supabase.rpc('exercise_names')
      if (error) throw error
      const names = ((data ?? []) as Array<{ name: string }>).map((r) => r.name)
      cache = names
      return names
    } catch (error) {
      // Vorschlaege sind Komfort, kein Kernfeature — ein Fehlschlag darf den
      // Screen nicht stoeren.
      console.warn('[gym-tracker] Übungsnamen konnten nicht geladen werden:', error)
      return []
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/** Nach dem Speichern eines Plans oder Satzes aufrufen. */
export function invalidateExerciseNames(): void {
  cache = null
}

export function useExerciseNames(): string[] {
  const [names, setNames] = useState<string[]>(cache ?? [])

  useEffect(() => {
    let active = true
    void load().then((result) => {
      if (active) setNames(result)
    })
    return () => {
      active = false
    }
  }, [])

  return names
}
