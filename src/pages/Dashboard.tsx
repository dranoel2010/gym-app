import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useAsyncData } from '@/hooks/useAsyncData'
import { fetchAll } from '@/lib/fetchAll'
import { reportError } from '@/lib/errors'
import { formatDateTime, formatElapsed, isoDaysAgo } from '@/lib/date'
import { avgWorkoutsPerWeek, formatNumber, totalVolume, weekStreak } from '@/lib/formulas'
import { greetingNameOf } from '@/lib/profile'
import type { Plan, Workout } from '@/lib/database.types'
import { Button, LinkButton } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { Badge, InkCard, SectionTitle, StatTile } from '@/components/ui/Display'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/States'
import {
  IconArrowRight,
  IconCheck,
  IconClock,
  IconDumbbell,
  IconPlay,
  IconPlus,
} from '@/components/ui/Icons'

interface DashboardData {
  plans: Plan[]
  recent: Workout[]
  /** Irgendein noch offenes Training — auch zu einem anderen Plan. */
  openWorkout: Workout | null
  streak: number
  perWeek: number
  weekVolume: number
}

/** Dashboard — `/` (Spec §4.5), Gestaltung nach Screen 02 des Designs. */
export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [selectedPlan, setSelectedPlan] = useState<string>('')
  const [starting, setStarting] = useState(false)

  const state = useAsyncData<DashboardData>(async () => {
    const [plansRes, recentRes, openRes, finishedRes] = await Promise.all([
      supabase
        .from('plans')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('workouts')
        .select('*')
        .eq('user_id', user!.id)
        .order('started_at', { ascending: false })
        .limit(5),
      // Neu in v2 (Spec §4.5): ein offenes Training wird prominent angezeigt,
      // auch wenn es zu einem anderen Plan gehoert. In v1 konnten unbemerkt
      // mehrere offene Workouts parallel existieren.
      supabase
        .from('workouts')
        .select('*')
        .eq('user_id', user!.id)
        .is('finished_at', null)
        .order('started_at', { ascending: false })
        .limit(1),
      // Grundlage fuer Streak und Ø/Woche.
      supabase
        .from('workouts')
        .select('id, finished_at')
        .eq('user_id', user!.id)
        .not('finished_at', 'is', null)
        .gte('finished_at', isoDaysAgo(180)),
    ])

    if (plansRes.error) throw plansRes.error
    if (recentRes.error) throw recentRes.error
    if (openRes.error) throw openRes.error
    if (finishedRes.error) throw finishedRes.error

    const finished = (finishedRes.data ?? []) as Array<{ id: string; finished_at: string }>

    // Volumen der laufenden Woche — nur die Saetze der letzten 7 Tage, damit
    // die Abfrage klein bleibt.
    const recentIds = finished
      .filter((w) => new Date(w.finished_at) >= new Date(isoDaysAgo(7)))
      .map((w) => w.id)

    let weekVolume = 0
    if (recentIds.length > 0) {
      const sets = await fetchAll<{ reps: number; weight: number }>((from, to) =>
        supabase.from('workout_sets').select('reps, weight').in('workout_id', recentIds).range(from, to)
      )
      weekVolume = totalVolume(sets.map((s) => ({ reps: s.reps, weight: Number(s.weight) })))
    }

    return {
      plans: (plansRes.data ?? []) as Plan[],
      recent: (recentRes.data ?? []) as Workout[],
      openWorkout: ((openRes.data ?? []) as Workout[])[0] ?? null,
      streak: weekStreak(finished.map((w) => w.finished_at)),
      perWeek: avgWorkoutsPerWeek(finished.map((w) => w.finished_at)),
      weekVolume,
    }
  }, [user!.id])

  const plans = state.data?.plans ?? []
  const planNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of plans) map.set(p.id, p.name)
    return map
  }, [plans])

  // Vorbelegung mit dem zuletzt angelegten Plan.
  const effectivePlanId = selectedPlan || plans[0]?.id || ''

  const startWorkout = async () => {
    if (!effectivePlanId) return
    setStarting(true)
    try {
      // `start_workout` gibt ein bereits offenes Training desselben Plans
      // zurueck, statt ein zweites anzulegen (Spec §4.5 AK-1). Die Pruefung
      // liegt in der Datenbank — ein Doppelklick oder ein zweites Geraet kann
      // damit keine Dublette erzeugen.
      const { data, error } = await supabase.rpc('start_workout', { p_plan_id: effectivePlanId })
      if (error) throw error
      if (!data) throw new Error('Kein Workout zurückgegeben')
      navigate(`/workout/${data as string}`)
    } catch (error) {
      // In v1 scheiterte der Trainingsstart wortlos.
      reportError('Training starten', error, 'Das Training konnte nicht gestartet werden.')
      setStarting(false)
    }
  }

  const greeting = greetingNameOf(user)
  const today = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })

  return (
    <>
      {/* ---------- Begrüßung ---------- */}
      <div className="mb-6">
        <p className="text-[13px] font-bold text-muted">{today}</p>
        <h1 className="font-display mt-1 text-[28px]">Hey, {greeting}</h1>
      </div>

      {/* ---------- Laufendes Training ---------- */}
      {state.data?.openWorkout && (
        <Link
          to={`/workout/${state.data.openWorkout.id}`}
          className="animate-rise mb-4 flex items-center gap-3.5 rounded-[20px] bg-accent p-4 text-accent-ink transition-transform duration-[var(--dur-fast)] active:scale-[0.99]"
        >
          <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-ink text-[17px] text-accent">
            <IconPlay />
            <span className="absolute inset-0 animate-ping rounded-full bg-ink opacity-20" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Training läuft</p>
            <p className="mt-1 truncate text-[14px] font-bold">
              {planNames.get(state.data.openWorkout.plan_id ?? '') ?? 'Freies Training'} · seit{' '}
              {formatElapsed(state.data.openWorkout.started_at)}
            </p>
          </div>
          <IconArrowRight className="shrink-0 text-[20px]" />
        </Link>
      )}

      {/* ---------- Training starten ---------- */}
      {state.loading ? (
        <SkeletonList rows={1} height="h-52" />
      ) : state.error ? (
        <ErrorState
          message="Deine Daten konnten nicht geladen werden."
          onRetry={state.reload}
          retrying={state.reloading}
        />
      ) : plans.length === 0 ? (
        <EmptyState
          icon={<IconDumbbell />}
          title="Noch kein Trainingsplan"
          description="Ein Plan legt fest, welche Übungen mit welchen Zielvorgaben du trainierst."
          action={
            <LinkButton to="/plans/new" size="lg" icon={<IconPlus />}>
              Erstelle erst einen Plan
            </LinkButton>
          }
        />
      ) : (
        <InkCard className="animate-rise">
          <p className="eyebrow text-accent">Heutiges Training</p>

          <Select
            tone="ink"
            value={effectivePlanId}
            onChange={(e) => setSelectedPlan(e.target.value)}
            aria-label="Plan"
            className="mt-3"
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>

          <Button
            size="lg"
            block
            className="mt-3.5"
            loading={starting}
            onClick={startWorkout}
            icon={<IconPlay />}
          >
            {starting ? 'Wird gestartet …' : 'Training starten'}
          </Button>
        </InkCard>
      )}

      {/* ---------- Kennzahlen ---------- */}
      {!state.loading && !state.error && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <StatTile label="Serie" value={state.data?.streak ?? 0} hint="Wochen in Folge" />
          <StatTile label="Ø Woche" value={formatNumber(state.data?.perWeek ?? 0)} unit="×" />
          <StatTile
            label="7 Tage"
            value={formatNumber(Math.round((state.data?.weekVolume ?? 0) / 100) / 10)}
            unit="t"
          />
        </div>
      )}

      {/* ---------- Deine Pläne ---------- */}
      {plans.length > 0 && (
        <section className="mt-8">
          <SectionTitle
            action={
              <Link to="/plans" className="text-[13px] font-extrabold text-muted hover:text-fg">
                Alle
              </Link>
            }
          >
            Deine Pläne
          </SectionTitle>

          {/* Waagerecht scrollbar wie im Design — auf schmalen Geräten passen
              sonst nur eineinhalb Karten nebeneinander. */}
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
            {plans.slice(0, 6).map((plan, i) => (
              <Link
                key={plan.id}
                to={`/plans/${plan.id}`}
                className="w-[172px] shrink-0 overflow-hidden rounded-[22px] border border-line bg-surface transition-transform duration-[var(--dur-fast)] active:scale-[0.98]"
              >
                <div
                  className="flex h-24 items-end p-3"
                  style={{
                    background:
                      i === 0
                        ? 'linear-gradient(140deg,#c6f24e,#a4d92f)'
                        : 'linear-gradient(140deg,#2a2d34,#16181d)',
                  }}
                >
                  <span
                    className={`font-display text-[13px] uppercase ${
                      i === 0 ? 'text-ink' : 'text-white'
                    }`}
                  >
                    {i === 0 ? 'Zuletzt' : 'Plan'}
                  </span>
                </div>
                <div className="p-3.5">
                  <p className="truncate text-[15px] font-extrabold">{plan.name}</p>
                  <p className="mt-1 text-[12px] font-semibold text-muted">Bearbeiten</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ---------- Letzte Trainings ---------- */}
      <section className="mt-8">
        <SectionTitle
          action={
            <Link to="/stats" className="text-[13px] font-extrabold text-muted hover:text-fg">
              Statistik
            </Link>
          }
        >
          Letzte Trainings
        </SectionTitle>

        {state.loading ? (
          <SkeletonList rows={3} height="h-16" />
        ) : state.error ? null : (state.data?.recent.length ?? 0) === 0 ? (
          <EmptyState
            icon={<IconClock />}
            title="Noch keine Trainings aufgezeichnet."
            description="Sobald du ein Training startest, erscheint es hier."
          />
        ) : (
          <ul className="stagger flex flex-col gap-2.5">
            {state.data!.recent.map((w) => {
              const open = w.finished_at === null
              // Ein Workout, dessen Plan geloescht wurde, verschwindet nicht —
              // es heisst dann "Freies Training" (Spec §4.5 AK-2).
              const planName = planNames.get(w.plan_id ?? '') ?? 'Freies Training'

              const inner = (
                <>
                  <span
                    className={`grid size-11 shrink-0 place-items-center rounded-[12px] text-[17px] ${
                      open ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-subtle'
                    }`}
                  >
                    {open ? <IconPlay /> : <IconCheck />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-extrabold">{planName}</p>
                    <p className="mt-0.5 truncate text-[12px] font-semibold text-muted">
                      {formatDateTime(w.started_at)}
                    </p>
                  </div>
                  {open ? <Badge tone="accent">Fortsetzen</Badge> : <Badge>Abgeschlossen</Badge>}
                </>
              )

              return (
                <li key={w.id}>
                  {open ? (
                    <Link
                      to={`/workout/${w.id}`}
                      className="flex items-center gap-3 rounded-[18px] border border-line bg-surface p-3 transition-transform duration-[var(--dur-fast)] active:scale-[0.99]"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 rounded-[18px] border border-line bg-surface p-3">
                      {inner}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
