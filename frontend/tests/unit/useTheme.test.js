import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// useTheme.js has module-level state (a singleton theme ref + a real
// window.matchMedia('change') listener registered at import time), matching
// its own comment about why - every test needs a FRESH module instance
// (vi.resetModules + dynamic import) or state/listeners would leak between
// tests. jsdom also doesn't implement matchMedia at all, so it must be
// stubbed before each import.
function stubMatchMedia(initialMatches) {
  let matches = initialMatches
  let changeHandler = null
  const mql = {
    get matches() {
      return matches
    },
    addEventListener: (event, cb) => {
      if (event === 'change') changeHandler = cb
    },
    removeEventListener: () => {},
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue(mql),
  )
  return {
    triggerSystemChange(newMatches) {
      matches = newMatches
      changeHandler?.({ matches: newMatches })
    },
  }
}

describe('useTheme', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to "system" when nothing is stored in localStorage', async () => {
    stubMatchMedia(false)
    const { useTheme } = await import('@/composables/useTheme.js')
    const { theme } = useTheme()
    expect(theme.value).toBe('system')
  })

  it('reads a previously stored theme from localStorage on load', async () => {
    localStorage.setItem('netdesk-theme', 'dark')
    stubMatchMedia(false)
    const { useTheme } = await import('@/composables/useTheme.js')
    const { theme } = useTheme()
    expect(theme.value).toBe('dark')
  })

  it('setTheme("dark") applies the .dark class and persists the choice', async () => {
    stubMatchMedia(false)
    const { useTheme } = await import('@/composables/useTheme.js')
    const { setTheme } = useTheme()
    setTheme('dark')
    await Promise.resolve() // flush watchEffect
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('netdesk-theme')).toBe('dark')
  })

  it('setTheme("light") removes the .dark class', async () => {
    stubMatchMedia(true) // OS prefers dark, but explicit light should win
    const { useTheme } = await import('@/composables/useTheme.js')
    const { setTheme } = useTheme()
    setTheme('light')
    await Promise.resolve()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('"system" mode follows the OS matchMedia value', async () => {
    const { triggerSystemChange } = stubMatchMedia(false)
    const { useTheme } = await import('@/composables/useTheme.js')
    const { setTheme } = useTheme()
    setTheme('system')
    await Promise.resolve()
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    triggerSystemChange(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('an OS change is ignored while an explicit theme (not "system") is active', async () => {
    const { triggerSystemChange } = stubMatchMedia(false)
    const { useTheme } = await import('@/composables/useTheme.js')
    const { setTheme } = useTheme()
    setTheme('light')
    await Promise.resolve()

    triggerSystemChange(true) // OS switches to dark, but explicit 'light' should not budge
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('multiple useTheme() callers share the same underlying state', async () => {
    stubMatchMedia(false)
    const { useTheme } = await import('@/composables/useTheme.js')
    const a = useTheme()
    const b = useTheme()
    a.setTheme('dark')
    expect(b.theme.value).toBe('dark')
  })
})
