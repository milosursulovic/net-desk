// Centralized mapping of status values to the semantic "tones"
// (good/bad/warn/info/neutral) that StatusPill.vue draws - before this,
// every view had its own copy-pasted version (connectivityBadgeClass in
// AgentsView.vue, the same logic duplicated in AgentDetailView.vue, etc.).
// "Manager" is deliberately mapped to "info" everywhere (badge/tab/panel) instead of
// a separate indigo color - it stays within the same set of 4 semantic colors.

export const CONNECTIVITY_LABELS = {
  online: 'Online',
  stale: 'Neaktivan',
  offline: 'Offline',
  unknown: 'Nepoznato',
}

export function connectivityTone(status) {
  if (status === 'online') return 'good'
  if (status === 'stale') return 'warn'
  if (status === 'offline') return 'bad'
  return 'neutral'
}

export function connectivityLabel(status, t) {
  if (!t) return CONNECTIVITY_LABELS[status] || 'Nepoznato'
  if (status === 'online') return t('common.online')
  if (status === 'stale') return t('agents.stale')
  if (status === 'offline') return t('common.offline')
  return t('pdsu.stateUnknown')
}

export function agentStatusTone(status) {
  return status === 'active' ? 'good' : 'neutral'
}

export function agentStatusLabel(status, t) {
  if (!t) return status === 'active' ? 'Aktivan' : 'Povučen'
  return status === 'active' ? t('agents.badgeActive') : t('agents.badgeRevoked')
}

const JOB_STATUS_LABELS = {
  pending: 'Na čekanju',
  sent: 'Poslato',
  completed: 'Završeno',
  failed: 'Neuspešno',
  cancelled: 'Otkazano',
}

export function jobStatusTone(status) {
  if (status === 'completed') return 'good'
  if (status === 'failed') return 'bad'
  if (status === 'cancelled') return 'neutral'
  if (status === 'sent' || status === 'pending') return 'warn'
  return 'neutral'
}

export function jobStatusLabel(status) {
  return JOB_STATUS_LABELS[status] || status || '—'
}

export function eventLevelTone(level) {
  const l = String(level || '').toLowerCase()
  if (l === 'error' || l === 'critical') return 'bad'
  if (l === 'warning' || l === 'warn') return 'warn'
  if (l === 'information' || l === 'info') return 'info'
  return 'neutral'
}
