import router from '@/router'
import { isTokenExpired } from '@/utils/auth.js'
import { resetCurrentUser } from '@/composables/useCurrentUser.js'

// Module-level (not per-call) guard: many concurrent requests can hit a 401
// at once, and without this they'd each try to push('/login'), stacking
// redundant router navigations/returnTo overwrites.
let redirectingToLogin = false
function safeRedirectToLogin() {
  if (redirectingToLogin) return

  // This 401 may belong to a request that started under a PREVIOUS session
  // (e.g. the user logged out and back in as someone else while it was
  // still in flight, or a login just barely raced a stale request from the
  // login page itself). If there's already a valid token again by the time
  // this fires, that's a stale/superseded response, not a real auth
  // failure - acting on it would wrongly bounce a freshly-logged-in user
  // back to the login page.
  const currentToken = localStorage.getItem('token')
  if (currentToken && !isTokenExpired(currentToken)) return

  redirectingToLogin = true
  localStorage.removeItem('token')
  resetCurrentUser()
  const current = router.currentRoute.value
  const returnTo = encodeURIComponent(current.fullPath || '/')
  if (current.path !== '/login') {
    router.push(`/login?returnTo=${returnTo}`).finally(() => {
      redirectingToLogin = false
    })
  } else {
    redirectingToLogin = false
  }
}

const API_BASE = import.meta.env.VITE_API_URL || ''

export async function fetchWithAuth(url, options = {}) {
  const token = localStorage.getItem('token')
  const isFormData = options.body instanceof FormData

  if (!token || isTokenExpired(token)) {
    safeRedirectToLogin()
    return Promise.reject(new Error('Unauthorized: missing/expired token'))
  }

  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
  }

  const res = await fetch(`${API_BASE}${url}`, { ...options, headers })

  if (res.status === 401) {
    safeRedirectToLogin()
    throw new Error('Unauthorized (401)')
  }

  return res
}
