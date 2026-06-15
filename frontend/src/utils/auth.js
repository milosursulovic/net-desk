export function decodeJwt(token) {
  try {
    const [, payload] = token.split('.')
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64))
  } catch {
    return null
  }
}

export function isTokenExpired(token) {
  const p = decodeJwt(token)
  if (!p?.exp) return true
  return Date.now() > p.exp * 1000 - 5000
}
