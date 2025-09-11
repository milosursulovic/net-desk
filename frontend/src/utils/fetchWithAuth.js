import router from '@/router'

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return Date.now() > payload.exp * 1000
  } catch {
    return true
  }
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

  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}${url}`, {
      ...options,
      headers,
    })

    if (res.status === 401) {
      safeRedirectToLogin()
      return Promise.reject(new Error('Unauthorized: 401 from API'))
    }

    if (res.status === 403) {
    }

    return res
  } catch (err) {
    return Promise.reject(err)
  }
}
