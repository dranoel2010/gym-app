import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { fetchAll } from '@/lib/fetchAll'
import { humanizeDbError, isOffline } from '@/lib/errors'
import { formatElapsed, formatTime } from '@/lib/date'
import { bestSet, formatNumber } from '@/lib/formulas'
import { newId } from '@/lib/storage'
import {
  loadMirror,
  pendingSetIds,
  queueDeleteSet,
  queueFinishWorkout,
  queueInsertSet,
  queueUpdateSet,
  saveMirror,
} from '@/lib/syncQueue'
import { invalidateExerciseNames } from '@/hooks/useExerciseNames'
import type { Plan, PlanExercise, Workout as WorkoutRow, WorkoutSet } from '@/lib/database.types'
import { ExerciseNameInput } from '@/components/ExerciseNameInput'
import { RestTimer } from '@/components/RestTimer'
import { SyncIndicator } from '@/components/SyncIndicator'
import { Button, RoundButton } from '@/components/ui/Button'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { SegmentBar } from '@/components/ui/Display'
import { PageLoader } from '@/components/ui/States'
import {
  IconAlert,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconNote,
  IconPencil,
  IconPlus,
  IconTrash,
  IconX,
} from '@/components/ui/Icons'

/* -------------------------------------------------------------------------- */

interface LastValues {
  reps: number
  weight: number
}

interface Loaded {
  workout: WorkoutRow
  plan: Plan | null
  planExercises: PlanExercise[]
}

/** Vergleich von Übungsnamen ohne Rücksicht auf Groß-/Kleinschreibung (Spec §3.9). */
const norm = (s: string) => s.trim().toLowerCase()

function parseNum(v: string): number {
  return parseFloat(v.replace(',', '.'))
}

/* -------------------------------------------------------------------------- */

/**
 * Aktives Training — `/workout/:workoutId` (Spec §4.9).
 *
 * Der wichtigste Screen: er wird im Stehen, zwischen den Sätzen, mit einer Hand
 * bedient. Deshalb durchgehend die dunkle Fläche aus dem Design, große
 * Trefferflächen und die Satz-Eingabe immer in Daumenreichweite.
 *
 * Angezeigt wird eine Übung zur Zeit — die Leiste oben zeigt den Fortschritt
 * über alle Übungen und dient zugleich als Sprungziel.
 */
