export const SITE_OPTIONS = [
  { value: 'bolnica', label: 'Bolnica' },
  { value: 'dom_zdravlja', label: 'Dom zdravlja' },
]

export const SITE_VALUES = SITE_OPTIONS.map((o) => o.value)

export function labelForSite(value) {
  const found = SITE_OPTIONS.find((o) => o.value === value)
  return found ? found.label : value || 'Nepoznato'
}

export function isValidSite(value) {
  return SITE_VALUES.includes(value)
}
