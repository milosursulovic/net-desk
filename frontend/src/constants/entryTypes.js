export const ENTRY_TYPE_OPTIONS = [
  { value: 'computer', label: 'Računar' },
  { value: 'device', label: 'Aparat' },
]

export function labelForEntryType(value) {
  const found = ENTRY_TYPE_OPTIONS.find((o) => o.value === value)
  return found ? found.label : 'Nepoznato'
}
