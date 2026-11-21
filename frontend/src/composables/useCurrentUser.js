import { ref, computed } from 'vue'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'

// Module-level (not per-component) so every component sharing this
// composable reads the same state instead of each instance re-fetching.
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
  // Above the "admin" role itself - for modules that ONLY the account with the
  // username "admin" should see/use, not any admin account (same
  // reason as requireRootAdmin on the backend: the "admin" role can be
  // granted to several accounts).
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
