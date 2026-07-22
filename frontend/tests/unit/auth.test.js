import { describe, it, expect, vi, afterEach } from 'vitest'
import { decodeJwt, isTokenExpired } from '@/utils/auth.js'

// Builds a real (unsigned) JWT-shaped string with base64url encoding, the
// same encoding real tokens use (- / _ instead of + / , no padding) - not
// just plain base64, since decodeJwt specifically un-does that substitution.
function makeToken(payload) {
  const b64url = (obj) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.fakesignature`
}

describe('decodeJwt', () => {
  it('decodes a well-formed token payload', () => {
    const token = makeToken({ userId: 1, username: 'admin', exp: 9999999999 })
    expect(decodeJwt(token)).toEqual({ userId: 1, username: 'admin', exp: 9999999999 })
  })

  it('returns null for garbage input instead of throwing', () => {
    expect(decodeJwt('not-a-token')).toBeNull()
    expect(decodeJwt('')).toBeNull()
  })

  it('returns null when the payload segment is not valid base64/JSON', () => {
    expect(decodeJwt('header.%%%not-base64%%%.sig')).toBeNull()
  })
})

describe('isTokenExpired', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('treats an undecodable token as expired', () => {
    expect(isTokenExpired('garbage')).toBe(true)
  })

  it('treats a token with no exp claim as expired', () => {
    const token = makeToken({ userId: 1 })
    expect(isTokenExpired(token)).toBe(true)
  })

  it('treats a token as expired within the 5s safety margin, even if exp is technically still in the future', () => {
    vi.useFakeTimers()
    const nowMs = 1_800_000_000_000
    vi.setSystemTime(nowMs)
    const expSeconds = nowMs / 1000 + 3 // 3s in the future - inside the 5s margin
    const token = makeToken({ exp: expSeconds })
    expect(isTokenExpired(token)).toBe(true)
  })

  it('treats a token as valid when exp is comfortably in the future', () => {
    vi.useFakeTimers()
    const nowMs = 1_800_000_000_000
    vi.setSystemTime(nowMs)
    const expSeconds = nowMs / 1000 + 3600 // 1h in the future
    const token = makeToken({ exp: expSeconds })
    expect(isTokenExpired(token)).toBe(false)
  })
})
