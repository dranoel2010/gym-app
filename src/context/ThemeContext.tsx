import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Hell/Dunkel-Umschaltung.
 *
 * Gespeichert wird die PRAeFERENZ ("system" | "light" | "dark"), gesetzt wird am
 * `<html>`-Element immer der AUFGELOeSTE Wert ("light" | "dark"). Dadurch muss
 * kein CSS mit `prefers-color-scheme` arbeiten und der Zustand ist eindeutig.
 *
 * Den ersten Anstrich uebernimmt das Inline-Skript in `index.html` — sonst
 * blitzt beim Laden die helle Palette auf.
 */

export type ThemePref = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'gt.theme'

/** Muss zu --bg in tokens.css passen (fuer die Statusleiste des Handys). */
const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#f4f4f2',
  dark: '#0e0f12',
}

interface ThemeValue {
  pref: ThemePref
  resolved: ResolvedTheme
  setPref: (p: ThemePref) => void
  /** Schaltet zwischen hell und dunkel — verlaesst dabei den Systemmodus. */
  toggle: () => void
}

const ThemeContext = createContext<ThemeValue | undefined>(undefined)

function readPref(): ThemePref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    /* privater Modus */
  }
  return 'system'
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolve(pref: ThemePref): ResolvedTheme {
  if (pref === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return pref
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readPref)
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(readPref()))

  const apply = useCallback((next: ResolvedTheme) => {
    document.documentElement.setAttribute('data-theme', next)
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLOR[next])
    setResolved(next)
  }, [])

  useEffect(() => {
    apply(resolve(pref))
    try {
      localStorage.setItem(STORAGE_KEY, pref)
    } catch {
      /* privater Modus */
    }
  }, [pref, apply])

  // Wechselt das System die Einstellung, folgt die App — aber nur, solange der
  // Nutzer nicht selbst gewaehlt hat.
  useEffect(() => {
    if (pref !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => apply(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [pref, apply])

  const value = useMemo<ThemeValue>(
    () => ({
      pref,
      resolved,
      setPref: setPrefState,
      toggle: () => setPrefState(resolve(pref) === 'dark' ? 'light' : 'dark'),
    }),
    [pref, resolved]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme muss innerhalb von <ThemeProvider> verwendet werden.')
  return ctx
}
