import { useEffect } from 'react'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Hinweis auf eine neue Version (PWA).
 *
 * Ohne diesen Baustein bleibt eine auf dem Homescreen installierte App auf dem
 * alten Stand hängen: Der neue Service Worker installiert sich zwar, wartet
 * aber, bis ALLE Fenster der App geschlossen sind. Bei einer App, die man
 * täglich öffnet und nie schließt, kann das Wochen dauern.
 *
 * Deshalb `registerType: 'prompt'` plus dieser sichtbare Hinweis — statt
 * `autoUpdate`, das mitten im Training neu laden würde. Ein Reload, während
 * jemand gerade einen Satz einträgt, wäre schlimmer als eine alte Version.
 * Der Nutzer entscheidet, wann.
 */
export function PwaUpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Stündlich nach einer neuen Version sehen. Ohne das prüft der Browser
      // nur beim Start — wer die App tagelang offen lässt, erführe nie davon.
      if (!registration) return
      setInterval(() => void registration.update(), 60 * 60 * 1000)
    },
    onRegisterError(error) {
      console.error('[gym-tracker] Service Worker konnte nicht registriert werden:', error)
    },
  })

  useEffect(() => {
    if (!offlineReady) return
    toast.success('Offline einsatzbereit', {
      description: 'Die App funktioniert jetzt auch ohne Verbindung.',
    })
    setOfflineReady(false)
  }, [offlineReady, setOfflineReady])

  useEffect(() => {
    if (!needRefresh) return
    toast('Neue Version verfügbar', {
      description: 'Jetzt neu laden, um sie zu übernehmen.',
      // Bleibt stehen, bis der Nutzer sich entscheidet — ein Hinweis, der nach
      // vier Sekunden verschwindet, wird zwischen zwei Sätzen nie gesehen.
      duration: Infinity,
      action: {
        label: 'Neu laden',
        onClick: () => void updateServiceWorker(true),
      },
      onDismiss: () => setNeedRefresh(false),
    })
  }, [needRefresh, setNeedRefresh, updateServiceWorker])

  return null
}
