import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { i18n, setAppLanguage } from './i18n/index.js'

// Vite hashes JS chunk names on every build (e.g. AgentsView-XXXX.js).
// If a user leaves a tab open across a redeploy and then clicks a lazily
// loaded route, dynamic import() tries to fetch the OLD, no longer existing
// file - the server (the SPA catch-all in app.js) answers that with index.html (200,
// text/html) instead of a 404, and the browser refuses to execute JS with the MIME type
// text/html ("Failed to load module script..."). The page stays
// stuck until the user refreshes by hand - this does the same automatically.
// A sessionStorage flag prevents an infinite loop if the server is really
// broken (not just a stale cache after a redeploy); it's cleared as soon as the app successfully
// mounts, so the next REAL redeploy again gets its one reload.
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

// The language from localStorage (or the Serbian default) is applied right above so the first
// render doesn't "flicker" - this fetch only confirms/corrects that value against the DB
// (e.g. the first time in this browser, or after a change from another device).
// Deliberately without auth - the login screen needs the right language too.
fetch(`${import.meta.env.VITE_API_URL}/api/language`)
  .then((res) => (res.ok ? res.json() : null))
  .then((data) => data?.language && setAppLanguage(data.language))
  .catch(() => {})
