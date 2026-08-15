import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useAsyncData } from '@/hooks/useAsyncData'
import { fetchAll } from '@/lib/fetchAll'
import { formatDateAxis, isoDaysAgo, localDateStr } from '@/lib/date'
import {
  avgWorkoutsPerWeek,
  bestSet,
  dailySeries,
  formatNumber,
  weekStreak,
} from '@/lib/formulas'
import type { WorkoutSet } from '@/lib/database.types'
import { PageHeader } from '@/components/Layout'
import { LinkButton } from '@/components/ui/Button'
import { Eyebrow, InkCard, SectionTitle, StatTile } from '@/components/ui/Display'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/States'
import { IconPlay, IconStats } from '@/components/ui/Icons'

/**
 * Zeitraum der Auswertung.
 *
 * v1 wertete 180 Tage aus, hier sind es 365 — ausdrücklich so entschieden.
 * Möglich ist das nur, weil die Satzabfrage paginiert läuft (Spec §3.5):
 * ohne `fetchAll` wären ab 1000 Sätzen still Daten verschwunden.
 */
const RANGE_DAYS = 365

interface StatsData {
  /** Kalendertage abgeschlossener Trainings, lokal gerechnet. */
  finishedAt: string[]
  /** Sätze mit dem Tag des zugehörigen Workouts. */
  sets: Array<{ exercise_name: string; set_number: number; reps: number; weight: number; day: string }>
}

