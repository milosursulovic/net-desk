import { ref, watchEffect } from 'vue'

const STORAGE_KEY = 'netdesk-theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')

// Module-level (not per-component) so every component sharing this
// composable reads/writes the same state instead of each instance tracking
// its own independent copy - same pattern as the module-level guard in
// fetchWithAuth.js's redirectingToLogin.
const theme = ref(localStorage.getItem(STORAGE_KEY) || 'system')

function applyTheme() {
  const isDark = theme.value === 'dark' || (theme.value === 'system' && media.matches)
  document.documentElement.classList.toggle('dark', isDark)
}

// Only relevant in 'system' mode - if the user hasn't picked an explicit
// theme, follow OS changes (e.g. night mode kicking in) live.
media.addEventListener('change', () => {
  if (theme.value === 'system') applyTheme()
})

watchEffect(applyTheme)

export function useTheme() {
  function setTheme(next) {
    theme.value = next
    localStorage.setItem(STORAGE_KEY, next)
  }

  return { theme, setTheme }
}
