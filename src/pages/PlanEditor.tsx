import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { fetchAll } from '@/lib/fetchAll'
import { humanizeDbError } from '@/lib/errors'
import { invalidateExerciseNames } from '@/hooks/useExerciseNames'
import type { Plan, PlanExercise } from '@/lib/database.types'
import { PageHeader } from '@/components/Layout'
import { ExerciseNameInput } from '@/components/ExerciseNameInput'
import { Button, IconButton } from '@/components/ui/Button'
import { Field, Input, NumberField } from '@/components/ui/Field'
import { EmptyState, PageLoader } from '@/components/ui/States'
import { IconAlert, IconChevronLeft, IconGrip, IconPlus, IconTrash } from '@/components/ui/Icons'

/* -------------------------------------------------------------------------- */

/** Deutsches Dezimalkomma erlauben. */
function num(v: string): number {
  return parseFloat((v ?? '').replace(',', '.'))
}

const rowSchema = z.object({
  exercise_name: z.string(),
  target_sets: z.string(),
  target_reps: z.string(),
  target_weight: z.string(),
})

const schema = z
  .object({
    name: z.string(),
    exercises: z.array(rowSchema),
  })
  .superRefine((val, ctx) => {
    if (val.name.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['name'], message: 'Plan-Name ist erforderlich' })
    }

    const named = val.exercises.filter((e) => e.exercise_name.trim() !== '')
    if (named.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['exercises'],
        message: 'Mindestens eine Übung ist erforderlich',
      })
    }

    // Zielwerte werden nur bei Zeilen geprueft, die auch gespeichert werden.
    // Eine leere Zeile am Ende ist kein Fehler, sie faellt einfach weg.
    val.exercises.forEach((e, i) => {
      if (e.exercise_name.trim() === '') return

      const sets = num(e.target_sets)
      if (!Number.isInteger(sets) || sets < 1 || sets > 20) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['exercises', i, 'target_sets'],
          message: 'Sätze muss zwischen 1 und 20 liegen',
        })
      }

      const reps = num(e.target_reps)
      if (!Number.isInteger(reps) || reps < 1 || reps > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['exercises', i, 'target_reps'],
          message: 'Wdh. muss zwischen 1 und 100 liegen',
        })
      }

      const weight = num(e.target_weight)
      if (!Number.isFinite(weight) || weight < 0 || weight > 999 || Math.round(weight * 10) !== weight * 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['exercises', i, 'target_weight'],
          message: 'Gewicht muss zwischen 0 und 999 liegen',
        })
      }
    })
  })

type Values = z.infer<typeof schema>

const EMPTY_ROW = { exercise_name: '', target_sets: '3', target_reps: '10', target_weight: '0' }

/* -------------------------------------------------------------------------- */

