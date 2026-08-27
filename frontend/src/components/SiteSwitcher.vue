<template>
  <div
    v-if="currentSite"
    class="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-line bg-surface-sunken p-1"
    role="tablist"
    aria-label="Lokacija"
  >
    <button
      v-for="option in SITE_OPTIONS"
      :key="option.value"
      type="button"
      role="tab"
      :aria-selected="option.value === currentSite"
      class="rounded-md px-3 py-1 text-sm font-semibold transition-colors"
      :class="option.value === currentSite ? 'bg-accent text-white shadow-sm' : 'text-ink-secondary hover:bg-line hover:text-ink'"
      @click="selectSite(option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SITE_OPTIONS, isValidSite } from '@/constants/sites.js'

const route = useRoute()
const router = useRouter()

const currentSite = computed(() => (isValidSite(route.query.site) ? route.query.site : null))

function selectSite(site) {
  if (site === currentSite.value) return
  router.push({ path: route.path, query: { ...route.query, site } })
}
</script>
