import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

import fs from 'fs'
import { execSync } from 'node:child_process'
import dotenv from 'dotenv'

dotenv.config()

const ip = process.env.VITE_HOST_IP_ADDRESS || 'localhost'
const port = process.env.VITE_HOST_PORT || 5173

// "Logička" verzija - broj commit-ova umesto ručno biranog semver broja, da
// se sama pomera na svaki sledeći commit bez ikakvog održavanja (package.json
// verzija je odavno zaostala - 1.0.15 posle 260+ commit-ova stvarnog rada).
// git komanda je best-effort (build ne sme da padne van git repo-a, npr. u
// nekom čistom Docker kontekstu bez .git foldera).
function gitCommitCount() {
  try {
    return execSync('git rev-list --count HEAD').toString().trim()
  } catch {
    return '0'
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(`1.0.${gitCommitCount()}`),
  },
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // generateSW only builds/registers a service worker for production
      // builds by default - without this, `npm run dev` would have no SW at
      // all, so push notifications couldn't be tested without a full build.
      devOptions: {
        enabled: true,
        type: 'module',
      },
      // Push handling lives in a plain script (public/push-sw.js), imported
      // into the plugin's auto-generated service worker - avoids hand-rolling
      // precaching (injectManifest strategy) just to add two event listeners.
      workbox: {
        importScripts: ['push-sw.js'],
        // generateSW registers a catch-all NavigationRoute that serves the
        // cached index.html for EVERY browser navigation (any link click/
        // new-tab open), regardless of path - without this denylist, direct
        // links to /uploads/downloads/* (deployment files served straight
        // from Express, not part of the SPA) 404 inside the app's own
        // client-side router instead of reaching the real file on the
        // server (discovered live: curl got 200, clicking the link in a
        // browser got the SPA's NotFoundView).
        navigateFallbackDenylist: [/^\/uploads\//, /^\/api\//],
      },
      manifest: {
        name: 'NetDesk',
        short_name: 'NetDesk',
        description: 'Interni IT alat i RMM sistem za mrežnu/hardversku infrastrukturu',
        start_url: '/',
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#2563eb',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    https: {
      key: fs.readFileSync(process.env.VITE_SSL_KEY_PATH),
      cert: fs.readFileSync(process.env.VITE_SSL_CERT_PATH),
    },
    host: ip,
    port: port,
  },
})
