import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster, toast } from 'sonner'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { startSyncWatcher, onOpDropped } from './lib/syncQueue'
import './styles/index.css'

// Warteschlange fuer offline geloggte Saetze starten (Spec §3.6). Muss vor dem
// ersten Render laufen, damit beim App-Start Liegengebliebenes sofort rausgeht.
startSyncWatcher()

// Ein Vorgang, der dauerhaft scheitert, wird verworfen — der Nutzer erfaehrt es.
// Stiller Datenverlust waere schlimmer als eine Fehlermeldung.
onOpDropped((op) => {
  toast.error(
    op.kind === 'insert_set'
      ? 'Ein offline geloggter Satz konnte nicht gespeichert werden und wurde verworfen.'
      : 'Eine Änderung konnte nicht übertragen werden und wurde verworfen.'
  )
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <App />
          <Toaster
            position="top-center"
            richColors={false}
            closeButton
            offset={12}
            toastOptions={{
              // Die Toasts erben die Design-Tokens, damit sie im Hell- wie im
              // Dunkelmodus zur App passen.
              style: {
                background: 'var(--surface)',
                color: 'var(--fg)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                fontSize: '14px',
              },
              classNames: {
                error: '!border-[color-mix(in_oklab,var(--danger)_45%,transparent)]',
                success: '!border-[color-mix(in_oklab,var(--success)_45%,transparent)]',
              },
            }}
          />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>
)
