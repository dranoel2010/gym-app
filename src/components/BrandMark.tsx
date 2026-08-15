import { cn } from '@/lib/cn'

/**
 * Das Logo als Bildmarke.
 *
 * Quelle ist bewusst `/icon-192.png` und keine eigene Datei: Dieselbe Grafik
 * liegt ohnehin für die Installation bereit, und ein zweites Abbild müsste bei
 * jeder Logo-Änderung mitgepflegt werden.
 *
 * Das PNG ist ein volles Quadrat — die Ecken tragen die Flächenfarbe des Logos.
 * Der Radius hier stellt die Rundquadrat-Silhouette wieder her, sonst säße auf
 * dunklem Grund ein sichtbar eckiger Kasten.
 */
export function BrandMark({
  size = 48,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <img
      src="/icon-192.png"
      alt="Gym App"
      width={size}
      height={size}
      draggable={false}
      className={cn('shrink-0 rounded-[22%] select-none', className)}
      style={{ width: size, height: size }}
    />
  )
}
