<template>
  <div class="glass-container space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">Preporuke za pakovanje</h1>
        <p class="text-sm text-slate-500 mt-1">
          Računari na Windows 10/11 sa slabim procesorom (Celeron/Pentium/Athlon i sl.), manje od 8GB RAM-a, običnim HDD-om umesto SSD-a, i/ili Lexar SSD-om (poznat red flag).
        </p>
      </div>
      <AppButton variant="secondary" to="/computers-for-repack">Nazad</AppButton>
    </div>

    <input
      v-model="search"
      type="text"
      placeholder="Pretraga po IP-u, imenu računara, odeljenju..."
      class="app-input w-full sm:w-96"
      aria-label="Pretraga preporuka za pakovanje"
    />

    <div class="flex flex-wrap items-center gap-4">
      <label class="inline-flex items-center gap-1.5 text-sm text-slate-600">
        Procesor:
        <select v-model="cpuTierFilter" class="app-input w-auto py-1 text-sm">
          <option value="">Svi</option>
          <option value="weak">Slab</option>
          <option value="strong">Jak</option>
          <option value="unknown">Nepoznat</option>
        </select>
      </label>

      <span class="hidden h-5 w-px bg-slate-200 sm:inline-block"></span>

      <label class="inline-flex items-center gap-1.5 text-sm text-slate-600">
        <input type="checkbox" v-model="reasonFilters" value="weak_cpu" />
        Slab procesor
      </label>
      <label class="inline-flex items-center gap-1.5 text-sm text-slate-600">
        <input type="checkbox" v-model="reasonFilters" value="low_ram" />
        Malo RAM-a
      </label>
      <label class="inline-flex items-center gap-1.5 text-sm text-slate-600">
        <input type="checkbox" v-model="reasonFilters" value="has_hdd" />
        Obični HDD
      </label>
      <label class="inline-flex items-center gap-1.5 text-sm text-slate-600">
        <input type="checkbox" v-model="reasonFilters" value="lexar_ssd" />
        Lexar SSD
      </label>
      <button v-if="reasonFilters.length || cpuTierFilter" type="button"
        @click="reasonFilters = []; cpuTierFilter = ''"
        class="text-xs text-blue-600 hover:underline">
        Poništi filter
      </button>
    </div>

    <p v-if="!loading" class="text-sm text-slate-500">Preporučeno: {{ filteredItems.length }}</p>

    <div v-if="loading" class="space-y-2">
      <div v-for="n in 6" :key="n" class="animate-pulse h-12 bg-white border border-slate-200 rounded-lg"></div>
    </div>
    <div v-else-if="loadError" class="text-red-600">{{ loadError }}</div>
    <div v-else-if="!filteredItems.length"
      class="rounded-xl border border-slate-200 bg-white shadow-sm p-8 text-center text-slate-500">
      Nema preporuka za pakovanje za zadatu pretragu.
    </div>

    <div v-else class="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="text-left text-slate-500 border-b border-slate-200 bg-slate-50">
            <th class="py-2 px-4">IP</th>
            <th class="py-2 px-4">Naziv računara</th>
            <th class="py-2 px-4">Odeljenje</th>
            <th class="py-2 px-4">OS</th>
            <th class="py-2 px-4">Procesor</th>
            <th class="py-2 px-4">RAM</th>
            <th class="py-2 px-4">Disk</th>
            <th class="py-2 px-4">Razlog</th>
            <th class="py-2 px-4"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in filteredItems" :key="e.id" class="border-b border-slate-100 hover:bg-slate-50">
            <td class="py-2 px-4 font-mono">{{ e.ip }}</td>
            <td class="py-2 px-4">{{ e.computerName || '—' }}</td>
            <td class="py-2 px-4">{{ e.department || '—' }}</td>
            <td class="py-2 px-4">{{ e.os || '—' }}</td>
            <td class="py-2 px-4">{{ e.cpuName || '—' }}</td>
            <td class="py-2 px-4">{{ e.ramGb != null ? `${e.ramGb} GB` : '—' }}</td>
            <td class="py-2 px-4">{{ diskLabel(e) }}</td>
            <td class="py-2 px-4">
              <div class="flex flex-wrap gap-1">
                <span v-if="e.reasons.includes('weak_cpu')"
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs border bg-amber-50 text-amber-700 border-amber-200">
                  Slab procesor
                </span>
                <span v-if="e.reasons.includes('low_ram')"
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs border bg-amber-50 text-amber-700 border-amber-200">
                  Malo RAM-a
                </span>
                <span v-if="e.reasons.includes('has_hdd')"
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs border bg-amber-50 text-amber-700 border-amber-200">
                  Obični HDD
                </span>
                <span v-if="e.reasons.includes('lexar_ssd')"
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs border bg-red-50 text-red-700 border-red-200"
                  title="Lexar SSD - poznat red flag (pouzdanost/otkazivanje)">
                  Lexar SSD
                </span>
              </div>
            </td>
            <td class="py-2 px-4 text-right whitespace-nowrap space-x-3">
              <RouterLink :to="`/ip/${e.id}/meta`" class="text-blue-600 hover:underline">
                Otvori
              </RouterLink>
              <span v-if="e.pendingRepack" class="text-slate-400">Već označeno</span>
              <button v-else type="button" class="text-emerald-700 hover:underline" @click="markForRepack(e)">
                Označi za pakovanje
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ToastNotification :message="toast" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { useCurrentSite } from '@/composables/useCurrentSite.js'
import { useToast } from '@/composables/useToast.js'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'