export default function Workout() {
  const { workoutId } = useParams<{ workoutId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [sets, setSets] = useState<WorkoutSet[]>([])
  const [adHoc, setAdHoc] = useState<string[]>([])
  const [lastValues, setLastValues] = useState<Map<string, LastValues>>(new Map())

  const [activeIndex, setActiveIndex] = useState(0)
  const [restSignal, setRestSignal] = useState(0)

  /* ---------------- Laden ---------------- */

  useEffect(() => {
    if (!workoutId) {
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setLoadError(null)

    ;(async () => {
      try {
        const { data: workoutData, error: wErr } = await supabase
          .from('workouts')
          .select('*')
          .eq('id', workoutId)
          .eq('user_id', user!.id)
          .maybeSingle()
        if (wErr) throw wErr
        if (!active) return
        if (!workoutData) {
          setLoadError('Dieses Training gehört nicht zu deinem Konto oder existiert nicht mehr.')
          return
        }
        const workout = workoutData as WorkoutRow

        const [serverSets, planExercises, plan] = await Promise.all([
          fetchAll<WorkoutSet>((from, to) =>
            supabase
              .from('workout_sets')
              .select('*')
              .eq('workout_id', workoutId)
              .order('logged_at', { ascending: true })
              .range(from, to)
          ),
          workout.plan_id
            ? fetchAll<PlanExercise>((from, to) =>
                supabase
                  .from('plan_exercises')
                  .select('*')
                  .eq('plan_id', workout.plan_id!)
                  .order('order_index', { ascending: true })
                  .range(from, to)
              )
            : Promise.resolve([] as PlanExercise[]),
          workout.plan_id
            ? supabase
                .from('plans')
                .select('*')
                .eq('id', workout.plan_id)
                .maybeSingle()
                .then((r) => (r.data as Plan | null) ?? null)
            : Promise.resolve(null),
        ])
        if (!active) return

        // Offline-Spiegel einblenden: Sätze, die lokal geloggt, aber noch nicht
        // übertragen wurden, dürfen nicht verschwinden (Spec §3.6).
        const mirror = loadMirror(workoutId)
        const pending = pendingSetIds()
        const serverIds = new Set(serverSets.map((s) => s.id))
        const stillPending = (mirror?.sets ?? []).filter(
          (s) => pending.has(s.id) && !serverIds.has(s.id)
        )

        const merged = [...serverSets, ...stillPending].sort((a, b) =>
          a.logged_at.localeCompare(b.logged_at)
        )

        setLoaded({ workout, plan, planExercises })
        setSets(merged.map((s) => ({ ...s, weight: Number(s.weight) })))
        setAdHoc(mirror?.adHocExercises ?? [])

        // Vorschlagswerte aus der letzten Session (Spec §4.9).
        if (workout.plan_id) {
          const { data: prev } = await supabase
            .from('workouts')
            .select('id')
            .eq('user_id', user!.id)
            .eq('plan_id', workout.plan_id)
            .not('finished_at', 'is', null)
            .neq('id', workoutId)
            .order('finished_at', { ascending: false })
            .limit(1)

          const prevId = (prev ?? [])[0]?.id as string | undefined
          if (prevId && active) {
            const prevSets = await fetchAll<WorkoutSet>((from, to) =>
              supabase.from('workout_sets').select('*').eq('workout_id', prevId).range(from, to)
            )
            if (!active) return

            const byExercise = new Map<string, WorkoutSet[]>()
            for (const s of prevSets) {
              const key = norm(s.exercise_name)
              const list = byExercise.get(key) ?? []
              list.push({ ...s, weight: Number(s.weight) })
              byExercise.set(key, list)
            }
            const map = new Map<string, LastValues>()
            for (const [key, list] of byExercise) {
              // Der BESTE Satz, nicht der letzte: nach einem Dropset wäre der
              // Vorschlag sonst absurd niedrig (Änderung gegenüber v1).
              const best = bestSet(list)
              if (best) map.set(key, { reps: best.reps, weight: Number(best.weight) })
            }
            setLastValues(map)
          }
        }
      } catch (error) {
        console.error('[gym-tracker] Training konnte nicht geladen werden:', error)
        if (active) {
          setLoadError(
            isOffline(error)
              ? 'Keine Verbindung — das Training konnte nicht geladen werden.'
              : 'Das Training konnte nicht geladen werden.'
          )
        }
      } finally {
        // Der Ladezustand löst in jedem Fall auf.
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [workoutId, user])

  /* ---------------- Übungsreihenfolge (Spec §4.9) ---------------- */

  const exercises = useMemo(() => {
    const out: string[] = []
    const seen = new Set<string>()
    const push = (name: string) => {
      const key = norm(name)
      if (!key || seen.has(key)) return
      seen.add(key)
      out.push(name)
    }
    // 1. Plan-Übungen nach order_index
    for (const e of loaded?.planExercises ?? []) push(e.exercise_name)
    // 2. in dieser Sitzung spontan hinzugefügte Übungen
    for (const n of adHoc) push(n)
    // 3. "verwaiste" Übungen: geloggte Sätze ohne Eintrag in den beiden Listen
    for (const s of sets) push(s.exercise_name)
    return out
  }, [loaded?.planExercises, adHoc, sets])

  const safeIndex = Math.min(activeIndex, Math.max(0, exercises.length - 1))
  const currentName = exercises[safeIndex] ?? ''

  const target = useMemo(
    () => loaded?.planExercises.find((e) => norm(e.exercise_name) === norm(currentName)) ?? null,
    [loaded?.planExercises, currentName]
  )

  const currentSets = useMemo(
    () => sets.filter((s) => norm(s.exercise_name) === norm(currentName)),
    [sets, currentName]
  )

  const last = lastValues.get(norm(currentName)) ?? null

  /** Wie viele Übungen haben ihr Satzziel erreicht? Speist die Leiste oben. */
  const doneCount = useMemo(() => {
    let n = 0
    for (const name of exercises) {
      const logged = sets.filter((s) => norm(s.exercise_name) === norm(name)).length
      const goal =
        loaded?.planExercises.find((e) => norm(e.exercise_name) === norm(name))?.target_sets ?? 1
      if (logged >= goal) n++
    }
    return n
  }, [exercises, sets, loaded?.planExercises])

  /* ---------------- Spiegel schreiben ---------------- */

  useEffect(() => {
    if (!workoutId || !loaded) return
    saveMirror({ workoutId, sets, adHocExercises: adHoc, savedAt: Date.now() })
  }, [workoutId, loaded, sets, adHoc])

  /* ---------------- Satz speichern ---------------- */

  const [repsInput, setRepsInput] = useState('')
  const [weightInput, setWeightInput] = useState('')
  const [rirInput, setRirInput] = useState('')
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)

  const repsRef = useRef<HTMLInputElement>(null)
  const weightRef = useRef<HTMLInputElement>(null)
  const rirRef = useRef<HTMLInputElement>(null)

  const resetInputs = useCallback(() => {
    setRepsInput('')
    setWeightInput('')
    setRirInput('')
    setNote('')
    setNoteOpen(false)
  }, [])

  // Übungswechsel: Eingaben leeren, sonst landen sie versehentlich bei der
  // nächsten Übung.
  useEffect(() => {
    resetInputs()
  }, [currentName, resetInputs])

  const saveSet = () => {
    if (!workoutId || !currentName) return

    // Leer gelassene Felder übernehmen die Werte der letzten Session — genau
    // das, was auch im Platzhalter steht.
    const reps = repsInput.trim() ? parseNum(repsInput) : (last?.reps ?? 0)
    const weight = weightInput.trim() ? parseNum(weightInput) : (last?.weight ?? 0)

    if (!Number.isFinite(reps) || reps <= 0) {
      // In v1 passierte an dieser Stelle wortlos nichts.
      toast.error('Bitte Wiederholungen eintragen.')
      repsRef.current?.focus()
      return
    }
    if (!Number.isFinite(weight) || weight < 0) {
      toast.error('Das Gewicht ist ungültig.')
      return
    }

    let rir: number | null = null
    if (rirInput.trim()) {
      const parsed = parseNum(rirInput)
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10) {
        toast.error('RIR muss zwischen 0 und 10 liegen.')
        rirRef.current?.focus()
        return
      }
      rir = Math.round(parsed)
    }

    // set_number unmittelbar vor dem Anlegen frisch bestimmen — das schützt
    // gegen Doppelklicks (Spec §4.9 AK-2).
    const setNumber =
      sets.filter((s) => norm(s.exercise_name) === norm(currentName)).length + 1

    const row: WorkoutSet = {
      id: newId(),
      workout_id: workoutId,
      exercise_name: currentName,
      set_number: setNumber,
      reps: Math.round(reps),
      weight: Math.round(weight * 100) / 100,
      rir,
      note: note.trim() || null,
      logged_at: new Date().toISOString(),
    }

    // Sofort lokal sichtbar — auch offline (Spec §4.9 AK-1). Der Insert läuft
    // asynchron über die Warteschlange hinterher.
    setSets((prev) => [...prev, row])
    queueInsertSet({ ...row })
    invalidateExerciseNames()
    resetInputs()
    setRestSignal((n) => n + 1)
    if ('vibrate' in navigator) navigator.vibrate?.(15)
  }

  /* ---------------- Satz bearbeiten / löschen ---------------- */

  const [editing, setEditing] = useState<WorkoutSet | null>(null)
  const [deleting, setDeleting] = useState<WorkoutSet | null>(null)

  const applyEdit = (patch: { reps: number; weight: number; rir: number | null; note: string | null }) => {
    if (!editing) return
    setSets((prev) => prev.map((s) => (s.id === editing.id ? { ...s, ...patch } : s)))
    queueUpdateSet(editing.id, patch)
    setEditing(null)
    toast.success('Satz geändert.')
  }

  const confirmDelete = () => {
    if (!deleting) return
    const removed = deleting
    setSets((prev) => {
      const rest = prev.filter((s) => s.id !== removed.id)
      // Folgesätze derselben Übung neu durchnummerieren (Spec §4.9 AK-3).
      // Serverseitig erledigt das die Funktion `delete_set`.
      let n = 0
      return rest.map((s) =>
        norm(s.exercise_name) === norm(removed.exercise_name) ? { ...s, set_number: ++n } : s
      )
    })
    queueDeleteSet(removed.id)
    setDeleting(null)
    toast.success('Satz gelöscht.')
  }

  /* ---------------- Übung hinzufügen ---------------- */

  const [addOpen, setAddOpen] = useState(false)
  const [newExercise, setNewExercise] = useState('')

  const addExercise = () => {
    const name = newExercise.trim()
    if (!name) return
    if (exercises.some((e) => norm(e) === norm(name))) {
      toast.error('Diese Übung ist bereits in der Liste.')
      return
    }
    setAdHoc((prev) => [...prev, name])
    setNewExercise('')
    setAddOpen(false)
    setActiveIndex(exercises.length)
  }

  /* ---------------- Training abschließen ---------------- */

  const [finishOpen, setFinishOpen] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)

  const finishWorkout = async () => {
    if (!workoutId) return
    setFinishing(true)
    setFinishError(null)
    const finishedAt = new Date().toISOString()
    try {
      const { error } = await supabase
        .from('workouts')
        .update({ finished_at: finishedAt })
        .eq('id', workoutId)
        .is('finished_at', null)
      if (error) throw error
      toast.success('Training abgeschlossen.')
      navigate('/stats')
    } catch (error) {
      if (isOffline(error)) {
        // Ohne Netz nicht blockieren: der Abschluss geht in die Warteschlange
        // und wird nachgesendet.
        queueFinishWorkout(workoutId, finishedAt)
        toast.success('Training abgeschlossen — wird gesendet, sobald du online bist.')
        navigate('/stats')
        return
      }
      console.error('[gym-tracker] Training abschließen fehlgeschlagen:', error)
      setFinishError(humanizeDbError(error, 'Das Training konnte nicht abgeschlossen werden.'))
    } finally {
      setFinishing(false)
    }
  }

  /* ---------------- Darstellung ---------------- */

  if (!workoutId) {
    return (
      <FullScreenNotice
        title="Kein aktives Training gefunden."
        action={<Button onClick={() => navigate('/')}>Zurück zum Start</Button>}
      />
    )
  }

  if (loading) {
    return (
      <div className="on-ink min-h-dvh bg-ink text-on-ink">
        <PageLoader label="Training wird geladen …" />
      </div>
    )
  }

  if (loadError || !loaded) {
    return (
      <FullScreenNotice
        title={loadError ?? 'Das Training konnte nicht geladen werden.'}
        action={<Button onClick={() => navigate('/')}>Zurück zum Start</Button>}
      />
    )
  }

  if (loaded.workout.finished_at) {
    return (
      <FullScreenNotice
        icon={<IconCheck />}
        title="Dieses Training ist bereits abgeschlossen."
        subtitle={`Beendet um ${formatTime(loaded.workout.finished_at)} Uhr.`}
        action={
          <div className="flex w-full flex-col gap-2">
            <Button block size="lg" onClick={() => navigate('/stats')}>
              Zur Statistik
            </Button>
            <Button block size="lg" variant="on-ink" onClick={() => navigate('/')}>
              Zurück zum Start
            </Button>
          </div>
        }
      />
    )
  }

  const planName = loaded.plan?.name ?? 'Freies Training'
  const goal = target?.target_sets ?? null

  return (
    <div className="on-ink flex min-h-dvh flex-col bg-ink text-on-ink">
      {/* ---------- Kopf ---------- */}
      <header className="pt-safe sticky top-0 z-20 bg-ink px-5 pt-3 pb-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setFinishOpen(true)}
            className="flex items-center gap-1.5 text-[13px] font-bold text-on-ink-muted transition-colors hover:text-on-ink"
          >
            <IconX className="text-[15px]" />
            Beenden
          </button>
          <span className="font-display truncate text-[15px]">{planName}</span>
          <span className="tnum text-[14px] font-extrabold text-accent">
            {formatElapsed(loaded.workout.started_at)}
          </span>
        </div>

        {exercises.length > 0 && (
          <>
            <SegmentBar
              total={exercises.length}
              done={doneCount}
              onInk
              className="mt-3.5"
            />
            {/* Die Leiste ist zugleich Sprungziel: ein Tipp wechselt die Übung. */}
            <div
              className="mt-3.5 -mx-5 flex gap-2 overflow-x-auto px-5 no-scrollbar"
              role="tablist"
              aria-label="Übungen"
            >
              {exercises.map((name, i) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={i === safeIndex}
                  onClick={() => setActiveIndex(i)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-extrabold transition-colors ${
                    i === safeIndex
                      ? 'bg-accent text-accent-ink'
                      : 'bg-[var(--ink-2)] text-on-ink-muted hover:text-on-ink'
                  }`}
                >
                  {name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                aria-label="Übung hinzufügen"
                className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--ink-2)] text-on-ink-muted transition-colors hover:text-on-ink"
              >
                <IconPlus className="text-[15px]" />
              </button>
            </div>
          </>
        )}

        <div className="mt-2 flex justify-end">
          <SyncIndicator />
        </div>
      </header>

      {/* ---------- Inhalt ---------- */}
      <main className="flex-1 px-5 pb-4">
        {exercises.length === 0 ? (
          <div className="flex flex-col items-center gap-5 rounded-[20px] border border-dashed border-[var(--ink-line)] px-6 py-14 text-center">
            <p className="text-[15px] font-bold text-balance">
              Noch keine Übungen. Füge oben eine Übung hinzu, um zu starten.
            </p>
            <Button icon={<IconPlus />} onClick={() => setAddOpen(true)}>
              Übung hinzufügen
            </Button>
          </div>
        ) : (
          <>
            <p className="eyebrow mt-2 text-accent">
              Übung {safeIndex + 1} von {exercises.length}
            </p>
            <h1 className="font-display mt-2 text-[32px] leading-none">{currentName}</h1>
            <p className="mt-2 text-[14px] font-semibold text-on-ink-muted">
              {target
                ? `Ziel: ${target.target_sets} × ${target.target_reps} Wdh.${
                    Number(target.target_weight) > 0
                      ? ` @ ${formatNumber(Number(target.target_weight))} kg`
                      : ''
                  }`
                : 'Spontane Übung'}
              {' · '}
              {currentSets.length}
              {goal ? `/${goal}` : ''} geloggt
            </p>

            {last && (
              <p className="mt-1.5 text-[13px] font-semibold text-on-ink-subtle">
                Letzte Session: bester Satz {last.reps} × {formatNumber(last.weight)} kg
              </p>
            )}

            {/* ---------- Geloggte Sätze ---------- */}
            <div className="mt-5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between px-1.5 text-[11px] font-extrabold tracking-[0.08em] text-on-ink-subtle uppercase">
                <span className="w-6">Satz</span>
                <span className="flex-1 text-center">Gewicht</span>
                <span className="w-14 text-center">Wdh.</span>
                <span className="w-20" />
              </div>

              {currentSets.map((s) => (
                <SetRow
                  key={s.id}
                  set={s}
                  onEdit={() => setEditing(s)}
                  onDelete={() => setDeleting(s)}
                />
              ))}

              {/* Verbleibende Sätze bis zum Ziel als blasse Vorschau. */}
              {goal !== null &&
                currentSets.length < goal &&
                Array.from({ length: goal - currentSets.length }, (_, i) => (
                  <div
                    key={`ghost-${i}`}
                    className="flex items-center justify-between rounded-[16px] bg-[var(--ink-2)] px-4 py-3.5 opacity-45"
                  >
                    <span className="font-display tnum w-6 text-[16px] text-on-ink-subtle">
                      {currentSets.length + i + 1}
                    </span>
                    <span className="flex-1 text-center text-[15px] font-bold text-on-ink-muted">
                      {formatNumber(Number(target?.target_weight ?? 0))} kg
                    </span>
                    <span className="w-14 text-center text-[15px] font-bold text-on-ink-muted">
                      {target?.target_reps ?? '—'}
                    </span>
                    <span className="w-20 text-right text-[14px] text-on-ink-subtle">—</span>
                  </div>
                ))}
            </div>

            {/* ---------- Neuer Satz ---------- */}
            <section className="mt-6 rounded-[20px] bg-[var(--ink-2)] p-4">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-extrabold text-on-ink-muted">
                  Satz {currentSets.length + 1}
                  {goal !== null && currentSets.length >= goal && (
                    // Die Eingabe bleibt sichtbar, auch wenn das Satzziel
                    // erreicht ist (neu in v2).
                    <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10px] text-accent-ink">
                      Zusatzsatz
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => setNoteOpen((v) => !v)}
                  aria-expanded={noteOpen}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold transition-colors ${
                    noteOpen || note ? 'bg-accent text-accent-ink' : 'text-on-ink-muted'
                  }`}
                >
                  <IconNote className="text-[13px]" />
                  Notiz
                </button>
              </div>

              <div className="mt-3 grid grid-cols-[1fr_1fr_0.8fr] gap-2">
                <InkNumberInput
                  ref={repsRef}
                  label="Wdh."
                  value={repsInput}
                  onChange={setRepsInput}
                  placeholder={last ? String(last.reps) : '0'}
                  inputMode="numeric"
                  onEnter={() => weightRef.current?.focus()}
                />
                <InkNumberInput
                  ref={weightRef}
                  label="kg"
                  value={weightInput}
                  onChange={setWeightInput}
                  placeholder={last ? formatNumber(last.weight) : '0'}
                  inputMode="decimal"
                  onEnter={() => rirRef.current?.focus()}
                />
                <InkNumberInput
                  ref={rirRef}
                  label="RIR"
                  value={rirInput}
                  onChange={setRirInput}
                  placeholder="—"
                  inputMode="numeric"
                  onEnter={saveSet}
                />
              </div>

              {noteOpen && (
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="z. B. Griff enger, Bank zu hoch …"
                  className="animate-fade-in mt-2.5 w-full rounded-[14px] border border-[var(--ink-line)] bg-ink px-3.5 py-2.5 text-[15px] font-medium text-on-ink outline-none placeholder:text-on-ink-subtle focus:border-[var(--accent)]"
                />
              )}

              <Button size="lg" block className="mt-3" onClick={saveSet} icon={<IconCheck />}>
                Satz speichern
              </Button>
            </section>

            {/* ---------- Pause ---------- */}
            <RestTimer restartSignal={restSignal} className="mt-4" />

            {/* ---------- Übung wechseln ---------- */}
            <div className="mt-5 flex items-center justify-between gap-3">
              <RoundButton
                label="Vorherige Übung"
                onClick={() => setActiveIndex(Math.max(0, safeIndex - 1))}
                disabled={safeIndex === 0}
              >
                <IconChevronLeft className="text-[16px]" />
              </RoundButton>
              <span className="text-[12.5px] font-bold text-on-ink-subtle">
                {safeIndex + 1} / {exercises.length}
              </span>
              <RoundButton
                label="Nächste Übung"
                onClick={() => setActiveIndex(Math.min(exercises.length - 1, safeIndex + 1))}
                disabled={safeIndex >= exercises.length - 1}
              >
                <IconChevronRight className="text-[16px]" />
              </RoundButton>
            </div>
          </>
        )}
      </main>

      {/* ---------- Abschließen ---------- */}
      <div className="pb-safe sticky bottom-0 border-t border-[var(--ink-line)] bg-ink px-5 py-3">
        <Button
          variant="on-ink"
          size="lg"
          block
          // Gesperrt, solange 0 Sätze geloggt sind (Spec §4.9).
          disabled={sets.length === 0}
          onClick={() => setFinishOpen(true)}
        >
          {sets.length === 0
            ? 'Noch kein Satz geloggt'
            : `Training abschließen · ${sets.length} ${sets.length === 1 ? 'Satz' : 'Sätze'}`}
        </Button>
      </div>

      {/* ---------- Dialoge ---------- */}
      <AddExerciseDialog
        open={addOpen}
        value={newExercise}
        onChange={setNewExercise}
        onClose={() => setAddOpen(false)}
        onAdd={addExercise}
      />

      <EditSetDialog set={editing} onClose={() => setEditing(null)} onSave={applyEdit} />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={`Satz ${deleting?.set_number ?? ''} löschen?`}
        description={
          deleting
            ? `${deleting.reps} × ${formatNumber(Number(deleting.weight))} kg bei „${deleting.exercise_name}“. Die folgenden Sätze werden neu durchnummeriert.`
            : undefined
        }
      />

      <ConfirmDialog
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        onConfirm={finishWorkout}
        loading={finishing}
        error={finishError}
        destructive={false}
        title="Training abschließen?"
        description={
          sets.length === 0
            ? 'Es ist noch kein Satz geloggt.'
            : `${sets.length} ${sets.length === 1 ? 'Satz' : 'Sätze'} in ${exercises.length} ${
                exercises.length === 1 ? 'Übung' : 'Übungen'
              } werden gespeichert.`
        }
        confirmLabel="Abschließen"
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function SetRow({
  set,
  onEdit,
  onDelete,
}: {
  set: WorkoutSet
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="animate-flash flex items-center gap-2 rounded-[16px] bg-[var(--ink-2)] px-4 py-3">
      <span className="font-display tnum w-6 shrink-0 text-[16px] text-on-ink-subtle">
        {set.set_number}
      </span>
      <span className="tnum flex-1 text-center text-[15px] font-bold">
        {formatNumber(Number(set.weight))} kg
      </span>
      <span className="tnum w-14 text-center text-[15px] font-bold">{set.reps}</span>
      <div className="flex min-w-20 shrink-0 items-center justify-end gap-0.5">
        {set.rir !== null && (
          <span className="tnum mr-1 rounded-full bg-[var(--ink-3)] px-2 py-0.5 text-[10.5px] font-extrabold whitespace-nowrap text-on-ink-muted">
            RIR {set.rir}
          </span>
        )}
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Satz ${set.set_number} bearbeiten`}
          className="grid size-8 place-items-center rounded-[10px] text-[15px] text-on-ink-subtle transition-colors hover:bg-[var(--ink-3)] hover:text-on-ink"
        >
          <IconPencil />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Satz ${set.set_number} löschen`}
          className="grid size-8 place-items-center rounded-[10px] text-[15px] text-on-ink-subtle transition-colors hover:bg-[var(--ink-3)] hover:text-[var(--danger-hi)]"
        >
          <IconTrash />
        </button>
      </div>
      {set.note && (
        <span className="sr-only">Notiz: {set.note}</span>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * Zahlenfeld der Satz-Eingabe.
 *
 * Groß, mittig, Archivo-fett — mit schwitzigen Fingern im Stehen muss der Wert
 * aus einem Meter Entfernung lesbar sein. `inputMode` bestimmt, welche Tastatur
 * erscheint: Wiederholungen ohne Komma, Gewicht mit.
 *
 * Tastaturfluss (Spec §4.9): Enter in Wdh. → kg, Enter in kg → RIR,
 * Enter in RIR → speichern.
 */
const InkNumberInput = forwardRef<
  HTMLInputElement,
  {
    label: string
    value: string
    onChange: (v: string) => void
    placeholder: string
    inputMode: 'numeric' | 'decimal'
    onEnter: () => void
  }
>(function InkNumberInput({ label, value, onChange, placeholder, inputMode, onEnter }, ref) {
  return (
    <label className="flex flex-col gap-1">
      <span className="pl-1 text-[11px] font-extrabold text-on-ink-subtle">{label}</span>
      <input
        ref={ref}
        type="text"
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) =>
          onChange(e.target.value.replace(inputMode === 'decimal' ? /[^\d.,]/g : /[^\d]/g, ''))
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onEnter()
          }
        }}
        className="tnum h-14 w-full rounded-[14px] border border-[var(--ink-line)] bg-ink text-center text-[22px] font-extrabold text-on-ink outline-none transition-[border-color,box-shadow] duration-[var(--dur-fast)] placeholder:font-bold placeholder:text-on-ink-subtle focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_22%,transparent)]"
      />
    </label>
  )
})

/* -------------------------------------------------------------------------- */

function AddExerciseDialog({
  open,
  value,
  onChange,
  onClose,
  onAdd,
}: {
  open: boolean
  value: string
  onChange: (v: string) => void
  onClose: () => void
  onAdd: () => void
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Übung hinzufügen"
      description="Vorschläge stammen aus deinen bisherigen Plänen und Trainings."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={onAdd} disabled={!value.trim()} icon={<IconPlus />}>
            Hinzufügen
          </Button>
        </>
      }
    >
      <ExerciseNameInput value={value} onChange={onChange} onEnter={onAdd} autoFocus />
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */

function EditSetDialog({
  set,
  onClose,
  onSave,
}: {
  set: WorkoutSet | null
  onClose: () => void
  onSave: (patch: { reps: number; weight: number; rir: number | null; note: string | null }) => void
}) {
  const [reps, setReps] = useState('')
  const [weight, setWeight] = useState('')
  const [rir, setRir] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!set) return
    setReps(String(set.reps))
    setWeight(formatNumber(Number(set.weight)))
    setRir(set.rir === null ? '' : String(set.rir))
    setNote(set.note ?? '')
    setError(null)
  }, [set])

  const submit = () => {
    const r = parseNum(reps)
    const w = parseNum(weight)
    if (!Number.isFinite(r) || r <= 0) return setError('Wiederholungen müssen größer als 0 sein.')
    if (!Number.isFinite(w) || w < 0) return setError('Das Gewicht ist ungültig.')
    let rirValue: number | null = null
    if (rir.trim()) {
      const parsed = parseNum(rir)
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10)
        return setError('RIR muss zwischen 0 und 10 liegen.')
      rirValue = Math.round(parsed)
    }
    onSave({
      reps: Math.round(r),
      weight: Math.round(w * 100) / 100,
      rir: rirValue,
      note: note.trim() || null,
    })
  }

  return (
    <Dialog
      open={set !== null}
      onClose={onClose}
      title={`Satz ${set?.set_number ?? ''} bearbeiten`}
      description={set?.exercise_name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={submit}>Speichern</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          <EditNumber label="Wdh." value={reps} onChange={setReps} inputMode="numeric" />
          <EditNumber label="kg" value={weight} onChange={setWeight} inputMode="decimal" />
          <EditNumber label="RIR" value={rir} onChange={setRir} inputMode="numeric" />
        </div>
        <label className="flex flex-col gap-1">
          <span className="pl-0.5 text-[12px] font-bold text-muted">Notiz</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full rounded-[14px] border border-line bg-surface-2 px-3.5 py-2.5 text-[15px] font-medium outline-none focus:border-[var(--accent)]"
          />
        </label>
        {error && (
          <p role="alert" className="text-[13px] font-bold text-danger">
            <IconAlert className="mr-1 inline text-[14px]" />
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}

function EditNumber({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  inputMode: 'numeric' | 'decimal'
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="pl-0.5 text-[12px] font-bold text-muted">{label}</span>
      <input
        type="text"
        inputMode={inputMode}
        value={value}
        onChange={(e) =>
          onChange(e.target.value.replace(inputMode === 'decimal' ? /[^\d.,]/g : /[^\d]/g, ''))
        }
        className="tnum h-12 w-full rounded-[14px] border border-line bg-surface-2 text-center text-[17px] font-extrabold outline-none focus:border-[var(--accent)]"
      />
    </label>
  )
}

/* -------------------------------------------------------------------------- */

function FullScreenNotice({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: ReactNode
  title: string
  subtitle?: string
  action: ReactNode
}) {
  return (
    <div className="on-ink flex min-h-dvh flex-col items-center justify-center gap-5 bg-ink px-8 text-center text-on-ink">
      <span className="grid size-14 place-items-center rounded-full bg-[var(--ink-2)] text-[24px] text-accent">
        {icon ?? <IconAlert />}
      </span>
      <div>
        <p className="font-display text-[22px] text-balance">{title}</p>
        {subtitle && (
          <p className="mt-2 text-[14px] font-semibold text-on-ink-muted">{subtitle}</p>
        )}
      </div>
      <div className="w-full max-w-xs">{action}</div>
    </div>
  )
}
