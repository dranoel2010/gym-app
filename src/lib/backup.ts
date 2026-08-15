import JSZip from 'jszip'
import { PHOTO_BUCKET, supabase } from './supabase'
import { chunk, fetchAll } from './fetchAll'
import { localDateStr } from './date'
import { contentTypeFromPath } from './image'
import { BACKUP_TABLES, type BackupTable } from './database.types'

/**
 * Vollständiges Backup (Spec §4.13).
 *
 * Aufbau des Archivs:
 *   backup.json              ← Manifest
 *   photos/<storage_path>    ← Originalbytes
 *
 * Zwei Dinge sind hier entscheidend:
 *
 * 1. ALLE Abfragen laufen über `fetchAll`. Ohne Paginierung enthielte ein
 *    Backup ab 1000 Sätzen still nur die ersten 1000 — das war in v1 der Fall
 *    und ist der gefährlichste Fehler überhaupt: ein Backup, das aussieht wie
 *    eines, aber Daten verliert (Spec §4.13 AK).
 * 2. Der Dateiname nutzt das LOKALE Datum. In v1 war es UTC, abends hieß das
 *    Backup dadurch "von morgen".
 */

export interface BackupManifest {
  app: 'gym-tracker'
  version: 1
  exported_at: string
  user_id: string
  data: Record<BackupTable, Record<string, unknown>[]>
  photos: Array<{ storage_path: string; file: string }>
}

export interface ExportResult {
  blob: Blob
  filename: string
  rowCount: number
  photoCount: number
  missingPhotos: number
}

/* ==========================================================================
   Export
   ========================================================================== */

/** Filter je Tabelle — Zeilen anderer Nutzer dürfen gar nicht erst mitkommen. */
function scopedSelect(table: BackupTable, userId: string, planIds: string[], workoutIds: string[]) {
  return (from: number, to: number) => {
    const q = supabase.from(table).select('*').range(from, to)
    switch (table) {
      case 'plan_exercises':
        return q.in('plan_id', planIds.length > 0 ? planIds : ['00000000-0000-0000-0000-000000000000'])
      case 'workout_sets':
        return q.in(
          'workout_id',
          workoutIds.length > 0 ? workoutIds : ['00000000-0000-0000-0000-000000000000']
        )
      default:
        return q.eq('user_id', userId)
    }
  }
}

export async function createBackup(
  userId: string,
  onProgress?: (label: string) => void
): Promise<ExportResult> {
  onProgress?.('Daten werden gelesen …')

  const plans = await fetchAll<{ id: string }>((f, t) =>
    supabase.from('plans').select('*').eq('user_id', userId).range(f, t)
  )
  const workouts = await fetchAll<{ id: string }>((f, t) =>
    supabase.from('workouts').select('*').eq('user_id', userId).range(f, t)
  )

  const planIds = plans.map((p) => p.id)
  const workoutIds = workouts.map((w) => w.id)

  const data = {} as Record<BackupTable, Record<string, unknown>[]>
  data.plans = plans as Record<string, unknown>[]
  data.workouts = workouts as Record<string, unknown>[]

  for (const table of BACKUP_TABLES) {
    if (table === 'plans' || table === 'workouts') continue
    onProgress?.(`Daten werden gelesen … (${table})`)
    data[table] = await fetchAll<Record<string, unknown>>(
      scopedSelect(table, userId, planIds, workoutIds)
    )
  }

  const rowCount = BACKUP_TABLES.reduce((sum, t) => sum + data[t].length, 0)

  /* ---------------- Fotodateien ---------------- */

  const zip = new JSZip()
  const photoMeta: BackupManifest['photos'] = []
  let missingPhotos = 0

  const photoRows = data.progress_photos as Array<{ storage_path: string }>
  for (let i = 0; i < photoRows.length; i++) {
    const path = photoRows[i].storage_path
    onProgress?.(`Fotos werden gepackt … (${i + 1}/${photoRows.length})`)
    const { data: file, error } = await supabase.storage.from(PHOTO_BUCKET).download(path)
    if (error || !file) {
      // Eine fehlende Datei bricht das Backup NICHT ab — sie wird gezählt und
      // am Ende gemeldet.
      console.warn('[gym-tracker] Foto nicht gefunden, übersprungen:', path, error)
      missingPhotos++
      continue
    }
    zip.file(`photos/${path}`, file)
    photoMeta.push({ storage_path: path, file: `photos/${path}` })
  }

  const manifest: BackupManifest = {
    app: 'gym-tracker',
    version: 1,
    exported_at: new Date().toISOString(),
    user_id: userId,
    data,
    photos: photoMeta,
  }

  zip.file('backup.json', JSON.stringify(manifest, null, 2))

  onProgress?.('Archiv wird erzeugt …')
  const blob = await zip.generateAsync({
    type: 'blob',
    // Stufe 0 ("store"): Fotos sind bereits komprimiert, echte Kompression
    // kostet nur Zeit.
    compression: 'STORE',
  })

  return {
    blob,
    filename: `gym-tracker-backup-${localDateStr()}.zip`,
    rowCount,
    photoCount: photoMeta.length,
    missingPhotos,
  }
}

