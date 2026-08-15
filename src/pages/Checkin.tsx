import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useAsyncData } from '@/hooks/useAsyncData'
import { humanizeDbError } from '@/lib/errors'
import { formatDate, formatDateAxis, todayStr } from '@/lib/date'
import { formatNumber } from '@/lib/formulas'
import type { WeeklyCheckin } from '@/lib/database.types'
import { PageHeader } from '@/components/Layout'
import { Button, IconButton } from '@/components/ui/Button'
import { Field, Input, NumberField } from '@/components/ui/Field'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { Card, DataRow, Eyebrow, SectionTitle, Segmented } from '@/components/ui/Display'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/States'
import { IconAlert, IconCheckin, IconTrash } from '@/components/ui/Icons'

/* -------------------------------------------------------------------------- */

const num = (v: string) => parseFloat((v ?? '').replace(',', '.'))
const isSet = (v: string) => (v ?? '').trim() !== ''

const schema = z
  .object({
    checkin_date: z.string().min(1, 'Datum ist erforderlich'),
    bodyweight: z.string(),
    sleep_hours: z.string(),
    week_rating: z.number().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.checkin_date > todayStr()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['checkin_date'],
        message: 'Kein Datum in der Zukunft',
      })
    }

    if (!isSet(val.bodyweight) && !isSet(val.sleep_hours) && val.week_rating === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bodyweight'],
        message: 'Bitte mindestens ein Feld ausfüllen.',
      })
    }

    if (isSet(val.bodyweight)) {
      const w = num(val.bodyweight)
      if (!Number.isFinite(w) || w < 20 || w > 400) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bodyweight'],
          message: 'Gewicht muss zwischen 20 und 400 kg liegen',
        })
      }
    }

    if (isSet(val.sleep_hours)) {
      const s = num(val.sleep_hours)
      if (!Number.isFinite(s) || s < 0 || s > 24) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sleep_hours'],
          message: 'Schlaf muss zwischen 0 und 24 Stunden liegen',
        })
      }
    }
  })

type Values = z.infer<typeof schema>

const RATINGS = [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))

/* -------------------------------------------------------------------------- */

