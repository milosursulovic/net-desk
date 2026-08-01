import { computed } from 'vue'

export function useAppInfo() {
  const year = computed(() => new Date().getFullYear())
  const copyright = 'Informacioni sistem Zdravstvenog centra Bor'

  return { year, copyright }
}
