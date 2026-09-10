// Centralizovano mapiranje status-vrednosti na semantičke "tonove"
// (good/bad/warn/info/neutral) koje StatusPill.vue crta - pre ovoga je
// svaki view imao sopstvenu copy-pasted verziju (connectivityBadgeClass u
// AgentsView.vue, ista logika duplirana u AgentDetailView.vue, itd).
// "Manager" se namerno mapira na "info" svuda (bedž/tab/panel) umesto
// zasebne indigo boje - drži se u istom skupu od 4 semantičke boje.

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
