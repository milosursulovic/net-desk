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
  // 5s safety margin so a token isn't treated as valid, used to start a
  // request, and then expires server-side mid-flight - better to refresh
  // slightly early than to race an in-flight request against expiry.
  return Date.now() > p.exp * 1000 - 5000
}
