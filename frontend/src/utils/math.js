export function sum(arr) {
  return arr.reduce((a, b) => a + (Number(b) || 0), 0)
}

export function avg(arr) {
  return arr.length ? sum(arr) / arr.length : 0
}

export function median(arr) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function round1(n) {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0
}

export function joinNonEmpty(arr, sep) {
  return arr.filter(Boolean).join(sep)
}

export function maxOf(arr) {
  return arr.length ? Math.max(...arr) : 0
}

export function barWidth(value, maximum, { minVisible = 2 } = {}) {
  const safeValue = Number(value) || 0
  const safeMaximum = Number(maximum) || 1
  if (safeValue <= 0) return 0
  return Math.max(minVisible, Math.min(100, (safeValue / safeMaximum) * 100))
}

export function groupCount(items) {
  const map = new Map()
  for (const it of items) {
    const k = it == null || it === '' ? '—' : String(it)
    map.set(k, (map.get(k) || 0) + 1)
  }
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
}
