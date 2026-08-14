<template>
  <div class="glass-container space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">Slobodne IP adrese</h1>
        <p class="text-sm text-slate-500 mt-1">
          {{ labelForSite(site) }} — opseg {{ rangeLabel }}
        </p>
      </div>
      <AppButton variant="neutral" @click="goBack">Nazad</AppButton>
    </div>

    <div v-if="!loading" class="flex flex-wrap gap-4 text-sm text-slate-600">
      <span>Ukupno u opsegu: <strong>{{ total }}</strong></span>
      <span>Zauzeto: <strong>{{ occupiedCount }}</strong></span>
      <span>Slobodno: <strong class="text-emerald-700">{{ freeIps.length }}</strong></span>
      <span v-if="rangedIps.size" class="flex items-center gap-1.5">
        <span class="inline-block h-3 w-3 rounded-sm bg-emerald-50 border border-emerald-200"></span>
        deo niza od bar 2 uzastopne adrese
      </span>
    </div>

    <input
      v-model="search"
      type="text"
      placeholder="Pretraga po IP-u (npr. 10.230.62.5)..."
      class="app-input w-full sm:w-72"
      aria-label="Pretraga slobodnih IP adresa"
    />

    <div v-if="loading" class="text-slate-600">Učitavanje…</div>
    <div v-else-if="loadError" class="text-red-600">{{ loadError }}</div>
    <div v-else-if="!filteredIps.length"
      class="rounded-xl border border-slate-200 bg-white shadow-sm p-8 text-center text-slate-500">
      Nema slobodnih adresa za zadatu pretragu.
    </div>

    <template v-else>
      <div class="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="text-left text-slate-500 border-b border-slate-200 bg-slate-50">
              <th class="py-2 px-4">IP adresa</th>
              <th class="py-2 px-4"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ip in pagedIps" :key="ip" class="border-b border-slate-100 hover:bg-slate-100"
              :class="rangedIps.has(ip) ? 'bg-emerald-50' : ''"
              :title="rangedIps.has(ip) ? 'Deo niza od bar 2 uzastopne slobodne adrese' : ''"
            >
              <td class="py-2 px-4 font-mono">{{ ip }}</td>
              <td class="py-2 px-4 text-right">
                <RouterLink :to="{ path: '/add', query: { site, ip } }" class="text-blue-600 hover:underline text-xs">
                  Dodaj
                </RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button @click="page = Math.max(1, page - 1)" :disabled="page === 1"
          class="px-2 py-1 bg-white border rounded-lg disabled:opacity-50 hover:bg-slate-100" aria-label="Prethodna strana">
          ⬅️
        </button>
        <span class="text-sm text-slate-600">Strana {{ page }} / {{ totalPages }}</span>
        <button @click="page = Math.min(totalPages, page + 1)" :disabled="page >= totalPages"
          class="px-2 py-1 bg-white border rounded-lg disabled:opacity-50 hover:bg-slate-100" aria-label="Sledeća strana">
          ➡️
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { useCurrentSite } from '@/composables/useCurrentSite.js'
import { labelForSite } from '@/constants/sites.js'
import AppButton from '@/components/AppButton.vue'

// Samo za prikaz - stvarni opseg (mrežna+1 do broadcast-1) se računa na
// serveru (ipAddresses.service.js).
const SITE_RANGE_LABELS = {
  bolnica: '10.230.62.0/23',
  dom_zdravlja: '10.160.64.0/21',
}

const router = useRouter()
const site = useCurrentSite()
const rangeLabel = computed(() => SITE_RANGE_LABELS[site.value] || '—')

const loading = ref(false)
const loadError = ref('')
const total = ref(0)
const occupiedCount = ref(0)
const freeIps = ref([])
const search = ref('')
const page = ref(1)
const limit = 100

function ipToNum(ip) {
  return ip.split('.').reduce((acc, octet) => acc * 256 + Number(octet), 0)
}

// freeIps dolazi već sortiran uzlazno po numeričkoj vrednosti (backend ih
// enumeriše redom kroz opseg) - dovoljno je uporediti susedne stavke u nizu,
// bez ponovnog sortiranja. "Opseg" = bar 2 UZASTOPNE slobodne adrese (razlika
// tačno 1) - izolovana slobodna adresa (npr. ...1, ...3, ...5, sve
// isprekidane) se namerno NE boji, to nije opseg koji se može dodeliti u nizu.
const rangedIps = computed(() => {
  const marked = new Set()
  const ips = freeIps.value
  let runStart = 0
  for (let i = 1; i <= ips.length; i++) {
    const continuesRun = i < ips.length && ipToNum(ips[i]) === ipToNum(ips[i - 1]) + 1
    if (!continuesRun) {
      if (i - runStart >= 2) {
        for (let j = runStart; j < i; j++) marked.add(ips[j])
      }
      runStart = i
    }
  }
  return marked
})

const filteredIps = computed(() => {
  const q = search.value.trim()
  if (!q) return freeIps.value
  return freeIps.value.filter((ip) => ip.includes(q))
})
const totalPages = computed(() => Math.max(1, Math.ceil(filteredIps.value.length / limit)))
const pagedIps = computed(() => {
  const start = (page.value - 1) * limit
  return filteredIps.value.slice(start, start + limit)
})

watch(search, () => {
  page.value = 1
})

const goBack = () => router.push('/')

async function fetchData() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses/free?site=${site.value}`)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    total.value = data.total ?? 0
    occupiedCount.value = data.occupiedCount ?? 0
    freeIps.value = data.freeIps || []
    page.value = 1
  } catch (e) {
    console.error('Neuspešno dohvatanje slobodnih IP adresa', e)
    loadError.value = 'Greška pri učitavanju slobodnih IP adresa'
  } finally {
    loading.value = false
  }
}

watch(site, fetchData)
onMounted(fetchData)
</script>
