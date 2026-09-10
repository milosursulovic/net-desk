import { createI18n } from 'vue-i18n'
import sr from './locales/sr.json'
import en from './locales/en.json'

const STORAGE_KEY = 'netdesk-lang'

export const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem(STORAGE_KEY) || 'sr',
  fallbackLocale: 'sr',
  messages: { sr, en },
})

// localStorage daje trenutan tačan render pri sledećem posetama istog
// browsera; ovo ažurira i sam vrednost i18n-a i keš kad se jezik promeni
// (na Konfiguraciji, ili kad main.js potvrdi vrednost iz baze pri pokretanju).
export function setAppLanguage(lang) {
  if (!lang || !i18n.global.availableLocales.includes(lang)) return
  i18n.global.locale.value = lang
  localStorage.setItem(STORAGE_KEY, lang)
}
