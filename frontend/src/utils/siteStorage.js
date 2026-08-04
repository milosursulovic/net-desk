// Lokacija (Bolnica/Dom zdravlja) i dalje živi u URL query param-u kao izvor
// istine na svakoj strani (linkovi ostaju deljivi/tačni) - localStorage je
// samo fallback za kad URL nema ?site= (svež tab, bookmark bez query-ja),
// da korisnik ne mora svaki put ručno da bira lokaciju. Router guard
// (router/index.js) čita/piše ovo, ne komponente direktno.
const STORAGE_KEY = 'netdesk_last_site'

export function getRememberedSite() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    // localStorage nedostupan (privatni mod, kvota) - ćutke nastavi bez memorije.
    return null
  }
}

export function rememberSite(site) {
  try {
    localStorage.setItem(STORAGE_KEY, site)
  } catch {
    // vidi komentar iznad
  }
}
