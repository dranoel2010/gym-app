import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      // Keine automatisch eingefügte Registrierung: Die Registrierung läuft über
      // `PwaUpdatePrompt`, sonst gäbe es sie doppelt — und der Hinweis auf eine
      // neue Version käme nie an.
      injectRegister: null,
      includeAssets: ['favicon-48.png', 'apple-touch-icon.png'],
      manifest: {
        // `id` hält die App-Identität stabil, auch wenn sich `start_url`
        // einmal ändert. Ohne das Feld leitet der Browser die Identität aus
        // der URL ab und würde eine bereits installierte App als neue ansehen.
        id: '/',
        name: 'Gym Tracker',
        short_name: 'Gym',
        description: 'Persönlicher Krafttrainings-Tracker',
        lang: 'de',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0e0f12',
        theme_color: '#0e0f12',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Eigene Datei statt derselben wie oben: Android schneidet
          // maskierbare Icons kreisförmig zu. In dieser Fassung ist das Motiv
          // eingerückt, damit "GYM APP" nicht angeschnitten wird.
          {
            src: '/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Die App-Shell wird vorgehalten, damit die App im Keller ohne Empfang
        // ueberhaupt startet (Spec §3.6). Die Daten selbst laufen ueber die
        // eigene Offline-Warteschlange, nicht ueber den Service Worker.
        // Die App-Icons bleiben aus dem Offline-Cache heraus: Sie werden beim
        // Installieren geholt — also online — und würden den Cache sonst um
        // gut 700 KB aufblähen, ohne offline je gebraucht zu werden.
        globPatterns: ['**/*.{js,css,html,svg,woff2}', 'favicon-48.png'],
        navigateFallback: '/index.html',
        // Supabase-Antworten duerfen NICHT gecacht werden: veraltete Trainings-
        // daten waeren schlimmer als gar keine.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5173 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as Parameters<typeof defineConfig>[0])
