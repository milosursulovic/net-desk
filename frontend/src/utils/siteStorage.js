// The site (Bolnica/Dom zdravlja) still lives in the URL query param as the source
// of truth on every page (links stay shareable/accurate) - localStorage is
// only a fallback for when the URL has no ?site= (a fresh tab, a bookmark without a query),
// so the user doesn't have to pick the site by hand every time. The router guard
// (router/index.js) reads/writes this, not components directly.
const STORAGE_KEY = 'netdesk_last_site'

export function getRememberedSite() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    // localStorage unavailable (private mode, quota) - silently continue without memory.
    return null
  }
}

export function rememberSite(site) {
  try {
    localStorage.setItem(STORAGE_KEY, site)
  } catch {
    // see the comment above
  }
}
