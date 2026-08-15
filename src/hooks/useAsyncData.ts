import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Laden mit Ladezustand, Fehlerzustand und Wiederholen (Spec §3.2 / §3.3).
 *
 * Der Ladezustand loest IMMER auf — auch im Fehlerfall und auch, wenn der
 * Effekt vorzeitig abgebrochen wird. In v1 hingen fuenf Screens dauerhaft im
 * Ladezustand, weil ein frueher Return `loading` nicht zuruecksetzte.
 *
 * (Dass `user.id` fehlen koennte, ist hier kein Thema mehr: geschuetzte Seiten
 * werden erst gerendert, wenn die Sitzung steht — siehe `ProtectedRoute`.)
 */
export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: unknown
  /** Erneuter Versuch; `true`, solange er laeuft. */
  reload: () => void
  reloading: boolean
  /** Direkte Korrektur des Zwischenspeichers nach einer Schreibaktion. */
  setData: (updater: T | ((prev: T | null) => T | null) | null) => void
}

export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloading, setReloading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [nonce, setNonce] = useState(0)

  // Der Loader aendert sich bei jedem Render (Closure). Ueber die Ref bleibt der
  // Effekt an `deps` gebunden statt an die Funktionsidentitaet.
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    let active = true
    if (nonce === 0) setLoading(true)
    else setReloading(true)
    setError(null)

    loaderRef
      .current()
      .then((result) => {
        if (active) setData(result)
      })
      .catch((e) => {
        if (!active) return
        console.error('[gym-tracker] Laden fehlgeschlagen:', e)
        setError(e)
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
        setReloading(false)
      })

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { data, loading, error, reload, reloading, setData }
}
