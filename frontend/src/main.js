import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

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
app.mount('#app')

sessionStorage.removeItem('netdesk-reload-on-preload-error')
