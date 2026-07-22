import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

import fs from 'fs'
import dotenv from 'dotenv'

dotenv.config()

const ip = process.env.VITE_HOST_IP_ADDRESS || 'localhost'
const port = process.env.VITE_HOST_PORT || 5173

export default defineConfig({
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
