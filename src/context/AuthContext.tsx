import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthValue {
  session: Session | null
  user: User | null
  /** `true`, solange die bestehende Sitzung noch geprueft wird. */
  loading: boolean
}

const AuthContext = createContext<AuthValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    // Auf beides gleichzeitig hoeren: der Listener meldet spaetere Wechsel,
    // getSession() beantwortet den Startzustand. Zusammen ist das race-frei —
    // egal welcher zuerst kommt, `loading` loest in jedem Fall auf.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return
      setSession(next)
      setLoading(false)
    })

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return
        setSession(data.session)
      })
      .catch((error) => {
        console.error('[gym-tracker] Sitzung konnte nicht geladen werden:', error)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthValue>(
    () => ({ session, user: session?.user ?? null, loading }),
    [session, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth muss innerhalb von <AuthProvider> verwendet werden.')
  return ctx
}
