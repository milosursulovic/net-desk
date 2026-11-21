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

// localStorage gives an immediately correct render on subsequent visits from the same
// browser; this updates both the i18n value itself and the cache when the language changes
// (on the Config page, or when main.js confirms the value from the DB at startup).
export function setAppLanguage(lang) {
  if (!lang || !i18n.global.availableLocales.includes(lang)) return
  i18n.global.locale.value = lang
  localStorage.setItem(STORAGE_KEY, lang)
}
