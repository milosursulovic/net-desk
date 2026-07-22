import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  fmtDate,
  fmtDateOnly,
  fmtRelative,
  fmtGb,
  fmtTb,
  fmtPct,
  fmtMbps,
  safe,
  shortSerial,
  fmtNumberSr,
  fmtDateSr,
} from '@/utils/format.js'

describe('fmtDate', () => {
  it('returns em-dash for falsy/invalid input', () => {
    expect(fmtDate(null)).toBe('—')
    expect(fmtDate(undefined)).toBe('—')
    expect(fmtDate('')).toBe('—')
    expect(fmtDate('not a date')).toBe('—')
  })

  it('formats a valid date string', () => {
    expect(fmtDate('2026-01-15T10:00:00.000Z')).not.toBe('—')
  })
})

describe('fmtDateOnly', () => {
  it('returns em-dash for falsy/invalid input', () => {
    expect(fmtDateOnly(null)).toBe('—')
    expect(fmtDateOnly('garbage')).toBe('—')
  })

  it('formats a valid date', () => {
    expect(fmtDateOnly('2026-01-15')).not.toBe('—')
  })
})

describe('fmtRelative', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns em-dash for falsy/invalid input', () => {
    expect(fmtRelative(null)).toBe('—')
    expect(fmtRelative('garbage')).toBe('—')
  })

  it('reports seconds just under the 45s boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T12:00:44.000Z'))
    expect(fmtRelative('2026-01-15T12:00:00.000Z')).toBe('pre par sekundi')
  })

  it('reports minutes once past the 45s boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T12:01:00.000Z'))
    expect(fmtRelative('2026-01-15T12:00:00.000Z')).toBe('pre 1 min')
  })

  it('reports hours once past 60 minutes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T14:00:00.000Z'))
    expect(fmtRelative('2026-01-15T12:00:00.000Z')).toBe('pre 2 h')
  })

  it('reports days once past 24 hours', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-17T12:00:00.000Z'))
    expect(fmtRelative('2026-01-15T12:00:00.000Z')).toBe('pre 2 d')
  })
})

describe('fmtGb / fmtTb / fmtPct / fmtMbps', () => {
  it('renders 0 as a real value, not em-dash (falsy-but-valid trap)', () => {
    expect(fmtGb(0)).toBe('0 GB')
    expect(fmtTb(0)).toBe('0 TB')
    expect(fmtPct(0)).toBe('0%')
    expect(fmtMbps(0)).toBe('0 Mbps')
  })

  it('renders em-dash for null/undefined', () => {
    expect(fmtGb(null)).toBe('—')
    expect(fmtGb(undefined)).toBe('—')
    expect(fmtPct(null)).toBe('—')
  })

  it('renders a positive value with its unit suffix', () => {
    expect(fmtGb(16)).toBe('16 GB')
    expect(fmtTb(1.5)).toBe('1.5 TB')
    expect(fmtPct(87)).toBe('87%')
    expect(fmtMbps(1000)).toBe('1000 Mbps')
  })
})

describe('safe', () => {
  it('passes through non-nullish values unchanged, including falsy ones like 0/false', () => {
    expect(safe(0)).toBe(0)
    expect(safe(false)).toBe(false)
    expect(safe('')).toBe('')
    expect(safe('x')).toBe('x')
  })

  it('replaces null/undefined with em-dash', () => {
    expect(safe(null)).toBe('—')
    expect(safe(undefined)).toBe('—')
  })
})

describe('shortSerial', () => {
  it('returns empty string for falsy input', () => {
    expect(shortSerial(null)).toBe('')
    expect(shortSerial('')).toBe('')
  })

  it('returns short serials unchanged', () => {
    expect(shortSerial('ABC123')).toBe('ABC123')
  })

  it('truncates long serials to first4…last4', () => {
    expect(shortSerial('WD-WCAYUH369112')).toBe('WD-W…9112')
  })
})

describe('fmtNumberSr', () => {
  it('formats a number with Serbian locale grouping', () => {
    expect(fmtNumberSr(1234)).toMatch(/1[.,]?234/)
  })

  it('falls back to 0 for non-numeric input', () => {
    expect(fmtNumberSr('not a number')).toBe('0')
  })
})

describe('fmtDateSr', () => {
  it('returns a fallback message for falsy/invalid input', () => {
    expect(fmtDateSr(null)).toBe('Nema podataka')
    expect(fmtDateSr('garbage')).toBe('Nema podataka')
  })

  it('formats a valid date', () => {
    expect(fmtDateSr('2026-01-15')).not.toBe('Nema podataka')
  })
})
