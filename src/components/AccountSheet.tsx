import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useTheme, type ThemePref } from '@/context/ThemeContext'
import { cn } from '@/lib/cn'
import { Button } from './ui/Button'
import { ConfirmDialog, Dialog } from './ui/Dialog'
import { Segmented } from './ui/Display'
import { IconLogout } from './ui/Icons'

/**
 * Konto und Darstellung.
 *
 * Das Design hat einen "Profil"-Eintrag in der Navigation. Die Spec legt die
 * sechs Navigationsziele aber abschliessend fest (§3.7) und Profil ist keines
 * davon — deshalb sitzt beides hinter dem Avatar oben rechts, genau wie im
 * Home-Screen des Designs.
 */

const THEME_OPTIONS: Array<{ value: ThemePref; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
]

/** Der runde Avatar: schwarze Fläche, Lime-Initiale. */
export function AccountButton({
  onClick,
  className,
  size = 'md',
}: {
  onClick: () => void
  className?: string
  size?: 'sm' | 'md'
}) {
  const { user } = useAuth()
  const initial = (user?.email ?? '?').trim().charAt(0).toUpperCase()

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Konto und Darstellung"
      className={cn(
        // ink-2 statt ink: auf dem tiefschwarzen Hintergrund des Dunkelmodus
        // wäre ein Kreis in exakt derselben Farbe unsichtbar.
        'font-display grid shrink-0 place-items-center rounded-full bg-ink-2 text-accent',
        'transition-transform duration-[var(--dur-fast)] active:scale-95',
        size === 'md' ? 'size-11 text-[17px]' : 'size-9 text-[14px]',
        className
      )}
    >
      {initial}
    </button>
  )
}

export function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const { pref, setPref } = useTheme()
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    await supabase.auth.signOut()
    setLoggingOut(false)
    setLogoutOpen(false)
    onClose()
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} title="Konto">
        <div className="flex flex-col gap-6 pb-2">
          <div className="flex items-center gap-3">
            <AccountButton onClick={() => {}} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-extrabold">{user?.email ?? 'Angemeldet'}</p>
              <p className="text-[12.5px] font-semibold text-muted">Einzelnutzer-Konto</p>
            </div>
          </div>

          <div>
            <p className="eyebrow mb-2 text-subtle">Darstellung</p>
            <Segmented
              name="theme"
              ariaLabel="Darstellung"
              options={THEME_OPTIONS}
              value={pref}
              allowDeselect={false}
              onChange={(v) => v && setPref(v)}
            />
          </div>

          <Button
            variant="secondary"
            block
            size="lg"
            icon={<IconLogout />}
            onClick={() => setLogoutOpen(true)}
          >
            Abmelden
          </Button>
        </div>
      </Dialog>

      <ConfirmDialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={handleLogout}
        loading={loggingOut}
        destructive={false}
        title="Abmelden?"
        description="Noch nicht übertragene Sätze bleiben auf diesem Gerät gespeichert und werden nach dem nächsten Anmelden gesendet."
        confirmLabel="Abmelden"
      />
    </>
  )
}
