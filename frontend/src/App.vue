<template>
  <RouterView />
</template>

<script setup>
import { watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

// router/index.js sets document.title only on navigation (beforeEach) -
// without this, changing the language on the Config page wouldn't refresh the tab title until
// the route is changed by hand.
const route = useRoute()
const { t, locale } = useI18n()
watch(locale, () => {
  if (route.meta?.titleKey) document.title = `${t(route.meta.titleKey)} - NetDesk`
})
</script>
