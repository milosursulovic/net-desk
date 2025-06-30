import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

import fs from 'fs'
import dotenv from 'dotenv'

dotenv.config()

const ip = process.env.VITE_HOST_IP_ADDRESS || 'localhost'
const port = process.env.VITE_HOST_PORT || 5173

export default defineConfig({
  plugins: [vue(), vueDevTools(), tailwindcss()],
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
