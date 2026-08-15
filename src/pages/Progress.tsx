import { useEffect, useMemo, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { PHOTO_BUCKET, supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useAsyncData } from '@/hooks/useAsyncData'
import { humanizeDbError } from '@/lib/errors'
import { formatDate, todayStr } from '@/lib/date'
import { formatNumber } from '@/lib/formulas'
import { prepareUpload } from '@/lib/image'
import { POSE_LABELS, POSE_ORDER, type Measurement, type Pose, type ProgressPhoto } from '@/lib/database.types'
import { PageHeader } from '@/components/Layout'
import { Button, IconButton } from '@/components/ui/Button'
import { Field, Input, NumberField } from '@/components/ui/Field'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { Card, DataRow, SectionTitle } from '@/components/ui/Display'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/States'
import { IconCamera, IconRuler, IconTrash } from '@/components/ui/Icons'

/* -------------------------------------------------------------------------- */

const num = (v: string) => parseFloat((v ?? '').replace(',', '.'))
const isSet = (v: string) => (v ?? '').trim() !== ''

const MEASURE_FIELDS = [
  { name: 'upper_arm', label: 'Oberarm (angesp.)' },
  { name: 'chest', label: 'Brust' },
  { name: 'thigh', label: 'Oberschenkel' },
  { name: 'waist', label: 'Taille' },
] as const

type MeasureField = (typeof MEASURE_FIELDS)[number]['name']

const schema = z
  .object({
    measured_at: z.string().min(1, 'Datum ist erforderlich'),
    upper_arm: z.string(),
    chest: z.string(),
    thigh: z.string(),
    waist: z.string(),
  })
  .superRefine((val, ctx) => {
    if (val.measured_at > todayStr()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['measured_at'],
        message: 'Kein Datum in der Zukunft',
      })
    }

    const anySet = MEASURE_FIELDS.some((f) => isSet(val[f.name]))
    if (!anySet) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['upper_arm'],
        message: 'Bitte mindestens ein Maß eintragen.',
      })
    }

    for (const f of MEASURE_FIELDS) {
      const raw = val[f.name]
      if (!isSet(raw)) continue
      const n = num(raw)
      if (!Number.isFinite(n) || n < 10 || n > 300) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [f.name],
          message: 'Wert muss zwischen 10 und 300 cm liegen',
        })
      }
    }
  })

type Values = z.infer<typeof schema>

/* -------------------------------------------------------------------------- */

/** Fortschritt — `/progress` (Spec §4.12). */
export default function Progress() {
  return (
    <>
      <PageHeader
        title="Fortschritt"
        description="Körpermaße und Fotos etwa alle vier Wochen — häufiger zeigt nur Rauschen."
      />
      <Measurements />
      <Photos />
    </>
  )
}

/* ==========================================================================
   Maße
   ========================================================================== */

