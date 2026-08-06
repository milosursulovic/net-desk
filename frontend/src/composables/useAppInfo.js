import { computed } from 'vue'

// __APP_VERSION__ dolazi iz vite.config.js `define` - injektuje se u
// build-time, izveden iz broja commit-ova u git istoriji, ne ručno
// održavan broj.
export function useAppInfo() {
  const year = computed(() => new Date().getFullYear())
  const copyright = 'Informacioni sistem Zdravstvenog centra Bor'
  const version = __APP_VERSION__

  return { year, copyright, version }
}
