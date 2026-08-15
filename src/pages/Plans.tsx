import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useAsyncData } from '@/hooks/useAsyncData'
import { fetchAll } from '@/lib/fetchAll'
import { humanizeDbError } from '@/lib/errors'
import { downloadBlob, sanitizeFilename } from '@/lib/download'
import { formatDate } from '@/lib/date'
import { invalidateExerciseNames } from '@/hooks/useExerciseNames'
import type { Plan, PlanExercise } from '@/lib/database.types'
import { PageHeader } from '@/components/Layout'
import { IconButton, LinkButton } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/States'
import { IconDownload, IconPencil, IconPlans, IconPlus, IconTrash, IconUpload } from '@/components/ui/Icons'

/** Planliste — `/plans` (Spec §4.6). */
export default function Plans() {
  const { user } = useAuth()
  const [toDelete, setToDelete] = useState<Plan | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)

  const state = useAsyncData<Plan[]>(async () => {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as Plan[]
  }, [user!.id])

  /* ---------------- Export eines einzelnen Plans ---------------- */

  const exportPlan = async (plan: Plan) => {
    setExportingId(plan.id)
    try {
      const exercises = await fetchAll<PlanExercise>((from, to) =>
        supabase
          .from('plan_exercises')
          .select('*')
          .eq('plan_id', plan.id)
          .order('order_index', { ascending: true })
          .range(from, to)
      )

      // Die Reihenfolge steckt in der Array-Reihenfolge; `order_index` wird
      // bewusst nicht mitgeschrieben (Spec §4.6).
      const payload = {
        name: plan.name,
        exercises: exercises.map((e) => ({
          exercise_name: e.exercise_name,
          target_sets: e.target_sets,
          target_reps: e.target_reps,
          target_weight: Number(e.target_weight),
        })),
      }

      downloadBlob(
        `${sanitizeFilename(plan.name, 'plan')}.json`,
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      )
      toast.success(`„${plan.name}" exportiert.`)
    } catch (error) {
      console.error('[gym-tracker] Export fehlgeschlagen:', error)
      toast.error(humanizeDbError(error, 'Der Plan konnte nicht exportiert werden.'))
    } finally {
      setExportingId(null)
    }
  }

  /* ---------------- Löschen ---------------- */

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const { error } = await supabase.from('plans').delete().eq('id', toDelete.id)
      if (error) throw error

      // Erst nach Bestaetigung der Datenbank aus der Ansicht nehmen — kein
      // optimistisches Loeschen (Spec §3.2).
      state.setData((prev) => (prev ?? []).filter((p) => p.id !== toDelete.id))
      invalidateExerciseNames()
      toast.success(`„${toDelete.name}" gelöscht.`)
      setToDelete(null)
    } catch (error) {
      console.error('[gym-tracker] Plan löschen fehlgeschlagen:', error)
      // Der Dialog bleibt offen und zeigt die Meldung (Spec §4.6).
      setDeleteError(humanizeDbError(error, 'Der Plan konnte nicht gelöscht werden.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Pläne"
        description="Ein Plan bestimmt Übungen und Zielvorgaben für ein Training."
        actions={
          <>
            <LinkButton
              to="/plans/import"
              variant="secondary"
              size="sm"
              icon={<IconUpload />}
              className="hidden sm:inline-flex"
            >
              Import
            </LinkButton>
            <LinkButton to="/plans/new" size="sm" icon={<IconPlus />}>
              Neuer Plan
            </LinkButton>
          </>
        }
      />

      <LinkButton
        to="/plans/import"
        variant="secondary"
        size="md"
        block
        icon={<IconUpload />}
        className="mb-5 sm:hidden"
      >
        Plan importieren
      </LinkButton>

      {state.loading ? (
        <SkeletonList rows={3} height="h-[76px]" />
      ) : state.error ? (
        <ErrorState
          message="Deine Pläne konnten nicht geladen werden."
          onRetry={state.reload}
          retrying={state.reloading}
        />
      ) : (state.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<IconPlans />}
          title="Noch keine Pläne. Erstelle deinen ersten!"
          description="Oder importiere einen bestehenden Plan aus Text, CSV oder JSON."
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <LinkButton to="/plans/new" icon={<IconPlus />}>
                Neuer Plan
              </LinkButton>
              <LinkButton to="/plans/import" variant="secondary" icon={<IconUpload />}>
                Importieren
              </LinkButton>
            </div>
          }
        />
      ) : (
        <ul className="stagger flex flex-col gap-2.5">
          {state.data!.map((plan) => (
            <li
              key={plan.id}
              className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-line bg-surface p-3 pl-4 transition-colors duration-[var(--dur-fast)] hover:border-line-strong"
            >
              <Link to={`/plans/${plan.id}`} className="min-w-0 flex-1 py-1">
                <p className="truncate text-[16px] font-semibold">{plan.name}</p>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  Erstellt {formatDate(plan.created_at)}
                </p>
              </Link>

              {/* Als Link statt Button — ein <a> in einem <button> waere
                  ungueltiges HTML und faende weder Tastatur noch Screenreader. */}
              <Link
                to={`/plans/${plan.id}`}
                aria-label={`„${plan.name}" bearbeiten`}
                title="Bearbeiten"
                className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[19px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <IconPencil />
              </Link>
              <IconButton
                label={`„${plan.name}" exportieren`}
                loading={exportingId === plan.id}
                onClick={() => void exportPlan(plan)}
              >
                <IconDownload />
              </IconButton>
              <IconButton
                label={`„${plan.name}" löschen`}
                variant="quiet"
                onClick={() => {
                  setDeleteError(null)
                  setToDelete(plan)
                }}
              >
                <IconTrash />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        error={deleteError}
        title={`„${toDelete?.name ?? ''}" löschen?`}
        description="Die Trainingshistorie bleibt erhalten. Vergangene Trainings dieses Plans erscheinen künftig als „Freies Training“."
        confirmLabel="Plan löschen"
      />
    </>
  )
}
