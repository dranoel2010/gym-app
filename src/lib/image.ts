/**
 * Bildverarbeitung fuer Fortschrittsfotos (Spec §4.12).
 *
 * In v1 landeten 12-Megapixel-Originale ungefiltert im Speicher und blaehten
 * jedes Backup auf. Hier wird vor dem Upload verkleinert.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB
export const MAX_EDGE_PX = 1600
export const JPEG_QUALITY = 0.85

export interface PreparedImage {
  blob: Blob
  ext: string
  contentType: string
}

/** MIME-Typ aus der Dateiendung — fuer den Restore aus dem Backup. */
export function contentTypeFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'heic':
      return 'image/heic'
    case 'heif':
      return 'image/heif'
    default:
      return 'image/jpeg'
  }
}

function loadBitmap(file: File): Promise<{ width: number; height: number; draw: CanvasImageSource }> {
  // createImageBitmap ist deutlich schneller und blockiert den Hauptthread
  // nicht — aber Safari kann damit lange kein HEIC. Deshalb mit Rueckfall.
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file)
      .then((bmp) => ({ width: bmp.width, height: bmp.height, draw: bmp }))
      .catch(() => loadViaImgElement(file))
  }
  return loadViaImgElement(file)
}

function loadViaImgElement(
  file: File
): Promise<{ width: number; height: number; draw: CanvasImageSource }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight, draw: img })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Bild konnte nicht gelesen werden.'))
    }
    img.src = url
  })
}

/**
 * Prueft und verkleinert ein Foto.
 *
 * Wirft mit einer bereits nutzertauglichen deutschen Meldung — der Aufrufer
 * kann `error.message` direkt in einen Toast geben.
 */
export async function prepareUpload(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Nur Bilddateien sind erlaubt.')
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Bild ist zu groß (max. 10 MB).')
  }

  let source: { width: number; height: number; draw: CanvasImageSource }
  try {
    source = await loadBitmap(file)
  } catch {
    throw new Error('Bild konnte nicht gelesen werden.')
  }

  const { width, height, draw } = source
  const longest = Math.max(width, height)
  const scale = longest > MAX_EDGE_PX ? MAX_EDGE_PX / longest : 1
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Bild konnte nicht verarbeitet werden.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(draw, 0, 0, w, h)

  if ('close' in draw && typeof (draw as ImageBitmap).close === 'function') {
    ;(draw as ImageBitmap).close()
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
  )
  if (!blob) throw new Error('Bild konnte nicht verarbeitet werden.')

  return { blob, ext: 'jpg', contentType: 'image/jpeg' }
}