/** Statistik — `/stats` (Spec §4.10). */
export default function Stats() {
  const { user } = useAuth()
  const [selected, setSelected] = useState<string>('')

  const state = useAsyncData<StatsData>(async () => {
    const { data: workouts, error: wErr } = await supabase
      .from('workouts')
      .select('id, finished_at')
      .eq('user_id', user!.id)
      .not('finished_at', 'is', null)
      .gte('finished_at', isoDaysAgo(RANGE_DAYS))
      .order('finished_at', { ascending: true })

    // Zwei getrennte Fehlertexte (Spec §4.10) — der Nutzer soll wissen, ob die
    // Trainings oder die Sätze fehlen.
    if (wErr) throw Object.assign(new Error('workouts'), { scope: 'workouts', cause: wErr })

    const rows = (workouts ?? []) as Array<{ id: string; finished_at: string }>
    if (rows.length === 0) return { finishedAt: [], sets: [] }

    // Tag des Workouts, nicht des Satzes: ein Training über Mitternacht bleibt
    // so an einem Tag zusammen.
    const dayOf = new Map<string, string>()
    for (const w of rows) dayOf.set(w.id, localDateStr(new Date(w.finished_at)))

    const ids = rows.map((w) => w.id)
    let raw: WorkoutSet[]
    try {
      raw = await fetchAll<WorkoutSet>((from, to) =>
        supabase.from('workout_sets').select('*').in('workout_id', ids).range(from, to)
      )
    } catch (cause) {
      throw Object.assign(new Error('sets'), { scope: 'sets', cause })
    }

    return {
      finishedAt: rows.map((w) => w.finished_at),
      sets: raw.map((s) => ({
        exercise_name: s.exercise_name,
        set_number: s.set_number,
        reps: s.reps,
        weight: Number(s.weight),
        day: dayOf.get(s.workout_id) ?? localDateStr(new Date(s.logged_at)),
      })),
    }
  }, [user!.id])

  const exercises = useMemo(() => {
    const names = new Map<string, string>()
    for (const s of state.data?.sets ?? []) {
      const key = s.exercise_name.trim().toLowerCase()
      if (!names.has(key)) names.set(key, s.exercise_name)
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b, 'de'))
  }, [state.data])

  // Vorauswahl: erste alphabetisch.
  const activeExercise = selected && exercises.includes(selected) ? selected : (exercises[0] ?? '')

  const series = useMemo(
    () =>
      activeExercise
        ? dailySeries(state.data?.sets ?? [], activeExercise)
        : { points: [], unit: 'volume' as const },
    [state.data, activeExercise]
  )

  const streak = useMemo(() => weekStreak(state.data?.finishedAt ?? []), [state.data])
  const perWeek = useMemo(() => avgWorkoutsPerWeek(state.data?.finishedAt ?? []), [state.data])

  /** Bester Satz je Übung — im Design die "Persönliche Rekorde"-Liste. */
  const records = useMemo(() => {
    type Row = { name: string; reps: number; weight: number }
    const byExercise = new Map<string, Row[]>()
    for (const s of state.data?.sets ?? []) {
      const key = s.exercise_name.trim().toLowerCase()
      const list = byExercise.get(key) ?? []
      list.push({ name: s.exercise_name, reps: s.reps, weight: s.weight })
      byExercise.set(key, list)
    }

    const out: Array<{ name: string; reps: number; weight: number }> = []
    for (const list of byExercise.values()) {
      const best = bestSet(list)
      // Reine Körpergewichtsübungen haben keinen sinnvollen Gewichtsrekord.
      if (best && best.weight > 0) out.push(best)
    }
    return out.sort((a, b) => b.weight - a.weight).slice(0, 5)
  }, [state.data])

  const unitLabel = series.unit === 'reps' ? 'Wdh.' : 'kg·Wdh.'

  /* ---------------- Zustände ---------------- */

  if (state.loading) {
    return (
      <>
        <PageHeader title="Statistik" />
        <SkeletonList rows={1} height="h-24" />
        <div className="mt-4">
          <SkeletonList rows={1} height="h-64" />
        </div>
      </>
    )
  }

  if (state.error) {
    const scope = (state.error as { scope?: string }).scope
    return (
      <>
        <PageHeader title="Statistik" />
        <ErrorState
          message={
            scope === 'sets'
              ? 'Satzdaten konnten nicht geladen werden.'
              : 'Statistiken konnten nicht geladen werden.'
          }
          onRetry={state.reload}
          retrying={state.reloading}
        />
      </>
    )
  }

  if ((state.data?.finishedAt.length ?? 0) === 0) {
    return (
      <>
        <PageHeader title="Statistik" />
        <EmptyState
          icon={<IconStats />}
          title="Noch keine Statistiken"
          description="Schließe dein erstes Training ab, um Daten zu sehen."
          action={
            <LinkButton to="/" size="lg" icon={<IconPlay />}>
              Erstes Training starten
            </LinkButton>
          }
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Statistik"
        description={`Auswertung der letzten ${RANGE_DAYS} Tage.`}
      />

      {/* ---------- Kennzahlen ---------- */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Serie"
          value={streak}
          hint={streak === 1 ? 'Woche in Folge' : 'Wochen in Folge'}
        />
        <StatTile label="Ø Woche" value={formatNumber(perWeek)} unit="×" hint="Trainings" />
      </div>

      {/* ---------- Verlauf einer Übung ---------- */}
      {exercises.length > 0 && (
        <InkCard className="mt-4" glow={false}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Eyebrow>Tagesvolumen</Eyebrow>
              <p className="font-display mt-2 truncate text-[24px]">{activeExercise}</p>
            </div>
            <span className="shrink-0 rounded-full bg-[var(--ink-3)] px-2.5 py-1 text-[11px] font-extrabold text-on-ink-muted">
              {unitLabel}
            </span>
          </div>

          {series.points.length === 0 ? (
            <p className="py-10 text-center text-[14px] font-semibold text-on-ink-muted">
              Für diese Übung gibt es noch keine Sätze.
            </p>
          ) : (
            <div className="mt-4 h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {/* Kein negativer linker Rand: die Y-Achse braucht die Breite,
                    sonst wird bei vierstelligen Volumina die erste Ziffer
                    abgeschnitten. */}
                <AreaChart data={series.points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--ink-line)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDateAxis}
                    tick={{ fill: 'var(--on-ink-subtle)', fontSize: 11, fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fill: 'var(--on-ink-subtle)', fontSize: 11, fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                    tickFormatter={(v) => formatNumber(Number(v), 0)}
                  />
                  <Tooltip
                    cursor={{ stroke: 'var(--accent)', strokeWidth: 1 }}
                    contentStyle={{
                      background: 'var(--ink-3)',
                      border: '1px solid var(--ink-line)',
                      borderRadius: 14,
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--on-ink)',
                    }}
                    labelFormatter={(v) => formatDateAxis(String(v))}
                    formatter={(value) => [`${formatNumber(Number(value), 0)} ${unitLabel}`, '']}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="var(--accent)"
                    strokeWidth={2.5}
                    fill="url(#volumeFill)"
                    dot={series.points.length <= 20 ? { r: 3, fill: 'var(--accent)' } : false}
                    activeDot={{ r: 5, fill: 'var(--accent)' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Auswahlfeld nur bei mehr als einer Übung (Spec §4.10). */}
          {exercises.length > 1 && (
            <div
              className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5"
              role="tablist"
              aria-label="Übung wählen"
            >
              {exercises.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={name === activeExercise}
                  onClick={() => setSelected(name)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-extrabold transition-colors ${
                    name === activeExercise
                      ? 'bg-accent text-accent-ink'
                      : 'bg-[var(--ink-3)] text-on-ink-muted hover:text-on-ink'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </InkCard>
      )}

      {/* ---------- Rekorde ---------- */}
      {records.length > 0 && (
        <section className="mt-8">
          <SectionTitle>Beste Sätze</SectionTitle>
          <ul className="stagger flex flex-col gap-2.5">
            {records.map((r, i) => (
              <li
                key={r.name}
                className="flex items-center gap-3 rounded-[18px] border border-line bg-surface px-4 py-3"
              >
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-[11px] text-[14px] font-extrabold ${
                    i === 0 ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-subtle'
                  }`}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold">{r.name}</span>
                <div className="shrink-0 text-right">
                  <div className="font-display tnum text-[16px]">{formatNumber(r.weight)} kg</div>
                  <div className="tnum text-[11px] font-bold text-muted">{r.reps} Wdh.</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
