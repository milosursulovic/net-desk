import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// Separate from vite.config.js on purpose: that file reads SSL cert files
// (fs.readFileSync on VITE_SSL_KEY_PATH/VITE_SSL_CERT_PATH) for the dev
// server block, which tests have no reason to depend on - a machine that
// can run `npm test` shouldn't also need local HTTPS certs configured.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./tests/setup.js'],
  },
})
