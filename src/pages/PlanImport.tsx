import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { humanizeDbError } from '@/lib/errors'
import { formatNumber } from '@/lib/formulas'
import { IMPORT_PLACEHOLDER, parsePlan } from '@/lib/parsePlan'
import { invalidateExerciseNames } from '@/hooks/useExerciseNames'
import { PageHeader } from '@/components/Layout'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Display'
import { IconAlert, IconChevronLeft, IconFile, IconUpload } from '@/components/ui/Icons'

/** Planimport — `/plans/import` (Spec §4.8). */
export default function PlanImport() {
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Vorschau wird bei jeder Aenderung neu berechnet.
  const result = useMemo(() => parsePlan(text), [text])
  const count = result.exercises.length

  const onPickFile = async (file: File | null) => {
    if (!file) return
    try {
      const content = await file.text()
      setText(content)

      // Ist der Plan-Name noch leer, wird der Dateiname ohne Endung eingesetzt.
      // Damit ist Export -> Import namenserhaltend.
      if (!name.trim()) {
        setName(file.name.replace(/\.[^.]+$/, ''))
      }
    } catch (error) {
      console.error('[gym-tracker] Datei konnte nicht gelesen werden:', error)
      toast.error('Die Datei konnte nicht gelesen werden.')
    } finally {
      // Zuruecksetzen, damit dieselbe Datei erneut waehlbar ist.
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const onImport = async () => {
    setNameError(null)
    setSaveError(null)

    if (!name.trim()) {
      setNameError('Plan-Name ist erforderlich')
      return
    }
    if (count === 0) return

    setSaving(true)
    try {
      // Dieselbe transaktionale Funktion wie im Planeditor (Spec §4.7).
      const { error } = await supabase.rpc('save_plan', {
        p_plan_id: null,
        p_name: name.trim(),
        p_exercises: result.exercises,
      })
      if (error) throw error

      invalidateExerciseNames()
      toast.success(`„${name.trim()}" mit ${count} ${count === 1 ? 'Übung' : 'Übungen'} angelegt.`)
      navigate('/plans')
    } catch (error) {
      console.error('[gym-tracker] Import fehlgeschlagen:', error)
      setSaveError(humanizeDbError(error, 'Der Plan konnte nicht gespeichert werden.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Link
        to="/plans"
        className="mb-3 -ml-1 inline-flex items-center gap-1 text-[14px] font-medium text-muted transition-colors hover:text-fg"
      >
        <IconChevronLeft className="text-[16px]" />
        Pläne
      </Link>

      <PageHeader
        title="Plan importieren"
        description="Text einfügen oder Datei wählen. Erkannt werden Freitext („Bankdrücken 3x10 @60“), CSV, TSV und JSON."
      />

      <div className="flex flex-col gap-5">
        <Field label="Plan-Name" error={nameError ?? undefined}>
          {({ id, invalid }) => (
            <Input
              id={id}
              invalid={invalid}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Push Day A"
              autoComplete="off"
            />
          )}
        </Field>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-semibold text-muted">Übungen</span>
            <Button
              variant="ghost"
              size="sm"
              icon={<IconFile />}
              onClick={() => fileInput.current?.click()}
            >
              Datei wählen
            </Button>
          </div>

          <input
            ref={fileInput}
            type="file"
            accept=".txt,.csv,.tsv,.json"
            className="sr-only"
            onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
          />

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={IMPORT_PLACEHOLDER}
            rows={9}
            className="font-mono text-[14px] leading-relaxed"
            spellCheck={false}
          />
        </div>

        {/* ---------- Live-Vorschau ---------- */}
        <section>
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <h2 className="text-[13px] font-semibold tracking-[0.08em] text-subtle uppercase">
              Vorschau
            </h2>
            {count > 0 && (
              <Badge tone="accent">
                {count} {count === 1 ? 'Übung' : 'Übungen'} erkannt
              </Badge>
            )}
          </div>

          {result.error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] px-3.5 py-3 text-[14px] leading-snug font-medium text-danger"
            >
              <IconAlert className="mt-0.5 shrink-0 text-[16px]" />
              {result.error}
            </p>
          ) : count === 0 ? (
            <p className="rounded-[var(--radius-md)] border border-dashed border-line px-4 py-6 text-center text-[13.5px] text-subtle">
              Noch nichts eingefügt.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
              {result.exercises.map((ex, i) => (
                <li key={`${ex.exercise_name}-${i}`} className="flex items-center gap-3 px-3.5 py-2.5">
                  <span className="tnum w-6 shrink-0 text-[12px] font-semibold text-subtle">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                    {ex.exercise_name}
                  </span>
                  <span className="tnum shrink-0 text-[13px] text-muted">
                    {ex.target_sets} × {ex.target_reps}
                    {ex.target_weight > 0 && ` @ ${formatNumber(ex.target_weight)} kg`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {saveError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] px-3.5 py-3 text-[14px] leading-snug font-medium text-danger"
          >
            <IconAlert className="mt-0.5 shrink-0 text-[16px]" />
            {saveError}
          </p>
        )}

        <div className="glass sticky bottom-[calc(64px+env(safe-area-inset-bottom))] -mx-4 border-t border-line px-4 py-3 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <Button
            size="lg"
            block
            icon={<IconUpload />}
            loading={saving}
            // Gesperrt, solange 0 Uebungen erkannt sind (Spec §4.8).
            disabled={count === 0}
            onClick={() => void onImport()}
          >
            {count === 0
              ? 'Keine Übungen erkannt'
              : `${count} ${count === 1 ? 'Übung' : 'Übungen'} importieren`}
          </Button>
        </div>
      </div>
    </>
  )
}
