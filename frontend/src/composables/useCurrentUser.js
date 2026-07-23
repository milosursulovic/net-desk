import { ref, computed } from 'vue'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'

// Module-level (not per-component) so every component sharing this
// composable reads the same state instead of each instance re-fetching -
// same pattern as useTheme.js's module-level theme ref.
const currentUser = ref(null)
let loadPromise = null

function load() {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const res = await fetchWithAuth('/api/auth/me')
        if (res.ok) currentUser.value = await res.json()
      } catch (err) {
        console.error('Greška pri učitavanju korisnika', err)
      }
    })()
  }
  return loadPromise
}

export function useCurrentUser() {
  load()
  const isAdmin = computed(() => currentUser.value?.role === 'admin')
  return { currentUser, isAdmin }
}
