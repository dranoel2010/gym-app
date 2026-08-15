import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useTheme, type ThemePref } from '@/context/ThemeContext'
import { cn } from '@/lib/cn'
import { DISPLAY_NAME_KEY, MAX_NAME_LENGTH, displayNameOf, initialOf } from '@/lib/profile'
import { humanizeDbError } from '@/lib/errors'
import { Button } from './ui/Button'
import { ConfirmDialog, Dialog } from './ui/Dialog'
import { Segmented } from './ui/Display'
import { Field, Input } from './ui/Field'
import { IconCheck, IconLogout } from './ui/Icons'

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

/** Der runde Avatar: schwarze Fläche, Lime-Initiale aus dem Namen. */
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
      {initialOf(user)}
    </button>
  )
}

export function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const { pref, setPref } = useTheme()
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const currentName = displayNameOf(user) ?? ''
  const [name, setName] = useState(currentName)
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  // Beim Öffnen den gespeicherten Wert übernehmen, damit ein abgebrochener
  // Änderungsversuch nicht im Feld stehen bleibt.
  useEffect(() => {
    if (open) {
      setName(currentName)
      setNameError(null)
    }
  }, [open, currentName])

  const dirty = name.trim() !== currentName && name.trim() !== ''

  const saveName = async () => {
    const trimmed = name.trim()
    if (!trimmed) return setNameError('Bitte gib einen Namen ein')
    if (trimmed.length > MAX_NAME_LENGTH) return setNameError(`Höchstens ${MAX_NAME_LENGTH} Zeichen`)

    setSavingName(true)
    setNameError(null)
    try {
      const { error } = await supabase.auth.updateUser({ data: { [DISPLAY_NAME_KEY]: trimmed } })
      if (error) throw error
      toast.success('Name geändert.')
    } catch (error) {
      console.error('[gym-tracker] Name konnte nicht gespeichert werden:', error)
      setNameError(humanizeDbError(error, 'Der Name konnte nicht gespeichert werden.'))
    } finally {
      setSavingName(false)
    }
  }

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
            <span className="font-display grid size-11 shrink-0 place-items-center rounded-full bg-ink-2 text-[17px] text-accent">
              {initialOf(user)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-extrabold">{currentName || 'Ohne Namen'}</p>
              <p className="truncate text-[12.5px] font-semibold text-muted">{user?.email}</p>
            </div>
          </div>

          <Field label="Name" error={nameError ?? undefined} hint="So wirst du auf dem Start begrüßt.">
            {({ id, invalid }) => (
              <div className="flex gap-2">
                <Input
                  id={id}
                  invalid={invalid}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={MAX_NAME_LENGTH}
                  autoCapitalize="words"
                  placeholder="z. B. Leo"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && dirty) {
                      e.preventDefault()
                      void saveName()
                    }
                  }}
                />
                <Button
                  onClick={() => void saveName()}
                  disabled={!dirty}
                  loading={savingName}
                  icon={<IconCheck />}
                  className="shrink-0"
                >
                  Speichern
                </Button>
              </div>
            )}
          </Field>

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
