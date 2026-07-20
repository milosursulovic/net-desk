import { computed } from 'vue'

export function useAppInfo() {
  const year = computed(() => new Date().getFullYear())
  const copyright = 'Informacioni sistem Opšte bolnice Bor'

  return { year, copyright }
}
