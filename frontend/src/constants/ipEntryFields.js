export const IPV4_REGEX = /^\d{1,3}(\.\d{1,3}){3}$/

export const IP_ENTRY_DEFAULTS = {
  ip: '',
  computerName: '',
  rdpApp: '',
  os: '',
  department: '',
  site: '',
  description: '',
  entryType: null,
}

// labelKey instead of label - translation happens in the component (t(field.labelKey)),
// this file is plain JS with no access to the i18n instance.
export const IP_ENTRY_FIELDS = [
  { name: 'ip', labelKey: 'ipFields.ip', required: true },
  { name: 'computerName', labelKey: 'ipFields.computerName' },
  { name: 'rdpApp', labelKey: 'ipFields.rdpApp' },
  { name: 'os', labelKey: 'ipFields.os' },
  { name: 'department', labelKey: 'ipFields.department' },
  { name: 'description', labelKey: 'ipFields.description' },
]

export const IP_OPTIONAL_FIELDS = IP_ENTRY_FIELDS.filter((f) => f.name !== 'ip')

export function createIpEntryForm(overrides = {}) {
  return { ...IP_ENTRY_DEFAULTS, ...overrides }
}

// `t` (vue-i18n) is passed in from the component - this function is plain JS with no
// access to the i18n instance.
export function validateIpv4(ip, { required = false, t } = {}) {
  if (!ip) return required ? t('ipFields.required') : null
  return IPV4_REGEX.test(ip) ? null : t('ipFields.invalid')
}