/** Planeditor — `/plans/new` und `/plans/:id` (Spec §4.7). */
export default function PlanEditor() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id
  const navigate = useNavigate()
  const { user } = useAuth()

  // Ladezustand ab dem ersten Render — der Planeditor hatte in v1 gar keinen,
  // das Formular blieb leer und Speichern tat so, als haette es funktioniert.
  const [loading, setLoading] = useState(!isNew)
  const [notFound, setNotFound] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', exercises: [EMPTY_ROW] },
    mode: 'onSubmit',
  })

  const { fields, append, remove, move } = useFieldArray({ control, name: 'exercises' })

  /* ---------------- Bestehenden Plan laden ---------------- */

  useEffect(() => {
    if (isNew) return
    let active = true
    setLoading(true)

    ;(async () => {
      try {
        const { data: plan, error } = await supabase
          .from('plans')
          .select('*')
          .eq('id', id!)
          .eq('user_id', user!.id)
          .maybeSingle()

        if (error) throw error
        if (!active) return

        // Existiert der Plan nicht oder gehoert er einem anderen Nutzer,
        // erscheint ein Fehlerscreen — nicht ein leeres Formular (Spec §4.7).
        if (!plan) {
          setNotFound(true)
          return
        }

        const exercises = await fetchAll<PlanExercise>((from, to) =>
          supabase
            .from('plan_exercises')
            .select('*')
            .eq('plan_id', id!)
            .order('order_index', { ascending: true })
            .range(from, to)
        )
        if (!active) return

        reset({
          name: (plan as Plan).name,
          exercises:
            exercises.length > 0
              ? exercises.map((e) => ({
                  exercise_name: e.exercise_name,
                  target_sets: String(e.target_sets),
                  target_reps: String(e.target_reps),
                  target_weight: String(Number(e.target_weight)).replace('.', ','),
                }))
              : [EMPTY_ROW],
        })
      } catch (e) {
        console.error('[gym-tracker] Plan konnte nicht geladen werden:', e)
        if (active) setNotFound(true)
      } finally {
        // Der Ladezustand loest in jedem Fall auf.
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [id, isNew, reset, user])

  /* ---------------- Drag and drop ---------------- */

  const sensors = useSensors(
    // Erst ab 8 px Bewegung greift das Ziehen — sonst loest jeder Tipp auf ein
    // Eingabefeld einen Drag aus.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = fields.findIndex((f) => f.id === active.id)
    const to = fields.findIndex((f) => f.id === over.id)
    if (from >= 0 && to >= 0) move(from, to)
  }

  /* ---------------- Speichern ---------------- */

  const watchedExercises = watch('exercises')
  const emptyRowCount = useMemo(
    () => (watchedExercises ?? []).filter((e) => (e?.exercise_name ?? '').trim() === '').length,
    [watchedExercises]
  )

  const onSubmit = async (values: Values) => {
    setSaveError(null)

    const payload = values.exercises
      .filter((e) => e.exercise_name.trim() !== '')
      .map((e) => ({
        exercise_name: e.exercise_name.trim(),
        target_sets: num(e.target_sets),
        target_reps: num(e.target_reps),
        target_weight: num(e.target_weight),
      }))

    try {
      // Speichern laeuft ueber eine Postgres-Funktion in EINER Transaktion:
      // entweder alles oder nichts. In v1 wurden erst alle Uebungen geloescht
      // und dann neu eingefuegt — schlug das Einfuegen fehl, waren sie weg.
      // `order_index` vergibt die Funktion neu, von 0 an.
      const { error } = await supabase.rpc('save_plan', {
        p_plan_id: isNew ? null : id,
        p_name: values.name.trim(),
        p_exercises: payload,
      })
      if (error) throw error

      invalidateExerciseNames()

      // Verworfene Zeilen werden sichtbar gemeldet, nicht stillschweigend
      // geschluckt wie in v1.
      const dropped = values.exercises.length - payload.length
      if (dropped > 0) {
        toast.warning(
          dropped === 1
            ? '1 Zeile ohne Namen wurde nicht gespeichert.'
            : `${dropped} Zeilen ohne Namen wurden nicht gespeichert.`
        )
      }
      toast.success(isNew ? 'Plan angelegt.' : 'Plan gespeichert.')
      navigate('/plans')
    } catch (error) {
      console.error('[gym-tracker] Plan speichern fehlgeschlagen:', error)
      setSaveError(humanizeDbError(error, 'Der Plan konnte nicht gespeichert werden.'))
    }
  }

  /* ---------------- Darstellung ---------------- */

  if (loading) return <PageLoader label="Plan wird geladen …" />

  if (notFound) {
    return (
      <>
        <BackLink />
        <EmptyState
          icon={<IconAlert />}
          title="Plan nicht gefunden"
          description="Dieser Plan existiert nicht mehr oder gehört zu einem anderen Konto."
          action={
            <Button onClick={() => navigate('/plans')} variant="secondary">
              Zurück zu den Plänen
            </Button>
          }
        />
      </>
    )
  }

  const exercisesError = (errors.exercises as { message?: string } | undefined)?.message

  return (
    <>
      <BackLink />
      <PageHeader
        title={isNew ? 'Neuer Plan' : 'Plan bearbeiten'}
        description="Zielvorgaben sind Richtwerte — im Training kannst du jederzeit davon abweichen."
      />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
        <Field label="Plan-Name" error={errors.name?.message}>
          {({ id: fieldId, describedBy, invalid }) => (
            <Input
              id={fieldId}
              aria-describedby={describedBy}
              invalid={invalid}
              placeholder="z. B. Push Day A"
              autoComplete="off"
              {...register('name')}
            />
          )}
        </Field>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[13px] font-semibold tracking-[0.08em] text-subtle uppercase">
              Übungen
            </h2>
            <span className="text-[12px] text-subtle">
              {fields.length} {fields.length === 1 ? 'Zeile' : 'Zeilen'}
            </span>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          >
            <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              <ul className="flex flex-col gap-3">
                {fields.map((field, index) => (
                  <ExerciseRow
                    key={field.id}
                    sortableId={field.id}
                    index={index}
                    control={control}
                    errors={errors}
                    canRemove={fields.length > 1}
                    onRemove={() => remove(index)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>

          {exercisesError && (
            <p role="alert" className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-danger">
              <IconAlert className="text-[15px]" />
              {exercisesError}
            </p>
          )}

          <Button
            variant="secondary"
            block
            className="mt-3"
            icon={<IconPlus />}
            onClick={() => append(EMPTY_ROW)}
          >
            Übung hinzufügen
          </Button>
        </div>

        {emptyRowCount > 0 && (
          <p className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--warn)_35%,transparent)] bg-[var(--warn-soft)] px-3.5 py-3 text-[13.5px] leading-snug text-fg">
            <IconAlert className="mt-0.5 shrink-0 text-[15px] text-[var(--warn)]" />
            {emptyRowCount === 1
              ? '1 Zeile hat keinen Namen und wird beim Speichern verworfen.'
              : `${emptyRowCount} Zeilen haben keinen Namen und werden beim Speichern verworfen.`}
          </p>
        )}

        {saveError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] px-3.5 py-3 text-[14px] leading-snug font-medium text-danger"
          >
            <IconAlert className="mt-0.5 shrink-0 text-[16px]" />
            {saveError}
          </p>
        )}

        {/* Klebrige Aktionsleiste: der Speichern-Knopf bleibt auch bei langen
            Plaenen in Daumenreichweite. */}
        <div className="glass sticky bottom-[calc(64px+env(safe-area-inset-bottom))] -mx-4 border-t border-line px-4 py-3 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <Button type="submit" size="lg" block loading={isSubmitting}>
            {isSubmitting ? 'Wird gespeichert …' : 'Plan speichern'}
          </Button>
        </div>
      </form>
    </>
  )
}

/* -------------------------------------------------------------------------- */

function BackLink() {
  return (
    <Link
      to="/plans"
      className="mb-3 -ml-1 inline-flex items-center gap-1 text-[14px] font-medium text-muted transition-colors hover:text-fg"
    >
      <IconChevronLeft className="text-[16px]" />
      Pläne
    </Link>
  )
}

/* -------------------------------------------------------------------------- */

type ExerciseRowProps = {
  sortableId: string
  index: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: any
  canRemove: boolean
  onRemove: () => void
}

function ExerciseRow({ sortableId, index, control, errors, canRemove, onRemove }: ExerciseRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
  })

  const rowErrors = errors?.exercises?.[index] ?? {}

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-[var(--radius-lg)] border bg-surface p-3 ${
        isDragging
          ? 'z-10 border-[var(--accent)] opacity-95 shadow-[var(--shadow-lg)]'
          : 'border-line'
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label={`Übung ${index + 1} verschieben`}
          className="mt-0.5 grid size-12 shrink-0 cursor-grab touch-none place-items-center rounded-[var(--radius-sm)] text-[18px] text-subtle transition-colors hover:bg-surface-2 hover:text-fg active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <IconGrip />
        </button>

        <div className="min-w-0 flex-1">
          <Controller
            control={control}
            name={`exercises.${index}.exercise_name`}
            render={({ field }) => (
              <ExerciseNameInput
                value={field.value}
                onChange={field.onChange}
                invalid={!!rowErrors.exercise_name}
              />
            )}
          />

          <div className="mt-2.5 grid grid-cols-3 gap-2">
            <NumField
              control={control}
              name={`exercises.${index}.target_sets`}
              label="Sätze"
              min={1}
              max={20}
              error={rowErrors.target_sets?.message}
            />
            <NumField
              control={control}
              name={`exercises.${index}.target_reps`}
              label="Wdh."
              min={1}
              max={100}
              error={rowErrors.target_reps?.message}
            />
            <NumField
              control={control}
              name={`exercises.${index}.target_weight`}
              label="kg"
              min={0}
              max={999}
              step={0.5}
              decimal
              error={rowErrors.target_weight?.message}
            />
          </div>
        </div>

        <IconButton
          label={`Übung ${index + 1} entfernen`}
          variant="quiet"
          // Die letzte verbleibende Zeile laesst sich nicht loeschen — ein Plan
          // ohne jede Zeile waere ein Zustand, aus dem man nur schwer herausfindet.
          disabled={!canRemove}
          onClick={onRemove}
          className="mt-0.5"
        >
          <IconTrash />
        </IconButton>
      </div>
    </li>
  )
}

function NumField({
  control,
  name,
  label,
  min,
  max,
  step = 1,
  decimal = false,
  error,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any
  name: string
  label: string
  min: number
  max: number
  step?: number
  decimal?: boolean
  error?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="pl-0.5 text-[11.5px] font-semibold text-subtle">{label}</span>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <NumberField
            value={field.value ?? ''}
            onValueChange={field.onChange}
            min={min}
            max={max}
            step={step}
            decimal={decimal}
            invalid={!!error}
            // Drei Felder nebeneinander auf 390 px: für Plus/Minus ist hier
            // kein Platz, die Zahl selbst hätte sonst 12 px Breite.
            steppers={false}
            aria-label={label}
          />
        )}
      />
      {error && (
        <span role="alert" className="text-[11.5px] leading-snug font-medium text-danger">
          {error}
        </span>
      )}
    </div>
  )
}
