import router from '@/router'

function decodeJwt(token) {
  try {
    const [, payload] = token.split('.')
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64))
  } catch {
    return null
  }
}
function isTokenExpired(token) {
  const p = decodeJwt(token)
  if (!p?.exp) return true
  return Date.now() > p.exp * 1000 - 5000
}

let redirectingToLogin = false
function safeRedirectToLogin() {
  if (redirectingToLogin) return
  redirectingToLogin = true
  localStorage.removeItem('token')
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
