import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { downloadBlob } from '@/lib/download'
import {
  BackupError,
  createBackup,
  inspectBackup,
  restoreBackup,
  type InspectedBackup,
} from '@/lib/backup'
import { BACKUP_TABLES, type BackupTable } from '@/lib/database.types'
import { PageHeader } from '@/components/Layout'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Card, Eyebrow, SectionTitle } from '@/components/ui/Display'
import { IconAlert, IconDownload, IconFile, IconUpload } from '@/components/ui/Icons'

const TABLE_LABELS: Record<BackupTable, string> = {
  plans: 'Pläne',
  plan_exercises: 'Plan-Übungen',
  workouts: 'Trainings',
  workout_sets: 'Sätze',
  weekly_checkins: 'Check-ins',
  measurements: 'Messungen',
  progress_photos: 'Fotos',
}

/** Daten & Backup — `/daten` (Spec §4.13). */
export default function Data() {
  const { user } = useAuth()
  const fileInput = useRef<HTMLInputElement>(null)

  const [exporting, setExporting] = useState(false)
  const [exportStep, setExportStep] = useState('')

  const [inspected, setInspected] = useState<InspectedBackup | null>(null)
  const [inspectError, setInspectError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreStep, setRestoreStep] = useState('')

  /* ---------------- Export ---------------- */

  const runExport = async () => {
    setExporting(true)
    setExportStep('Wird vorbereitet …')
    try {
      const result = await createBackup(user!.id, setExportStep)
      downloadBlob(result.filename, result.blob)

      toast.success(
        `Backup erstellt — ${result.rowCount} Einträge, ${result.photoCount} Fotos.`
      )
      if (result.missingPhotos > 0) {
        toast.warning(
          `${result.missingPhotos} Fotos im Speicher nicht gefunden – übersprungen.`
        )
      }
    } catch (error) {
      console.error('[gym-tracker] Backup fehlgeschlagen:', error)
      toast.error('Das Backup konnte nicht erstellt werden.')
    } finally {
      setExporting(false)
      setExportStep('')
    }
  }

  /* ---------------- Import: Schritt 1, prüfen ---------------- */

  const pickFile = async (file: File | null) => {
    if (!file) return
    setInspectError(null)
    try {
      // Prüfen, ohne zu schreiben (Spec §4.13, Schritt 1).
      const result = await inspectBackup(file, user!.id)
      setInspected(result)
    } catch (error) {
      if (error instanceof BackupError) {
        setInspectError(error.message)
      } else {
        console.error('[gym-tracker] Backup-Prüfung fehlgeschlagen:', error)
        setInspectError('Die Datei konnte nicht gelesen werden.')
      }
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  /* ---------------- Import: Schritt 3, wiederherstellen ---------------- */

  const runRestore = async () => {
    if (!inspected) return
    setRestoring(true)
    setRestoreStep('Wird vorbereitet …')
    try {
      const result = await restoreBackup(inspected, user!.id, setRestoreStep)
      toast.success(
        `Wiederhergestellt: ${result.plans} Pläne, ${result.workouts} Trainings, ${result.photos} Fotos.`
      )
      for (const warning of result.warnings) toast.warning(warning)
      setInspected(null)
    } catch (error) {
      console.error('[gym-tracker] Wiederherstellen fehlgeschlagen:', error)
      toast.error('Die Wiederherstellung ist fehlgeschlagen.')
    } finally {
      setRestoring(false)
      setRestoreStep('')
    }
  }

  return (
    <>
      <PageHeader
        title="Daten"
        description="Vollständiges Backup aller Daten inklusive Fotodateien — als ZIP zum Mitnehmen."
      />

      {/* ---------- Export ---------- */}
      <section>
        <SectionTitle>Backup erstellen</SectionTitle>
        <Card className="p-5">
          <Eyebrow tone="muted">Enthält</Eyebrow>
          <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {BACKUP_TABLES.map((t) => (
              <li key={t} className="flex items-center gap-2 text-[13.5px] font-semibold text-muted">
                <span className="size-1.5 rounded-full bg-accent" />
                {TABLE_LABELS[t]}
              </li>
            ))}
          </ul>

          <p className="mt-4 text-[13px] leading-relaxed text-subtle">
            Die Bilddateien liegen im selben Archiv. Nichts wird ausgelassen — auch bei mehreren
            tausend Sätzen.
          </p>

          <Button
            size="lg"
            block
            className="mt-4"
            loading={exporting}
            onClick={() => void runExport()}
            icon={<IconDownload />}
          >
            {exporting ? exportStep || 'Backup wird erstellt …' : 'Backup herunterladen'}
          </Button>
        </Card>
      </section>

      {/* ---------- Import ---------- */}
      <section className="mt-8">
        <SectionTitle>Backup einspielen</SectionTitle>
        <Card className="p-5">
          <p className="text-[13.5px] leading-relaxed text-muted">
            Wiederherstellen ist rein additiv: Es wird nichts gelöscht, was nicht im Backup steht.
            Einträge mit gleicher ID werden überschrieben.
          </p>

          <input
            ref={fileInput}
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            onChange={(e) => void pickFile(e.target.files?.[0] ?? null)}
          />

          <Button
            variant="secondary"
            size="lg"
            block
            className="mt-4"
            onClick={() => fileInput.current?.click()}
            icon={<IconFile />}
          >
            ZIP-Datei wählen
          </Button>

          {inspectError && (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-[14px] border border-[var(--danger)]/40 bg-[var(--danger-soft)] px-3.5 py-3 text-[14px] leading-snug font-bold text-danger"
            >
              <IconAlert className="mt-0.5 shrink-0 text-[16px]" />
              {inspectError}
            </p>
          )}
        </Card>
      </section>

      {/* ---------- Schritt 2: Bestätigung ---------- */}
      <Dialog
        open={inspected !== null}
        onClose={() => setInspected(null)}
        // Während der Wiederherstellung ist der Dialog nicht schließbar.
        dismissable={!restoring}
        title="Backup wiederherstellen?"
        description="Bestehende Einträge mit gleicher ID werden überschrieben."
        footer={
          <>
            <Button variant="secondary" onClick={() => setInspected(null)} disabled={restoring}>
              Abbrechen
            </Button>
            <Button onClick={() => void runRestore()} loading={restoring} icon={<IconUpload />}>
              {restoring ? restoreStep || 'Wird eingespielt …' : 'Wiederherstellen'}
            </Button>
          </>
        }
      >
        {inspected && (
          <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-[14px] border border-line">
            {BACKUP_TABLES.map((t) => (
              <li key={t} className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-[14px] font-semibold text-muted">{TABLE_LABELS[t]}</span>
                <span className="tnum text-[14px] font-extrabold">{inspected.counts[t]}</span>
              </li>
            ))}
            <li className="flex items-center justify-between bg-surface-2 px-3.5 py-2.5">
              <span className="text-[14px] font-semibold text-muted">Bilddateien im Archiv</span>
              <span className="tnum text-[14px] font-extrabold">{inspected.photoCount}</span>
            </li>
          </ul>
        )}
      </Dialog>
    </>
  )
}
