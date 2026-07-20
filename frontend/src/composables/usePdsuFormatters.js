import { fmtNumberSr, fmtDateSr } from '@/utils/format.js'
import { barWidth as sharedBarWidth } from '@/utils/math.js'

export function usePdsuFormatters() {
  function formatNumber(value, maximumFractionDigits = 0) {
    return fmtNumberSr(value, maximumFractionDigits)
  }

  function formatDate(value, includeTime = false) {
    return fmtDateSr(value, { includeTime })
  }

  function barWidth(value, maximum) {
    return sharedBarWidth(value, maximum)
  }

  function splitValues(value) {
    if (!value) {
      return []
    }

    return String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return { formatNumber, formatDate, barWidth, splitValues }
}
