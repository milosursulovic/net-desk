// authFetch.js
import router from '@/router'

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return Date.now() > payload.exp * 1000
  } catch {
    return true // nevalidan token => tretiraj kao istekao
  }
}

let redirectingToLogin = false
function safeRedirectToLogin() {
  if (redirectingToLogin) return
  redirectingToLogin = true
  localStorage.removeItem('token')
  // Ako već nisi na /login, prebaci i prosledi povratni URL:
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

  // 1) Proaktivno: nema tokena ili je istekao -> odmah na login
  if (!token || isTokenExpired(token)) {
    safeRedirectToLogin()
    // vrati rejected Promise da bi call-site znao da je prekinuto
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

    // 2) Reaktivno: backend kaže da je token nevažeći/istekao
    if (res.status === 401) {
      safeRedirectToLogin()
      return Promise.reject(new Error('Unauthorized: 401 from API'))
    }

    // Opcionalno: ako želiš da tretiraš 403 (forbidden) slično
    if (res.status === 403) {
      // možeš da prikažeš poruku ili da uradiš redirect, po potrebi
      // safeRedirectToLogin()
      // return Promise.reject(new Error('Forbidden: 403 from API'))
    }

    return res
  } catch (err) {
    // mrežne greške / CORS itd.
    return Promise.reject(err)
  }
}
