import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProtectedRoute, PublicOnlyRoute } from './components/ProtectedRoute'
import { PageLoader } from './components/ui/States'

import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'

import Dashboard from './pages/Dashboard'
import Plans from './pages/Plans'
import Workout from './pages/Workout'
import NotFound from './pages/NotFound'

// Nachladen statt mitliefern: Diagramme (recharts), ZIP-Verarbeitung (jszip)
// und Drag-and-drop machen zusammen den Großteil des Bundles aus, werden aber
// selten und nie beim Start gebraucht. Der Trainings-Screen bleibt bewusst im
// Hauptbundle — er muss auch ohne Netz sofort öffnen (Spec §3.6).
const Stats = lazy(() => import('./pages/Stats'))
const Checkin = lazy(() => import('./pages/Checkin'))
const Progress = lazy(() => import('./pages/Progress'))
const Data = lazy(() => import('./pages/Data'))
const PlanImport = lazy(() => import('./pages/PlanImport'))
const PlanEditor = lazy(() => import('./pages/PlanEditor'))

/**
 * Routen (Spec §3.7).
 *
 * Die 404-Route ist Pflicht: in v1 fehlte sie und unbekannte Pfade zeigten eine
 * weiße Seite.
 *
 * `/reset-password` liegt bewusst NICHT hinter `PublicOnlyRoute`: Der Klick auf
 * den Link aus der E-Mail erzeugt eine Sitzung, der Nutzer gilt damit als
 * angemeldet — und würde sonst sofort aufs Dashboard umgeleitet, ohne je das
 * Formular zu sehen.
 */
export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Route>

        <Route path="/reset-password" element={<ResetPassword />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/plans/new" element={<PlanEditor />} />
            <Route path="/plans/import" element={<PlanImport />} />
            <Route path="/plans/:id" element={<PlanEditor />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/checkin" element={<Checkin />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/daten" element={<Data />} />
          </Route>
          {/* Das aktive Training läuft ohne Hauptnavigation — voller Platz für
              die Satz-Eingabe, und kein versehentliches Wegnavigieren. */}
          <Route path="/workout/:workoutId" element={<Workout />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