function Measurements() {
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState<Measurement | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const state = useAsyncData<Measurement[]>(async () => {
    const { data, error } = await supabase
      .from('measurements')
      .select('*')
      .eq('user_id', user!.id)
      .order('measured_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as Measurement[]
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
    defaultValues: { measured_at: todayStr(), upper_arm: '', chest: '', thigh: '', waist: '' },
  })

  const chosenDate = watch('measured_at')
  const existing = useMemo(
    () => (state.data ?? []).find((m) => m.measured_at === chosenDate) ?? null,
    [state.data, chosenDate]
  )

  useEffect(() => {
    if (!existing) return
    for (const f of MEASURE_FIELDS) {
      const value = existing[f.name]
      setValue(f.name, value === null ? '' : formatNumber(Number(value)))
    }
  }, [existing, setValue])

  const onSubmit = async (values: Values) => {
    setSaving(true)
    try {
      // Upsert auf (user_id, measured_at) — ein Eintrag pro Tag.
      // (v1 machte ein reines Insert, Dubletten waren möglich.)
      const payload: Record<string, unknown> = {
        user_id: user!.id,
        measured_at: values.measured_at,
      }
      for (const f of MEASURE_FIELDS) {
        payload[f.name] = isSet(values[f.name]) ? num(values[f.name]) : null
      }

      const { error } = await supabase
        .from('measurements')
        .upsert(payload, { onConflict: 'user_id,measured_at' })
      if (error) throw error

      toast.success(existing ? 'Maße aktualisiert.' : 'Maße gespeichert.')
      state.reload()
      reset({ measured_at: todayStr(), upper_arm: '', chest: '', thigh: '', waist: '' })
    } catch (error) {
      console.error('[gym-tracker] Maße speichern fehlgeschlagen:', error)
      toast.error(humanizeDbError(error, 'Die Maße konnten nicht gespeichert werden.'))
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const { error } = await supabase.from('measurements').delete().eq('id', toDelete.id)
      if (error) throw error
      state.setData((prev) => (prev ?? []).filter((m) => m.id !== toDelete.id))
      toast.success('Messung gelöscht.')
      setToDelete(null)
    } catch (error) {
      console.error('[gym-tracker] Messung löschen fehlgeschlagen:', error)
      setDeleteError(humanizeDbError(error, 'Die Messung konnte nicht gelöscht werden.'))
    } finally {
      setDeleting(false)
    }
  }

  const summarize = (m: Measurement) =>
    MEASURE_FIELDS.map((f) =>
      m[f.name] === null ? null : `${f.label.split(' ')[0]} ${formatNumber(Number(m[f.name]))}`
    )
      .filter(Boolean)
      .join(' · ') || '—'

  return (
    <section className="mt-2">
      <SectionTitle>Maße in cm</SectionTitle>

      <Card className="p-5">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Field label="Datum" error={errors.measured_at?.message}>
            {({ id, invalid }) => (
              <Input
                id={id}
                invalid={invalid}
                type="date"
                max={todayStr()}
                {...register('measured_at')}
              />
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            {MEASURE_FIELDS.map((f) => (
              <Field key={f.name} label={f.label} error={errors[f.name]?.message}>
                {({ invalid }) => (
                  <Controller
                    control={control}
                    name={f.name as MeasureField}
                    render={({ field }) => (
                      <NumberField
                        value={field.value}
                        onValueChange={field.onChange}
                        step={0.1}
                        min={10}
                        max={300}
                        decimal
                        invalid={invalid}
                        placeholder="—"
                        aria-label={`${f.label} in Zentimeter`}
                      />
                    )}
                  />
                )}
              </Field>
            ))}
          </div>

          <Button type="submit" size="lg" block loading={saving}>
            {saving ? 'Wird gespeichert …' : existing ? 'Maße überschreiben' : 'Maße speichern'}
          </Button>
        </form>
      </Card>

      <div className="mt-4">
        {state.loading ? (
          <SkeletonList rows={2} height="h-14" />
        ) : state.error ? (
          <ErrorState
            message="Deine Maße konnten nicht geladen werden."
            onRetry={state.reload}
            retrying={state.reloading}
          />
        ) : (state.data?.length ?? 0) === 0 ? (
          <EmptyState icon={<IconRuler />} title="Noch keine Maße erfasst" />
        ) : (
          <ul className="stagger flex flex-col gap-2.5">
            {state.data!.map((m) => (
              <li key={m.id}>
                <DataRow
                  primary={formatDate(m.measured_at)}
                  secondary={summarize(m)}
                  action={
                    <IconButton
                      label={`Messung vom ${formatDate(m.measured_at)} löschen`}
                      variant="quiet"
                      onClick={() => {
                        setDeleteError(null)
                        setToDelete(m)
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
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        error={deleteError}
        title={`Messung vom ${toDelete ? formatDate(toDelete.measured_at) : ''} löschen?`}
        description="Der Eintrag wird dauerhaft entfernt."
      />
    </section>
  )
}

/* ==========================================================================
   Fotos
   ========================================================================== */

/** Signierte URLs laufen nach einer Stunde ab — vorher neu holen. */
const SIGNED_URL_TTL = 3600
const REFRESH_AFTER_MS = 55 * 60 * 1000

function Photos() {
  const { user } = useAuth()
  const [date, setDate] = useState(todayStr())
  const [uploading, setUploading] = useState<Pose | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [toDelete, setToDelete] = useState<ProgressPhoto | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const inputs = useRef<Partial<Record<Pose, HTMLInputElement | null>>>({})

  const state = useAsyncData<ProgressPhoto[]>(async () => {
    const { data, error } = await supabase
      .from('progress_photos')
      .select('*')
      .eq('user_id', user!.id)
      .order('photo_date', { ascending: false })
    if (error) throw error
    return (data ?? []) as ProgressPhoto[]
  }, [user!.id])

  const photos = state.data ?? []

  /* ---------------- Signierte URLs ---------------- */

  useEffect(() => {
    if (photos.length === 0) {
      // Wird das letzte Foto gelöscht, muss der Zwischenspeicher geleert werden —
      // sonst zeigt die Galerie tote Verweise (in v1 fehlerhaft).
      setUrls({})
      return
    }

    let active = true
    const paths = photos.map((p) => p.storage_path)

    const sign = async () => {
      const { data, error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrls(paths, SIGNED_URL_TTL)
      if (error) {
        console.error('[gym-tracker] Signierte URLs fehlgeschlagen:', error)
        return
      }
      if (!active) return
      const next: Record<string, string> = {}
      for (const entry of data ?? []) {
        if (entry.signedUrl && entry.path) next[entry.path] = entry.signedUrl
      }
      setUrls(next)
    }

    void sign()
    // Läuft die Stunde ab, während die Seite offen ist, werden sie erneuert.
    const timer = setInterval(() => void sign(), REFRESH_AFTER_MS)

    return () => {
      active = false
      clearInterval(timer)
    }
    // Nur die Pfadmenge ist relevant, nicht die Objektidentität.
  }, [photos.map((p) => p.storage_path).join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- Upload ---------------- */

  const upload = async (pose: Pose, file: File | null) => {
    if (!file) return
    setUploading(pose)

    let storagePath: string | null = null
    try {
      // 1./2. Prüfen und verkleinern (max. 1600 px, JPEG 0,85).
      const prepared = await prepareUpload(file)

      // 3. Hochladen unter <user_id>/<photo_date>/<pose>-<timestamp>.<ext>
      storagePath = `${user!.id}/${date}/${pose}-${Date.now()}.${prepared.ext}`
      const { error: upErr } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(storagePath, prepared.blob, { contentType: prepared.contentType, upsert: false })
      if (upErr) throw upErr

      // 4. Metadatenzeile schreiben
      const { data: row, error: metaErr } = await supabase
        .from('progress_photos')
        .insert({ user_id: user!.id, photo_date: date, pose, storage_path: storagePath })
        .select()
        .single()

      if (metaErr) {
        // 5. Rollback: sonst bleibt eine Dateileiche im Speicher zurück, die
        // niemand mehr sieht und die jedes Backup aufbläht.
        await supabase.storage.from(PHOTO_BUCKET).remove([storagePath])
        throw metaErr
      }

      state.setData((prev) => [row as ProgressPhoto, ...(prev ?? [])])
      toast.success(`Foto „${POSE_LABELS[pose]}" gespeichert.`)
    } catch (error) {
      console.error('[gym-tracker] Foto-Upload fehlgeschlagen:', error)
      const message =
        error instanceof Error && /max\. 10 MB|Bilddateien|gelesen|verarbeitet/.test(error.message)
          ? error.message
          : 'Foto konnte nicht gespeichert werden.'
      toast.error(message)
    } finally {
      setUploading(null)
      const input = inputs.current[pose]
      if (input) input.value = ''
    }
  }

  /* ---------------- Löschen ---------------- */

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      // Erst die Datei, dann die Metadatenzeile (Spec §4.12).
      const { error: storageErr } = await supabase.storage
        .from(PHOTO_BUCKET)
        .remove([toDelete.storage_path])
      if (storageErr) throw storageErr

      const { error } = await supabase.from('progress_photos').delete().eq('id', toDelete.id)
      if (error) throw error

      state.setData((prev) => (prev ?? []).filter((p) => p.id !== toDelete.id))
      toast.success('Foto gelöscht.')
      setToDelete(null)
    } catch (error) {
      console.error('[gym-tracker] Foto löschen fehlgeschlagen:', error)
      setDeleteError(humanizeDbError(error, 'Das Foto konnte nicht gelöscht werden.'))
    } finally {
      setDeleting(false)
    }
  }

  /* ---------------- Gruppierung ---------------- */

  const groups = useMemo(() => {
    const byDate = new Map<string, ProgressPhoto[]>()
    for (const p of photos) {
      const list = byDate.get(p.photo_date) ?? []
      list.push(p)
      byDate.set(p.photo_date, list)
    }
    return [...byDate.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, list]) => ({
        day,
        // Innerhalb einer Gruppe: Vorne → Seite → Rücken.
        photos: [...list].sort(
          (a, b) => POSE_ORDER.indexOf(a.pose) - POSE_ORDER.indexOf(b.pose)
        ),
      }))
  }, [photos])

  return (
    <section className="mt-10">
      <SectionTitle>Fotos</SectionTitle>

      <Card className="p-5">
        <Field label="Aufnahmedatum">
          {({ id }) => (
            <Input
              id={id}
              type="date"
              max={todayStr()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          )}
        </Field>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {POSE_ORDER.map((pose) => (
            <div key={pose}>
              <input
                ref={(el) => {
                  inputs.current[pose] = el
                }}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => void upload(pose, e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                disabled={uploading !== null}
                onClick={() => inputs.current[pose]?.click()}
                className="flex aspect-3/4 w-full flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-line-strong bg-surface-2 text-muted transition-colors duration-[var(--dur-fast)] hover:border-[var(--accent)] hover:text-fg disabled:opacity-50"
              >
                {uploading === pose ? (
                  <span className="animate-spin-slow inline-block size-6 rounded-full border-[2.5px] border-line-strong border-t-[var(--accent)]" />
                ) : (
                  <IconCamera className="text-[22px]" />
                )}
                <span className="text-[12.5px] font-extrabold">{POSE_LABELS[pose]}</span>
              </button>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[12px] text-subtle">
          Bilder werden vor dem Hochladen auf max. 1600 px verkleinert. Maximal 10 MB je Datei.
        </p>
      </Card>

      <div className="mt-5">
        {state.loading ? (
          <SkeletonList rows={1} height="h-40" />
        ) : state.error ? (
          <ErrorState
            message="Deine Fotos konnten nicht geladen werden."
            onRetry={state.reload}
            retrying={state.reloading}
          />
        ) : groups.length === 0 ? (
          <EmptyState icon={<IconCamera />} title="Noch keine Fotos hochgeladen." />
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <div key={group.day}>
                <p className="mb-2.5 text-[13px] font-extrabold text-muted">
                  {formatDate(group.day)}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {group.photos.map((photo) => (
                    <figure
                      key={photo.id}
                      className="group relative aspect-3/4 overflow-hidden rounded-[18px] border border-line bg-surface-2"
                    >
                      {urls[photo.storage_path] ? (
                        <img
                          src={urls[photo.storage_path]}
                          alt={`${POSE_LABELS[photo.pose]}, ${formatDate(photo.photo_date)}`}
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="skeleton size-full" />
                      )}

                      <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/75 to-transparent px-2.5 pt-6 pb-2">
                        <span className="text-[11px] font-extrabold text-white">
                          {POSE_LABELS[photo.pose]}
                        </span>
                        <button
                          type="button"
                          aria-label={`Foto ${POSE_LABELS[photo.pose]} vom ${formatDate(photo.photo_date)} löschen`}
                          onClick={() => {
                            setDeleteError(null)
                            setToDelete(photo)
                          }}
                          className="grid size-7 place-items-center rounded-full bg-black/50 text-[13px] text-white transition-colors hover:bg-[var(--danger)]"
                        >
                          <IconTrash />
                        </button>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        error={deleteError}
        title="Foto löschen?"
        description={
          toDelete
            ? `${POSE_LABELS[toDelete.pose]} vom ${formatDate(toDelete.photo_date)}. Die Bilddatei wird endgültig entfernt.`
            : undefined
        }
      />
    </section>
  )
}