const site = useCurrentSite()
const { toast, showToast } = useToast()

const items = ref([])
const loading = ref(false)
const loadError = ref('')
const search = ref('')
// Prazno = bez filtera (prikaži sve razloge) - kad je bar jedan čekiran,
// prikazuje se PRESEK (računar mora imati SVE čekirane razloge, ne bilo koji
// od njih) - npr. čekiranje "Obični HDD" i "Malo RAM-a" pokazuje samo
// računare koji imaju OBA, ne one koji imaju bilo koji od ta dva.
const reasonFilters = ref([])
// Odvojeno od "Slab procesor" reason checkbox-a iznad - taj filtrira PO ČEMU
// je računar preporučen, ovaj filtrira PO STVARNOM tipu procesora bez obzira
// na razlog (npr. "Jak" pokazuje preporučene računare sa dobrim procesorom,
// ali npr. lošim RAM-om/HDD-om/Lexar SSD-om).
const cpuTierFilter = ref('')

const filteredItems = computed(() => {
  let list = items.value
  if (reasonFilters.value.length) {
    list = list.filter((e) => reasonFilters.value.every((r) => e.reasons.includes(r)))
  }
  if (cpuTierFilter.value) {
    list = list.filter((e) =>
      cpuTierFilter.value === 'unknown' ? e.cpuTier == null : e.cpuTier === cpuTierFilter.value,
    )
  }
  const q = search.value.trim().toLowerCase()
  if (q) {
    list = list.filter((e) =>
      [e.ip, e.computerName, e.department].some((v) => String(v || '').toLowerCase().includes(q)),
    )
  }
  return list
})

function diskLabel(e) {
  const labels = []
  if (e.hasHdd) labels.push('HDD')
  if (e.hasLexarSsd) labels.push('Lexar SSD')
  return labels.length ? labels.join(', ') : '—'
}

async function fetchData() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses/repack-recommendations?site=${site.value}`)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    items.value = await res.json()
  } catch (e) {
    console.error('Neuspešno dohvatanje preporuka za pakovanje', e)
    loadError.value = 'Greška pri učitavanju preporuka za pakovanje'
  } finally {
    loading.value = false
  }
}

async function markForRepack(entry) {
  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses/${entry.id}/pending-repack`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingRepack: true }),
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri označavanju za pakovanje'))
    entry.pendingRepack = true
    showToast('Računar označen za pakovanje')
  } catch (err) {
    console.error('Neuspešno označavanje za pakovanje', err)
    showToast(err?.message || 'Greška pri označavanju za pakovanje', { prefix: '❌ ', duration: 3000 })
  }
}

watch(site, fetchData)
onMounted(fetchData)
</script>
