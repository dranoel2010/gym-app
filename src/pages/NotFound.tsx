import { useAuth } from '@/context/AuthContext'
import { LinkButton } from '@/components/ui/Button'
import { IconArrowRight, IconSearch } from '@/components/ui/Icons'

/**
 * 404 (Spec §3.7).
 *
 * In v1 fehlte diese Route — unbekannte Pfade zeigten eine weisse Seite ohne
 * jeden Ausweg.
 */
export default function NotFound() {
  const { user } = useAuth()

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg px-6 text-center">
      <span className="grid size-16 place-items-center rounded-full border border-line bg-surface text-[28px] text-subtle">
        <IconSearch />
      </span>
      <div>
        <p className="tnum text-[13px] font-bold tracking-[0.14em] text-subtle uppercase">
          Fehler 404
        </p>
        <h1 className="mt-2 text-[24px] font-bold tracking-tight text-balance">
          Diese Seite gibt es nicht
        </h1>
        <p className="mt-2 max-w-sm text-[14.5px] leading-relaxed text-muted text-balance">
          Der Link ist vermutlich veraltet oder enthält einen Tippfehler.
        </p>
      </div>
      <LinkButton to={user ? '/' : '/login'} size="lg" iconRight={<IconArrowRight />}>
        {user ? 'Zum Dashboard' : 'Zur Anmeldung'}
      </LinkButton>
    </div>
  )
}
