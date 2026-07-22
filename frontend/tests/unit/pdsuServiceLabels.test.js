import { describe, it, expect } from 'vitest'
import {
  stateLabel,
  stateBadgeClass,
  startModeLabel,
  startModeBadgeClass,
} from '@/utils/pdsuServiceLabels.js'

describe('stateLabel', () => {
  it('translates the known WMI state values', () => {
    expect(stateLabel('Running')).toBe('Pokrenut')
    expect(stateLabel('Stopped')).toBe('Zaustavljen')
    expect(stateLabel('Paused')).toBe('Pauziran')
  })

  it('is case- and whitespace-insensitive', () => {
    expect(stateLabel('  RUNNING  ')).toBe('Pokrenut')
  })

  it('passes an unrecognized value through unchanged', () => {
    expect(stateLabel('SomeWeirdState')).toBe('SomeWeirdState')
  })

  it('falls back to "Nepoznato" for a falsy value', () => {
    expect(stateLabel('')).toBe('Nepoznato')
    expect(stateLabel(null)).toBe('Nepoznato')
  })
})

describe('stateBadgeClass', () => {
  it('returns the right color class per known state', () => {
    expect(stateBadgeClass('Running')).toContain('bg-green-600')
    expect(stateBadgeClass('Stopped')).toContain('bg-red-600')
    expect(stateBadgeClass('Paused')).toContain('bg-amber-500')
  })

  it('returns a neutral slate class for an unknown state', () => {
    expect(stateBadgeClass('whatever')).toContain('bg-slate-500')
  })
})

describe('startModeLabel - bilingual (EN raw WMI value or SR already-translated value)', () => {
  it('recognizes English WMI values', () => {
    expect(startModeLabel('Auto')).toBe('Automatski')
    expect(startModeLabel('Manual')).toBe('Ručno')
    expect(startModeLabel('Disabled')).toBe('Isključen')
  })

  it('recognizes Serbian values with diacritics', () => {
    expect(startModeLabel('ručno')).toBe('Ručno')
    expect(startModeLabel('isključen')).toBe('Isključen')
  })

  it('recognizes the ASCII (diacritics-stripped) Serbian variants', () => {
    expect(startModeLabel('rucno')).toBe('Ručno')
    expect(startModeLabel('iskljucen')).toBe('Isključen')
  })

  it('is whitespace-insensitive (normalizeStartMode strips all whitespace)', () => {
    expect(startModeLabel('  automatic  ')).toBe('Automatski')
  })

  it('passes an unrecognized value through unchanged, and falls back for falsy input', () => {
    expect(startModeLabel('Boot')).toBe('Boot')
    expect(startModeLabel('')).toBe('Nepoznato')
  })
})

describe('startModeBadgeClass', () => {
  it('returns the right color class per known mode (EN or SR)', () => {
    expect(startModeBadgeClass('auto')).toContain('bg-blue-600')
    expect(startModeBadgeClass('rucno')).toContain('bg-amber-500')
    expect(startModeBadgeClass('iskljucen')).toContain('bg-slate-500')
  })

  it('returns a neutral outlined class for an unknown mode', () => {
    expect(startModeBadgeClass('whatever')).toContain('border-slate-200')
  })
})
