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

// Intl.RelativeTimeFormat lokalizuje "pre X" formulaciju sam (npr. srpski
// padeži "pre 2 minuta" vs "pre 5 minuta", ili engleski "2 minutes ago") -
// nema potrebe za ručnim t() ključevima po jedinici vremena. `locale` je
// i18n.global.locale.value ('sr'/'en') iz pozivaoca (Vue komponenta).
// 'sr-Latn' (ne golo 'sr') - bez toga Intl vrati ćirilicu, van stila
// ostatka (latiničnog) interfejsa. numeric: 'always' - bez toga Intl za
// male vrednosti vraća idiomatske reči ("juče", "prekjuče") umesto broja,
// nekonzistentno sa ostatkom formata.
export function fmtRelative(d, locale = 'sr') {
  if (!d) return '—'
  const t = new Date(d).getTime()
  if (isNaN(t)) return '—'
  const diffSec = Math.round((t - Date.now()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(locale === 'sr' ? 'sr-Latn' : locale, { numeric: 'always' })
  const abs = Math.abs(diffSec)
  if (abs < 45) return rtf.format(diffSec, 'second')
  const diffMin = Math.round(diffSec / 60)
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute')
  const diffHour = Math.round(diffMin / 60)
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, 'hour')
  const diffDay = Math.round(diffHour / 24)
  return rtf.format(diffDay, 'day')
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
