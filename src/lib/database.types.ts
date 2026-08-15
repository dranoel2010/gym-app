/**
 * Typen zum Schema aus `supabase/setup.sql`.
 *
 * Bewusst von Hand gepflegt statt generiert: das Schema ist klein und aendert
 * sich selten, dafuer bleibt der Build ohne Supabase-CLI lauffaehig. Wer das
 * Schema aendert, aendert diese Datei mit.
 */

export type Pose = 'front' | 'side' | 'back'

export interface Plan {
  id: string
  user_id: string
  name: string
  created_at: string
}

export interface PlanExercise {
  id: string
  plan_id: string
  exercise_name: string
  target_sets: number
  target_reps: number
  target_weight: number
  order_index: number
}

export interface Workout {
  id: string
  user_id: string
  plan_id: string | null
  started_at: string
  finished_at: string | null
}

export interface WorkoutSet {
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

export interface WeeklyCheckin {
  id: string
  user_id: string
  checkin_date: string
  bodyweight: number | null
  sleep_hours: number | null
  week_rating: number | null
  created_at: string
}

export interface Measurement {
  id: string
  user_id: string
  measured_at: string
  upper_arm: number | null
  chest: number | null
  thigh: number | null
  waist: number | null
  created_at: string
}

export interface ProgressPhoto {
  id: string
  user_id: string
  photo_date: string
  pose: Pose
  storage_path: string
  created_at: string
}

/** Reihenfolge der Tabellen im Backup — Abhaengigkeiten zuerst (Spec §4.13). */
export const BACKUP_TABLES = [
  'plans',
  'plan_exercises',
  'workouts',
  'workout_sets',
  'weekly_checkins',
  'measurements',
  'progress_photos',
] as const

export type BackupTable = (typeof BACKUP_TABLES)[number]

export const POSE_LABELS: Record<Pose, string> = {
  front: 'Vorne',
  side: 'Seite',
  back: 'Rücken',
}

/** Anzeigereihenfolge innerhalb einer Fotogruppe. */
export const POSE_ORDER: Pose[] = ['front', 'side', 'back']
