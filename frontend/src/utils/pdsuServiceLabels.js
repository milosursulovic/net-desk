function normalizeState(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function normalizeStartMode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

export function stateLabel(value, t) {
  const state = normalizeState(value)

  if (state === 'running') {
    return t ? t('pdsu.stateRunning') : 'Pokrenut'
  }

  if (state === 'stopped') {
    return t ? t('pdsu.stateStopped') : 'Zaustavljen'
  }

  if (state === 'paused') {
    return t ? t('pdsu.statePaused') : 'Pauziran'
  }

  return value || (t ? t('pdsu.stateUnknown') : 'Nepoznato')
}

export function stateBadgeClass(value) {
  const state = normalizeState(value)

  if (state === 'running') {
    return 'bg-good text-white'
  }

  if (state === 'stopped') {
    return 'bg-bad text-white'
  }

  if (state === 'paused') {
    return 'bg-warn text-white'
  }

  return 'bg-ink-muted text-white'
}

// Matches both English (raw WMI StartMode values) and Serbian (already
// translated/manually entered values) so this stays correct regardless of
// which form the data arrived in; the ASCII rucno/iskljucen variants cover
// values that lost diacritics somewhere in transit.
export function startModeLabel(value, t) {
  const mode = normalizeStartMode(value)

  if (mode === 'auto' || mode === 'automatic' || mode === 'automatski') {
    return t ? t('pdsu.startModeAutomatic') : 'Automatski'
  }

  if (mode === 'manual' || mode === 'ručno' || mode === 'rucno') {
    return t ? t('pdsu.startModeManual') : 'Ručno'
  }

  if (mode === 'disabled' || mode === 'isključen' || mode === 'iskljucen') {
    return t ? t('pdsu.startModeDisabled') : 'Isključen'
  }

  return value || (t ? t('pdsu.stateUnknown') : 'Nepoznato')
}

export function startModeBadgeClass(value) {
  const mode = normalizeStartMode(value)

  if (mode === 'auto' || mode === 'automatic' || mode === 'automatski') {
    return 'bg-accent text-white'
  }

  if (mode === 'manual' || mode === 'ručno' || mode === 'rucno') {
    return 'bg-warn text-white'
  }

  if (mode === 'disabled' || mode === 'isključen' || mode === 'iskljucen') {
    return 'bg-ink-muted text-white'
  }

  return 'bg-surface-sunken text-ink-secondary border border-line'
}
