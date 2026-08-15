import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { displayNameOf } from '@/lib/profile'
import { PageLoader } from './ui/States'
import Onboarding from '@/pages/Onboarding'

/**
 * Geschuetzte Routen (Spec §3.7).
 *
 * Solange die Sitzung geprueft wird -> Ladezustand. Ohne Nutzer -> `/login`,
 * unter Mitnahme des Ziels, damit nach dem Anmelden wieder dort gelandet wird.
 *
 * Fehlt der Anzeigename, kommt einmalig das Onboarding — bewusst hier und
 * nicht als eigene Route: So gibt es keinen Pfad, ueber den man daran
 * vorbeikommt, und kein Zurueck-Wischen mitten hinein.
 */
export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <PageLoader label="Sitzung wird geprüft …" />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!displayNameOf(user)) return <Onboarding />
  return <Outlet />
}

/** Umgekehrt: wer angemeldet ist, sieht die Anmeldeseiten nie (Spec §4.1 AK-2). */
export function PublicOnlyRoute() {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  if (user) return <Navigate to="/" replace />
  return <Outlet />
}