/* ==========================================================================
   Import — Schritt 1: prüfen, ohne zu schreiben
   ========================================================================== */

export interface InspectedBackup {
  zip: JSZip
  manifest: BackupManifest
  counts: Record<BackupTable, number>
  photoCount: number
}

export class BackupError extends Error {}

export async function inspectBackup(file: File, userId: string): Promise<InspectedBackup> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    throw new BackupError('Die Datei ist kein gültiges ZIP-Backup.')
  }

  const entry = zip.file('backup.json')
  if (!entry) {
    throw new BackupError('backup.json fehlt im Archiv — kein gültiges Backup.')
  }

  let manifest: BackupManifest
  try {
    manifest = JSON.parse(await entry.async('string')) as BackupManifest
  } catch {
    throw new BackupError('backup.json ist beschädigt.')
  }

  if (manifest?.app !== 'gym-tracker' || manifest?.version !== 1) {
    throw new BackupError('Unbekanntes Backup-Format.')
  }

  const data = (manifest.data ?? {}) as Partial<Record<BackupTable, unknown>>
  const counts = {} as Record<BackupTable, number>
  for (const table of BACKUP_TABLES) {
    const rows = data[table]
    // Fehlende Datenfelder gelten als leeres Array, nicht als Fehler.
    if (rows === undefined || rows === null) {
      counts[table] = 0
      continue
    }
    if (!Array.isArray(rows)) throw new BackupError('Unbekanntes Backup-Format.')
    counts[table] = rows.length
  }

  if (manifest.user_id && manifest.user_id !== userId) {
    throw new BackupError('Dieses Backup gehört zu einem anderen Konto.')
  }

  return { zip, manifest, counts, photoCount: (manifest.photos ?? []).length }
}

/* ==========================================================================
   Import — Schritt 3: wiederherstellen
   ========================================================================== */

export interface RestoreResult {
  plans: number
  workouts: number
  photos: number
  warnings: string[]
}

const CHUNK = 500

function rowsOf(manifest: BackupManifest, table: BackupTable): Record<string, unknown>[] {
  const rows = manifest.data?.[table]
  return Array.isArray(rows) ? rows : []
}

/**
 * Check-ins sind ein Sonderfall.
 *
 * Ein Konflikt auf UNIQUE(user_id, checkin_date) lässt sich mit
 * `onConflict: 'id'` nicht auflösen: die ID ist neu, das Datum kollidiert.
 * Deshalb bei Fehlschlag des Blocks zeilenweise erneut versuchen und
 * kollidierende Zeilen per DATUM aktualisieren, statt sie zu überspringen.
 */
async function restoreCheckins(rows: Record<string, unknown>[], userId: string): Promise<string[]> {
  const warnings: string[] = []
  if (rows.length === 0) return warnings

  for (const block of chunk(rows, CHUNK)) {
    const scoped: Record<string, unknown>[] = block.map((r) => ({ ...r, user_id: userId }))
    const { error } = await supabase.from('weekly_checkins').upsert(scoped, { onConflict: 'id' })
    if (!error) continue

    console.warn('[gym-tracker] Check-in-Block fehlgeschlagen, zeilenweise:', error)
    let failed = 0
    for (const row of scoped) {
      const { error: rowError } = await supabase
        .from('weekly_checkins')
        .upsert(row, { onConflict: 'id' })
      if (!rowError) continue

      // Datumskollision: bestehenden Eintrag dieses Tages aktualisieren.
      const { error: updateError } = await supabase
        .from('weekly_checkins')
        .update({
          bodyweight: row.bodyweight ?? null,
          sleep_hours: row.sleep_hours ?? null,
          week_rating: row.week_rating ?? null,
        })
        .eq('user_id', userId)
        .eq('checkin_date', row.checkin_date as string)

      if (updateError) {
        console.error('[gym-tracker] Check-in unlösbar:', row, updateError)
        failed++
      }
    }
    if (failed > 0) {
      warnings.push(`${failed} Check-ins konnten nicht wiederhergestellt werden.`)
    }
  }

  return warnings
}

