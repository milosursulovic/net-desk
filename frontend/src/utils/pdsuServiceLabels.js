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

export function stateLabel(value) {
  const state = normalizeState(value)

  if (state === 'running') {
    return 'Pokrenut'
  }

  if (state === 'stopped') {
    return 'Zaustavljen'
  }

  if (state === 'paused') {
    return 'Pauziran'
  }

  return value || 'Nepoznato'
}

export function stateBadgeClass(value) {
  const state = normalizeState(value)

  if (state === 'running') {
    return 'bg-green-600 text-white'
  }

  if (state === 'stopped') {
    return 'bg-red-600 text-white'
  }

  if (state === 'paused') {
    return 'bg-amber-500 text-amber-950'
  }

  return 'bg-slate-500 text-white'
}

// Matches both English (raw WMI StartMode values) and Serbian (already
// translated/manually entered values) so this stays correct regardless of
// which form the data arrived in; the ASCII rucno/iskljucen variants cover
// values that lost diacritics somewhere in transit.
export function startModeLabel(value) {
  const mode = normalizeStartMode(value)

  if (mode === 'auto' || mode === 'automatic' || mode === 'automatski') {
    return 'Automatski'
  }

  if (mode === 'manual' || mode === 'ručno' || mode === 'rucno') {
    return 'Ručno'
  }

  if (mode === 'disabled' || mode === 'isključen' || mode === 'iskljucen') {
    return 'Isključen'
  }

  return value || 'Nepoznato'
}

export function startModeBadgeClass(value) {
  const mode = normalizeStartMode(value)

  if (mode === 'auto' || mode === 'automatic' || mode === 'automatski') {
    return 'bg-blue-600 text-white'
  }

  if (mode === 'manual' || mode === 'ručno' || mode === 'rucno') {
    return 'bg-amber-500 text-amber-950'
  }

  if (mode === 'disabled' || mode === 'isključen' || mode === 'iskljucen') {
    return 'bg-slate-500 text-white'
  }

  return 'bg-slate-100 text-slate-700 border border-slate-200'
}
