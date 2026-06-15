import { downloadBlob } from '@/utils/download.js'

export function generateRdpContent(entry) {
  return `
full address:s:${entry.ip}
username:s:${entry.username || ''}
prompt for credentials:i:1
authentication level:i:2
redirectclipboard:i:1
redirectprinters:i:0
redirectcomports:i:0
redirectsmartcards:i:0
`.trim()
}

export function downloadRdpFile(entry) {
  const blob = new Blob([generateRdpContent(entry)], { type: 'application/x-rdp' })
  downloadBlob(blob, `${entry.computerName || entry.ip}.rdp`)
}
