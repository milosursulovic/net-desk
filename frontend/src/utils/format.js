export function fmtDate(d, locale) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt)) return '—'
  return locale ? dt.toLocaleString(locale) : dt.toLocaleString()
}

export function fmtDateOnly(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt) ? '—' : dt.toLocaleDateString()
}

export function fmtRelative(d) {
  if (!d) return '—'
  const t = new Date(d).getTime()
  if (isNaN(t)) return '—'
  const diff = Date.now() - t
  const s = Math.floor(diff / 1000)
  if (s < 45) return 'pre par sekundi'
  const m = Math.floor(s / 60)
  if (m < 60) return `pre ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `pre ${h} h`
  const days = Math.floor(h / 24)
  return `pre ${days} d`
}

export function fmtGb(n) {
  return n || n === 0 ? `${n} GB` : '—'
}

export function fmtTb(n) {
  return n || n === 0 ? `${n} TB` : '—'
}

export function fmtPct(n) {
  return n || n === 0 ? `${n}%` : '—'
}

export function fmtMbps(n) {
  return n || n === 0 ? `${n} Mbps` : '—'
}

export function safe(v) {
  return v ?? '—'
}

export function shortSerial(s) {
  if (!s) return ''
  if (s.length <= 10) return s
  return `${s.slice(0, 4)}…${s.slice(-4)}`
}

export function fmtNumberSr(value, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('sr-RS', { maximumFractionDigits }).format(Number(value) || 0)
}

export function fmtDateSr(value, { includeTime = false } = {}) {
  if (!value) return 'Nema podataka'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Nema podataka'
  return new Intl.DateTimeFormat('sr-RS', {
    dateStyle: 'medium',
    ...(includeTime ? { timeStyle: 'short' } : {}),
  }).format(date)
}
