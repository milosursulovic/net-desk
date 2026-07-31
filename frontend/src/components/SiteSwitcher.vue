<template>
  <button
    v-if="currentSite"
    type="button"
    class="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-3 text-xs font-medium text-slate-600 transition-colors hover:text-slate-800 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
    title="Promeni lokaciju"
    @click="switchSite"
  >
    <span>{{ currentSite === 'bolnica' ? '🏥' : '⛑️' }}</span>
    <span>{{ label }}</span>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { labelForSite, isValidSite } from '@/constants/sites.js'

const route = useRoute()
const router = useRouter()

const currentSite = computed(() => (isValidSite(route.query.site) ? route.query.site : null))
const label = computed(() => labelForSite(currentSite.value))

function switchSite() {
  const returnTo = encodeURIComponent(route.fullPath)
  router.push(`/select-site?returnTo=${returnTo}`)
}
</script>
