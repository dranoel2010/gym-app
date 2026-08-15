import { useEffect, useState } from 'react'
import type { ComponentType, ReactNode, SVGProps } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { AccountButton, AccountSheet } from './AccountSheet'
import { SyncIndicator } from './SyncIndicator'
import {
  IconCheckin,
  IconData,
  IconDumbbell,
  IconHome,
  IconPlans,
  IconRuler,
  IconStats,
} from './ui/Icons'

/** Hauptnavigation — 6 Ziele, dauerhaft sichtbar (Spec §3.7). */
interface NavItem {
  to: string
  label: string
  short: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

const NAV: NavItem[] = [
  { to: '/', label: 'Start', short: 'Start', Icon: IconHome },
  { to: '/plans', label: 'Pläne', short: 'Pläne', Icon: IconPlans },
  { to: '/checkin', label: 'Check-in', short: 'Check-in', Icon: IconCheckin },
  { to: '/progress', label: 'Fortschritt', short: 'Maße', Icon: IconRuler },
  { to: '/stats', label: 'Statistik', short: 'Stats', Icon: IconStats },
  { to: '/daten', label: 'Daten', short: 'Daten', Icon: IconData },
]

export function Layout() {
  const location = useLocation()
  const [accountOpen, setAccountOpen] = useState(false)

  // Beim Seitenwechsel nach oben — sonst startet die neue Seite dort, wo die
  // vorige gescrollt war.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className="min-h-dvh bg-bg">
      <a
        href="#inhalt"
        className="sr-only-focusable fixed top-3 left-3 z-50 rounded-[12px] bg-accent px-3 py-2 text-[14px] font-extrabold text-accent-ink"
      >
        Zum Inhalt springen
      </a>

      <div className="relative mx-auto flex w-full max-w-6xl lg:gap-10 lg:px-6">
        {/* ---------- Desktop-Seitenleiste ---------- */}
        <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col py-7 lg:flex">
          <div className="mb-9 flex items-center gap-2.5 px-3">
            <span className="grid size-10 place-items-center rounded-[13px] bg-ink text-[19px] text-accent">
              <IconDumbbell />
            </span>
            <span className="font-display text-[19px] uppercase">Volt</span>
          </div>

          <nav className="flex flex-col gap-1" aria-label="Hauptnavigation">
            {NAV.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-[15px] font-bold',
                    'transition-colors duration-[var(--dur-fast)]',
                    isActive
                      ? 'bg-accent text-accent-ink'
                      : 'text-muted hover:bg-surface-2 hover:text-fg'
                  )
                }
              >
                <Icon className="text-[19px]" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto flex flex-col items-start gap-3 px-3">
            <SyncIndicator />
            <AccountButton onClick={() => setAccountOpen(true)} />
          </div>
        </aside>

        {/* ---------- Inhalt ---------- */}
        <div className="min-w-0 flex-1">
          {/* Auf dem Handy gibt es bewusst keine Titelleiste: jeder Screen
              beginnt direkt mit seiner eigenen grossen Ueberschrift, so wie im
              Design. Oben rechts schwebt nur die Kontosteuerung. */}
          <div className="pt-safe sticky top-0 z-30 flex justify-end gap-2 px-4 pt-3 pb-1 lg:hidden">
            <SyncIndicator />
            <AccountButton onClick={() => setAccountOpen(true)} />
          </div>

          <main id="inhalt" className="pb-nav px-4 pt-2 lg:px-0 lg:py-9 lg:pb-16">
            <Outlet />
          </main>
        </div>
      </div>

      {/* ---------- Handy-Navigation unten ---------- */}
      <nav
        aria-label="Hauptnavigation"
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface lg:hidden"
      >
        <ul className="grid grid-cols-6">
          {NAV.map(({ to, short, Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex h-[68px] flex-col items-center justify-center gap-1.5 px-0.5',
                    'transition-colors duration-[var(--dur-fast)]',
                    isActive ? 'text-fg' : 'text-subtle'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'grid size-8 place-items-center rounded-[10px] text-[18px]',
                        'transition-[background-color,color] duration-[var(--dur)]',
                        isActive && 'bg-accent text-accent-ink'
                      )}
                    >
                      <Icon />
                    </span>
                    <span
                      className={cn(
                        'text-[10px] leading-none tracking-tight',
                        isActive ? 'font-extrabold' : 'font-bold'
                      )}
                    >
                      {short}
                    </span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  )
}

/**
 * Kopfbereich einer Seite — grosse Archivo-Ueberschrift mit optionaler
 * Eyebrow-Zeile darueber, so wie in allen Screens des Designs.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
}: {
  eyebrow?: ReactNode
  title: string
  description?: ReactNode
  actions?: ReactNode
  back?: ReactNode
}) {
  return (
    <div className="mb-6">
      {back}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1.5 text-[13px] font-bold text-muted">{eyebrow}</p>
          )}
          <h1 className="font-display text-[30px] text-balance">{title}</h1>
          {description && (
            <p className="mt-2 text-[14.5px] leading-relaxed font-medium text-muted text-pretty">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
