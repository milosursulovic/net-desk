export async function parseError(res, fallback = 'Greška na serveru') {
  const err = await res.json().catch(() => ({}))
  return err.message || err.error || fallback
}
