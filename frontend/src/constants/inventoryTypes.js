export const INVENTORY_TYPE_OPTIONS = [
  { value: 'motherboard', label: 'Matična ploča' },
  { value: 'cpu', label: 'Procesor' },
  { value: 'ram', label: 'RAM memorija' },
  { value: 'hdd', label: 'HDD' },
  { value: 'ssd', label: 'SSD' },
  { value: 'psu', label: 'Napajanje' },
  { value: 'gpu', label: 'Grafička karta' },
  { value: 'nic', label: 'Mrežna kartica' },
  { value: 'case', label: 'Kućište' },
  { value: 'router', label: 'Ruter' },
  { value: 'switch', label: 'Svič' },
  { value: 'access-point', label: 'Access point' },
  { value: 'cable-network', label: 'LAN kabl' },
  { value: 'cable-power', label: 'Kabl za napajanje' },
  { value: 'cable-hdmi', label: 'HDMI kabl' },
  { value: 'connector-rj45', label: 'RJ45 konektor' },
  { value: 'tester-network', label: 'Mrežni tester' },
  { value: 'keyboard', label: 'Tastatura' },
  { value: 'mouse', label: 'Miš' },
  { value: 'other', label: 'Ostalo' },
]

export function labelForInventoryType(type) {
  const found = INVENTORY_TYPE_OPTIONS.find((x) => x.value === type)
  return found ? found.label : 'Oprema'
}
