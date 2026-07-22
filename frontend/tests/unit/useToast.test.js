import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useToast } from '@/composables/useToast.js'

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shows a message with the default success prefix', () => {
    const { toast, showToast } = useToast()
    showToast('Sačuvano')
    expect(toast.value).toBe('✅ Sačuvano')
  })

  it('supports a custom prefix (e.g. error)', () => {
    const { toast, showToast } = useToast()
    showToast('Greška', { prefix: '❌ ' })
    expect(toast.value).toBe('❌ Greška')
  })

  it('auto-clears after the given duration', () => {
    const { toast, showToast } = useToast()
    showToast('Sačuvano', { duration: 1000 })
    expect(toast.value).toBe('✅ Sačuvano')
    vi.advanceTimersByTime(999)
    expect(toast.value).toBe('✅ Sačuvano')
    vi.advanceTimersByTime(1)
    expect(toast.value).toBeNull()
  })

  it('a second showToast call resets the auto-clear timer instead of stacking', () => {
    const { toast, showToast } = useToast()
    showToast('First', { duration: 1000 })
    vi.advanceTimersByTime(900)
    showToast('Second', { duration: 1000 })
    vi.advanceTimersByTime(900)
    // 1800ms since the first call, but the timer was reset at 900ms, so the
    // first call's original 1000ms deadline should NOT have fired.
    expect(toast.value).toBe('✅ Second')
    vi.advanceTimersByTime(100)
    expect(toast.value).toBeNull()
  })

  it('clearToast immediately hides the message and cancels the pending timer', () => {
    const { toast, showToast, clearToast } = useToast()
    showToast('Sačuvano')
    clearToast()
    expect(toast.value).toBeNull()
  })

  it('copyToClipboard shows the success label on success', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue() } })
    const { toast, copyToClipboard } = useToast()
    await copyToClipboard('10.230.62.81', 'IP kopiran')
    expect(toast.value).toBe('✅ IP kopiran')
    vi.unstubAllGlobals()
  })

  it('copyToClipboard shows an error toast when the clipboard write fails', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    const { toast, copyToClipboard } = useToast()
    await copyToClipboard('10.230.62.81')
    expect(toast.value).toBe('❌ Neuspešno kopiranje')
    vi.unstubAllGlobals()
  })
})
