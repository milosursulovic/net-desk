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
  const isOperatorOrAdmin = computed(() => ['admin', 'operator'].includes(currentUser.value?.role))
  // Iznad same "admin" uloge - za module koje treba da vidi/koristi SAMO
  // nalog sa korisničkim imenom "admin", ne bilo koji admin nalog (isti
  // razlog kao requireRootAdmin na backend-u: uloga "admin" može biti
  // dodeljena više naloga).
  const isRootAdmin = computed(
    () => currentUser.value?.role === 'admin' && currentUser.value?.username === 'admin',
  )
  return { currentUser, isAdmin, isOperatorOrAdmin, isRootAdmin }
}

// `currentUser`/`loadPromise` are module-level so every component shares one
// fetch - but that means they otherwise survive a logout, and load() would
// never re-fetch for the next login (stale role shown until a full page
// reload). Call this on every "session ends" path (logout button, expired-
// token redirect, 401 redirect) so the next useCurrentUser() call re-fetches
// against whatever token is active next.
export function resetCurrentUser() {
  currentUser.value = null
  loadPromise = null
}
