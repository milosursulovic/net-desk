<template>
  <RouterView />
</template>

<script setup>
import { watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

// router/index.js postavlja document.title samo pri navigaciji (beforeEach) -
// bez ovoga, promena jezika na Konfiguraciji ne bi osvežila tab naslov dok
// se ručno ne promeni ruta.
const route = useRoute()
const { t, locale } = useI18n()
watch(locale, () => {
  if (route.meta?.titleKey) document.title = `${t(route.meta.titleKey)} - NetDesk`
})
</script>
