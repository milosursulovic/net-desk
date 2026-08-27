<template>
  <div class="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 py-12">
    <div class="mb-10 flex items-center gap-2 text-2xl font-bold text-accent" style="font-family: var(--font-display)">
      <img :src="Icon" alt="NetDesk" class="h-8 w-8" />
      <span>NetDesk</span>
    </div>

    <h1 class="mb-2 text-center text-2xl font-bold text-ink" style="font-family: var(--font-display)">Izaberite lokaciju</h1>
    <p class="mb-10 text-center text-sm text-ink-muted">
      Podaci (IP adrese, PDSU, metapodaci, štampači...) su odvojeni po fizičkoj lokaciji.
    </p>

    <div class="grid w-full max-w-2xl grid-cols-1 gap-5 sm:grid-cols-2">
      <button
        v-for="option in SITE_OPTIONS"
        :key="option.value"
        type="button"
        class="group flex flex-col items-center gap-3 rounded-2xl border-2 border-line bg-surface px-6 py-10 text-center shadow-sm transition hover:border-accent hover:shadow-md"
        @click="selectSite(option.value)"
      >
        <span
          class="flex h-14 w-14 items-center justify-center rounded-full bg-accent-subtle text-2xl transition group-hover:brightness-95"
        >
          {{ option.value === 'bolnica' ? '🏥' : '⛑️' }}
        </span>
        <span class="text-lg font-semibold text-ink">{{ option.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { useRouter, useRoute } from 'vue-router'
import { SITE_OPTIONS } from '@/constants/sites.js'
import Icon from '@/assets/icons/netdesk.png'

const router = useRouter()
const route = useRoute()

function selectSite(site) {
  const returnTo = route.query.returnTo ? String(route.query.returnTo) : '/'
  const [path, search] = returnTo.split('?')
  const query = Object.fromEntries(new URLSearchParams(search || ''))
  router.push({ path, query: { ...query, site } })
}
</script>
