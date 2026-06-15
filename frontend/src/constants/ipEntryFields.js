export const IPV4_REGEX = /^\d{1,3}(\.\d{1,3}){3}$/

export const IP_ENTRY_DEFAULTS = {
  ip: '',
  computerName: '',
  username: '',
  fullName: '',
  password: '',
  rdp: '',
  rdpApp: '',
  os: '',
  heliantInstalled: '',
  department: '',
  description: '',
}

export const IP_ENTRY_FIELDS = [
  { name: 'ip', label: 'IP Adresa', required: true },
  { name: 'computerName', label: 'Ime računara' },
  { name: 'username', label: 'Korisničko ime' },
  { name: 'fullName', label: 'Puno ime' },
  { name: 'password', label: 'Lozinka' },
  { name: 'rdp', label: 'RDP' },
  { name: 'rdpApp', label: 'RDP App' },
  { name: 'os', label: 'Sistem' },
  { name: 'heliantInstalled', label: 'Heliant Instaliran?' },
  { name: 'department', label: 'Odeljenje' },
  { name: 'description', label: 'Opis' },
]

export const IP_OPTIONAL_FIELDS = IP_ENTRY_FIELDS.filter((f) => f.name !== 'ip')

export function createIpEntryForm(overrides = {}) {
  return { ...IP_ENTRY_DEFAULTS, ...overrides }
}

export function validateIpv4(ip, { required = false } = {}) {
  if (!ip) return required ? 'IP je obavezan' : null
  return IPV4_REGEX.test(ip) ? null : 'Neispravna IPv4 adresa'
}
