/** Datei-Downloads im Browser. */

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Erst freigeben, wenn der Download angestossen ist — sofortiges revoke
  // bricht ihn in Safari ab.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Bereinigt einen Dateinamen um die Zeichen, die Windows und macOS nicht
 * erlauben: \ / : * ? " < > |
 */
export function sanitizeFilename(name: string, fallback: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || fallback
}
