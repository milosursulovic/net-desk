export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function downloadFromResponse(res, filename) {
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  downloadBlob(blob, filename)
}
