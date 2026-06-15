import { computed } from 'vue'

export function useAppInfo() {
  const appVersion = import.meta.env.VITE_APP_VERSION
  const year = computed(() => new Date().getFullYear())
  const copyright = 'Informacioni sistem Opšte bolnice Bor'

  return { appVersion, year, copyright }
}
