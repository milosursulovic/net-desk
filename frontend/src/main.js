import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { i18n, setAppLanguage } from './i18n/index.js'

// Vite hešuje imena JS chunk-ova pri svakom build-u (npr. AgentsView-XXXX.js).
// Ako korisnik ostavi tab otvoren preko redeploy-a pa klikne na lenjo
// učitanu rutu, dynamic import() pokuša da preuzme STARI, više nepostojeći
// fajl - server (SPA catch-all u app.js) na to odgovara sa index.html (200,
// text/html) umesto 404, a browser odbije da izvrši JS sa MIME tipom
// text/html ("Failed to load module script..."). Stranica ostane
// zaglavljena dok korisnik ručno ne osveži - ovo isto uradi automatski.
// sessionStorage flag sprečava beskonačnu petlju ako je server stvarno
// pokvaren (ne samo stale keš posle redeploy-a); briše se čim app uspešno
// montira, da sledeći PRAVI redeploy opet dobije svoj jedan reload.
window.addEventListener('vite:preloadError', () => {
  if (!sessionStorage.getItem('netdesk-reload-on-preload-error')) {
    sessionStorage.setItem('netdesk-reload-on-preload-error', '1')
    window.location.reload()
  }
})

const app = createApp(App)

app.use(router)
app.use(i18n)
app.mount('#app')

sessionStorage.removeItem('netdesk-reload-on-preload-error')

// Jezik iz localStorage-a (ili srpski default) se primeni odmah gore da prvi
// render ne "trepne" - ovaj fetch samo potvrdi/ispravi tu vrednost prema bazi
// (npr. prvi put u ovom browseru, ili posle promene sa drugog uređaja).
// Namerno bez auth-a - ekran za prijavu takođe treba pravi jezik.
fetch(`${import.meta.env.VITE_API_URL}/api/language`)
  .then((res) => (res.ok ? res.json() : null))
  .then((data) => data?.language && setAppLanguage(data.language))
  .catch(() => {})
