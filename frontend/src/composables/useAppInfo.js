import { computed } from 'vue'

// __APP_VERSION__ comes from vite.config.js `define` - it's injected at
// build time, derived from the number of commits in the git history, not a
// hand-maintained number.
export function useAppInfo() {
  const year = computed(() => new Date().getFullYear())
  const copyright = 'Informacioni sistem Zdravstvenog centra Bor'
  const version = __APP_VERSION__

  return { year, copyright, version }
}