/** Wochen-Check-in — `/checkin` (Spec §4.11). */
export default function Checkin() {
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState<WeeklyCheckin | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const state = useAsyncData<WeeklyCheckin[]>(async () => {
    const { data, error } = await supabase
      .from('weekly_checkins')
      .select('*')
      .eq('user_id', user!.id)
      .order('checkin_date', { ascending: false })
    if (error) throw error
    return (data ?? []) as WeeklyCheckin[]
  }, [user!.id])

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      checkin_date: todayStr(),
      bodyweight: '',
      sleep_hours: '',
      week_rating: null,
    },
  })

  const chosenDate = watch('checkin_date')

  const existing = useMemo(
    () => (state.data ?? []).find((c) => c.checkin_date === chosenDate) ?? null,
    [state.data, chosenDate]
  )

  // Existiert für das gewählte Datum bereits ein Eintrag, wird er VOR dem
  // Überschreiben ins Formular geladen und der Hinweis darunter sichtbar
  // (Spec §4.11) — sonst überschreibt man unbemerkt eigene Werte.
  useEffect(() => {
    if (!existing) return
    setValue('bodyweight', existing.bodyweight === null ? '' : formatNumber(Number(existing.bodyweight)))
    setValue('sleep_hours', existing.sleep_hours === null ? '' : formatNumber(Number(existing.sleep_hours)))
    setValue('week_rating', existing.week_rating)
  }, [existing, setValue])

  const onSubmit = async (values: Values) => {
    setSaving(true)
    try {
      // Upsert auf (user_id, checkin_date): derselbe Tag wird überschrieben,
      // nicht dupliziert.
      const { error } = await supabase.from('weekly_checkins').upsert(
        {
          user_id: user!.id,
          checkin_date: values.checkin_date,
          bodyweight: isSet(values.bodyweight) ? num(values.bodyweight) : null,
          sleep_hours: isSet(values.sleep_hours) ? num(values.sleep_hours) : null,
          week_rating: values.week_rating,
        },
        { onConflict: 'user_id,checkin_date' }
      )
      if (error) throw error

      toast.success(existing ? 'Check-in aktualisiert.' : 'Check-in gespeichert.')
      state.reload()
      reset({
        checkin_date: todayStr(),
        bodyweight: '',
        sleep_hours: '',
        week_rating: null,
      })
    } catch (error) {
      console.error('[gym-tracker] Check-in speichern fehlgeschlagen:', error)
      toast.error(humanizeDbError(error, 'Der Check-in konnte nicht gespeichert werden.'))
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const { error } = await supabase.from('weekly_checkins').delete().eq('id', toDelete.id)
      if (error) throw error
      // Erst nach Bestätigung der Datenbank aus der Ansicht nehmen (Spec §3.2).
      state.setData((prev) => (prev ?? []).filter((c) => c.id !== toDelete.id))
      toast.success('Check-in gelöscht.')
      setToDelete(null)
    } catch (error) {
      console.error('[gym-tracker] Check-in löschen fehlgeschlagen:', error)
      setDeleteError(humanizeDbError(error, 'Der Check-in konnte nicht gelöscht werden.'))
    } finally {
      setDeleting(false)
    }
  }

  /* ---------------- Gewichtsverlauf ---------------- */

  const weightSeries = useMemo(() => {
    const points = (state.data ?? [])
      .filter((c) => c.bodyweight !== null)
      .map((c) => ({ date: c.checkin_date, value: Number(c.bodyweight) }))
      .sort((a, b) => a.date.localeCompare(b.date))
    return points
  }, [state.data])

  // Y-Achse mit einem Kilogramm Puffer nach oben und unten (Spec §4.11).
  const yDomain = useMemo<[number, number]>(() => {
    if (weightSeries.length === 0) return [0, 1]
    const values = weightSeries.map((p) => p.value)
    return [Math.floor(Math.min(...values) - 1), Math.ceil(Math.max(...values) + 1)]
  }, [weightSeries])

  return (
    <>
      <PageHeader
        title="Check-in"
        description="1× pro Woche, am besten Sonntagmorgen — Gewicht nüchtern nach dem Aufstehen."
      />

      {/* ---------- Formular ---------- */}
      <Card className="p-5" as="section">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Field label="Datum" error={errors.checkin_date?.message}>
            {({ id, invalid }) => (
              <Input
                id={id}
                invalid={invalid}
                type="date"
                max={todayStr()}
                {...register('checkin_date')}
              />
            )}
          </Field>

          {existing && (
            <p className="flex items-start gap-2 rounded-[14px] border border-[color-mix(in_oklab,var(--warn)_35%,transparent)] bg-[var(--warn-soft)] px-3.5 py-2.5 text-[13px] leading-snug font-semibold">
              <IconAlert className="mt-0.5 shrink-0 text-[15px] text-[var(--warn)]" />
              Für den {formatDate(existing.checkin_date)} gibt es bereits einen Check-in. Die Werte
              sind geladen — Speichern überschreibt sie.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Körpergewicht" aside="kg" error={errors.bodyweight?.message}>
              {({ invalid }) => (
                <Controller
                  control={control}
                  name="bodyweight"
                  render={({ field }) => (
                    <NumberField
                      value={field.value}
                      onValueChange={field.onChange}
                      step={0.1}
                      min={20}
                      max={400}
                      decimal
                      invalid={invalid}
                      placeholder="—"
                      aria-label="Körpergewicht in Kilogramm"
                    />
                  )}
                />
              )}
            </Field>

            <Field label="Schlaf Ø" aside="h" error={errors.sleep_hours?.message}>
              {({ invalid }) => (
                <Controller
                  control={control}
                  name="sleep_hours"
                  render={({ field }) => (
                    <NumberField
                      value={field.value}
                      onValueChange={field.onChange}
                      step={0.1}
                      min={0}
                      max={24}
                      decimal
                      invalid={invalid}
                      placeholder="—"
                      aria-label="Durchschnittlicher Schlaf in Stunden"
                    />
                  )}
                />
              )}
            </Field>
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold text-muted">Wochenbewertung</span>
              <span className="text-[12px] text-subtle">1 = mies · 5 = top</span>
            </div>
            <Controller
              control={control}
              name="week_rating"
              render={({ field }) => (
                <Segmented
                  name="week_rating"
                  ariaLabel="Wochenbewertung von 1 bis 5"
                  options={RATINGS}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
            <p className="mt-1.5 text-[12px] text-subtle">
              Energie und Motivation. Erneuter Tipp hebt die Auswahl auf.
            </p>
          </div>

          <Button type="submit" size="lg" block loading={saving} className="mt-1">
            {saving ? 'Wird gespeichert …' : existing ? 'Check-in überschreiben' : 'Check-in speichern'}
          </Button>
        </form>
      </Card>

      {/* ---------- Gewichtsverlauf ---------- */}
      {weightSeries.length >= 2 && (
        <section className="mt-8">
          <SectionTitle>Gewichtsverlauf</SectionTitle>
          <Card className="p-4">
            <Eyebrow tone="muted">Kilogramm</Eyebrow>
            <div className="mt-3 h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weightSeries} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDateAxis}
                    tick={{ fill: 'var(--chart-axis)', fontSize: 11, fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    domain={yDomain}
                    tick={{ fill: 'var(--chart-axis)', fontSize: 11, fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--surface)',
                      border: '1px solid var(--line)',
                      borderRadius: 14,
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--fg)',
                    }}
                    labelFormatter={(v) => formatDate(String(v))}
                    formatter={(value) => [`${formatNumber(Number(value))} kg`, '']}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--chart-2)"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: 'var(--chart-2)' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </section>
      )}

      {/* ---------- Verlauf ---------- */}
      <section className="mt-8">
        <SectionTitle>Verlauf</SectionTitle>

        {state.loading ? (
          <SkeletonList rows={3} height="h-14" />
        ) : state.error ? (
          <ErrorState
            message="Deine Check-ins konnten nicht geladen werden."
            onRetry={state.reload}
            retrying={state.reloading}
          />
        ) : (state.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<IconCheckin />}
            title="Noch keine Check-ins"
            description="Trage oben deinen ersten Wochen-Check-in ein."
          />
        ) : (
          <ul className="stagger flex flex-col gap-2.5">
            {state.data!.map((c) => (
              <li key={c.id}>
                <DataRow
                  primary={formatDate(c.checkin_date)}
                  secondary={
                    [
                      c.bodyweight !== null && `${formatNumber(Number(c.bodyweight))} kg`,
                      c.sleep_hours !== null && `${formatNumber(Number(c.sleep_hours))} h Schlaf`,
                      c.week_rating !== null && `Bewertung ${c.week_rating}/5`,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'
                  }
                  action={
                    <IconButton
                      label={`Check-in vom ${formatDate(c.checkin_date)} löschen`}
                      variant="quiet"
                      onClick={() => {
                        setDeleteError(null)
                        setToDelete(c)
                      }}
                    >
                      <IconTrash />
                    </IconButton>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        error={deleteError}
        title={`Check-in vom ${toDelete ? formatDate(toDelete.checkin_date) : ''} löschen?`}
        description="Der Eintrag verschwindet aus dem Verlauf und aus dem Gewichtsdiagramm."
      />
    </>
  )
}
