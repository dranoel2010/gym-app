import { createClient } from '@supabase/supabase-js'

/**
 * Zugriff auf Supabase — der einzige Ort, an dem der Client erzeugt wird.
 *
 * Fehlt eine der Umgebungsvariablen, bricht der App-Start hier bewusst ab
 * (Spec §1). Andernfalls wuerde die App laden und erst spaeter mit
 * unverstaendlichen Netzwerkfehlern scheitern.
 */

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  const missing = [
    !url && 'VITE_SUPABASE_URL',
    !anonKey && 'VITE_SUPABASE_ANON_KEY',
  ].filter(Boolean)

  const message =
    `Konfiguration unvollständig: ${missing.join(' und ')} fehlt.\n` +
    `Lege eine Datei .env.local im Projektverzeichnis an (Vorlage: .env.example) ` +
    `und starte den Dev-Server neu.`

  console.error('[gym-tracker] ' + message)
  throw new Error(message)
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export const PHOTO_BUCKET = 'progress-photos'