async function upsertTable(
  table: BackupTable,
  rows: Record<string, unknown>[],
  transform?: (row: Record<string, unknown>) => Record<string, unknown>
): Promise<string[]> {
  const warnings: string[] = []
  if (rows.length === 0) return warnings

  for (const block of chunk(rows, CHUNK)) {
    const payload = transform ? block.map(transform) : block
    const { error } = await supabase.from(table).upsert(payload, { onConflict: 'id' })
    if (error) {
      console.error(`[gym-tracker] Wiederherstellen von ${table} fehlgeschlagen:`, error)
      warnings.push(`${block.length} Einträge in ${table} konnten nicht geschrieben werden.`)
    }
  }
  return warnings
}

export async function restoreBackup(
  inspected: InspectedBackup,
  userId: string,
  onProgress?: (label: string) => void
): Promise<RestoreResult> {
  const { zip, manifest } = inspected
  const warnings: string[] = []

  // Reihenfolge nach Abhängigkeiten (Spec §4.13). Wiederherstellen ist rein
  // additiv: es wird nichts gelöscht, was nicht im Backup steht.
  onProgress?.('Pläne …')
  warnings.push(...(await upsertTable('plans', rowsOf(manifest, 'plans'), (r) => ({ ...r, user_id: userId }))))

  onProgress?.('Plan-Übungen …')
  warnings.push(...(await upsertTable('plan_exercises', rowsOf(manifest, 'plan_exercises'))))

  onProgress?.('Trainings …')
  warnings.push(
    ...(await upsertTable('workouts', rowsOf(manifest, 'workouts'), (r) => ({ ...r, user_id: userId })))
  )

  onProgress?.('Sätze …')
  warnings.push(...(await upsertTable('workout_sets', rowsOf(manifest, 'workout_sets'))))

  onProgress?.('Check-ins …')
  warnings.push(...(await restoreCheckins(rowsOf(manifest, 'weekly_checkins'), userId)))

  onProgress?.('Maße …')
  warnings.push(
    ...(await upsertTable('measurements', rowsOf(manifest, 'measurements'), (r) => ({
      ...r,
      user_id: userId,
    })))
  )

  /* ---------------- Fotos ---------------- */

  const photoList = manifest.photos ?? []
  const arrived = new Set<string>()
  let failedUploads = 0

  for (let i = 0; i < photoList.length; i++) {
    const { storage_path: path, file } = photoList[i]
    onProgress?.(`Fotos … (${i + 1}/${photoList.length})`)

    const entry = zip.file(file) ?? zip.file(`photos/${path}`)
    if (!entry) {
      failedUploads++
      continue
    }

    const blob = await entry.async('blob')
    const contentType = contentTypeFromPath(path)

    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, blob, { contentType, upsert: true })

    if (error) {
      // Fehlt die UPDATE-Policy auf dem Bucket, scheitert `upsert: true`.
      // Dann: Datei löschen und ohne upsert erneut hochladen.
      await supabase.storage.from(PHOTO_BUCKET).remove([path])
      const { error: retryError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, blob, { contentType, upsert: false })
      if (retryError) {
        console.error('[gym-tracker] Foto-Upload fehlgeschlagen:', path, retryError)
        failedUploads++
        continue
      }
    }
    arrived.add(path)
  }

  // Metadatenzeilen NUR für Dateien, die tatsächlich angekommen sind — sonst
  // zeigt die Galerie auf nicht vorhandene Bilder.
  const photoRows = rowsOf(manifest, 'progress_photos').filter((r) =>
    arrived.has(String(r.storage_path))
  )
  onProgress?.('Foto-Metadaten …')
  warnings.push(...(await upsertTable('progress_photos', photoRows, (r) => ({ ...r, user_id: userId }))))

  if (failedUploads > 0) {
    warnings.push(`${failedUploads} Fotos konnten nicht wiederhergestellt werden.`)
  }

  return {
    plans: rowsOf(manifest, 'plans').length,
    workouts: rowsOf(manifest, 'workouts').length,
    photos: photoRows.length,
    warnings,
  }
}
