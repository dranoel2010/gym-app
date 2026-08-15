/**
 * Paginierung (Spec §3.5).
 *
 * PostgREST liefert standardmaessig hoechstens 1000 Zeilen. Jede Abfrage, die
 * unbegrenzt viele Zeilen zurueckgeben kann, muss seitenweise geholt werden —
 * sonst wird das Ergebnis ab 1000 Zeilen STILL unvollstaendig. Genau das ist in
 * v1 bei Backup-Export und Statistik passiert.
 */

const PAGE_SIZE = 1000

export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1)
    if (error) throw error
    out.push(...(data ?? []))
    // Eine kuerzere Seite als angefordert bedeutet: das war die letzte.
    if (!data || data.length < PAGE_SIZE) return out
  }
}

/** Teilt eine Liste in Bloecke — fuer Upserts beim Backup-Import. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
