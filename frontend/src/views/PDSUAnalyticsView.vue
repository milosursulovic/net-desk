<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'

import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { downloadFromResponse } from '@/utils/download.js'
import { fmtDateSr } from '@/utils/format.js'
import { stateLabel, startModeLabel } from '@/utils/pdsuServiceLabels.js'
import { useAbortableFetch } from '@/composables/useAbortableFetch.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import { useCurrentSite } from '@/composables/useCurrentSite.js'
import { useToast } from '@/composables/useToast.js'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'

import PDSUOverview from '@/components/pdsu/PDSUOverview.vue'
import PDSUSoftware from '@/components/pdsu/PDSUSoftware.vue'
import PDSUDrivers from '@/components/pdsu/PDSUDrivers.vue'
import PDSUServices from '@/components/pdsu/PDSUServices.vue'
import PDSUUpdates from '@/components/pdsu/PDSUUpdates.vue'
import PDSUPrinters from '@/components/pdsu/PDSUPrinters.vue'
import PDSUFlagged from '@/components/pdsu/PDSUFlagged.vue'

const { toast, showToast } = useToast()
const site = useCurrentSite()

const loading = ref(false)
const exporting = ref(false)
const error = ref('')
const stats = ref(null)
const missingPdsu = ref([])
const exportingMissingPdf = ref(false)
const withoutUltravnc = ref([])
const exportingWithoutUltravncPdf = ref(false)

const activeTab = ref('overview')
const { search } = usePaginatedRoute({
  fields: {
    search: { type: 'string', default: '', omitIfEmpty: true },
  },
  useReplace: true,
})

const coverage = computed(() => stats.value?.coverage ?? {})
const software = computed(() => stats.value?.software ?? {})
const drivers = computed(() => stats.value?.drivers ?? {})
const services = computed(() => stats.value?.services ?? {})
const updates = computed(() => stats.value?.updates ?? {})
const printers = computed(() => stats.value?.printers ?? {})

const searchCategories = ['software', 'drivers', 'services', 'updates', 'printers']

const searchCategoryLabels = {
  software: 'Programi',
  drivers: 'Drajveri',
  services: 'Servisi',
  updates: 'Updates',
  printers: 'Štampači',
}

const searchColumnsMap = {
  software: [
    { label: 'Program', key: 'displayName' },
    { label: 'Verzija', key: 'displayVersion' },
    { label: 'Izdavač', key: 'publisher' },
  ],
  drivers: [
    { label: 'Uređaj', key: 'deviceName' },
    { label: 'Verzija drajvera', key: 'driverVersion' },
    { label: 'Proizvođač', key: 'manufacturer' },
  ],
  services: [
    { label: 'Naziv', key: 'displayName' },
    { label: 'Status', key: 'state' },
    { label: 'Način pokretanja', key: 'startMode' },
  ],
  updates: [
    { label: 'KB', key: 'hotfixId' },
    { label: 'Opis', key: 'description' },
    { label: 'Datum instalacije', key: 'installedOn' },
  ],
  printers: [
    { label: 'Naziv', key: 'name' },
    { label: 'Drajver', key: 'driverName' },
    { label: 'Status', key: 'status' },
  ],
}

const searchResults = ref({ software: [], drivers: [], services: [], updates: [], printers: [] })
const searchLoading = ref(false)
let searchTimer = null
const { getSignal } = useAbortableFetch()

const searchTotalCount = computed(() =>
  searchCategories.reduce((sum, cat) => sum + (searchResults.value[cat]?.length || 0), 0)
)

const nonEmptySearchCategories = computed(() =>
  searchCategories.filter((cat) => searchResults.value[cat]?.length)
)

const flaggedSoftware = ref([])
const flaggedServices = ref([])
const flaggedDrivers = ref([])

async function fetchFlagged() {
  try {
    const [swRes, svcRes, drvRes] = await Promise.all([
      fetchWithAuth('/api/protected/flagged/software'),
      fetchWithAuth('/api/protected/flagged/services'),
      fetchWithAuth('/api/protected/flagged/drivers'),
    ])
    flaggedSoftware.value = swRes.ok ? (await swRes.json()).items || [] : []
    flaggedServices.value = svcRes.ok ? (await svcRes.json()).items || [] : []
    flaggedDrivers.value = drvRes.ok ? (await drvRes.json()).items || [] : []
  } catch (err) {
    console.error('Greška pri učitavanju neželjenih programa/servisa/drajvera:', err)
  }
}

function isSoftwareFlagged(item) {
  return flaggedSoftware.value.some(
    (f) =>
      f.displayName.toLowerCase() === String(item.displayName || '').toLowerCase() &&
      (f.publisher ?? '').toLowerCase() === String(item.publisher || '').toLowerCase(),
  )
}

function isServiceFlagged(item) {
  return flaggedServices.value.some(
    (f) => f.name.toLowerCase() === String(item.name || '').toLowerCase(),
  )
}

function isDriverFlagged(item) {
  return flaggedDrivers.value.some(
    (f) =>
      f.deviceName.toLowerCase() === String(item.deviceName || '').toLowerCase() &&
      (f.driverProviderName ?? '').toLowerCase() === String(item.driverProviderName || '').toLowerCase(),
  )
}

async function flagSoftware(item) {
  try {
    const res = await fetchWithAuth('/api/protected/flagged/software', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: item.displayName, publisher: item.publisher }),
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri označavanju programa'))
    await fetchFlagged()
    showToast('Program označen kao neželjen')
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri označavanju programa', { prefix: '❌ ', duration: 3000 })
  }
}

async function flagService(item) {
  try {
    const res = await fetchWithAuth('/api/protected/flagged/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: item.name, displayName: item.displayName }),
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri označavanju servisa'))
    await fetchFlagged()
    showToast('Servis označen kao neželjen')
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri označavanju servisa', { prefix: '❌ ', duration: 3000 })
  }
}

async function flagDriver(item) {
  try {
    const res = await fetchWithAuth('/api/protected/flagged/drivers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceName: item.deviceName, driverProviderName: item.driverProviderName }),
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri označavanju drajvera'))
    await fetchFlagged()
    showToast('Drajver označen kao neželjen')
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri označavanju drajvera', { prefix: '❌ ', duration: 3000 })
  }
}

async function removeFlaggedSoftware(id) {
  try {
    const res = await fetchWithAuth(`/api/protected/flagged/software/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri uklanjanju'))
    await fetchFlagged()
    showToast('Uklonjeno sa liste neželjenih')
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri uklanjanju', { prefix: '❌ ', duration: 3000 })
  }
}

async function removeFlaggedService(id) {
  try {
    const res = await fetchWithAuth(`/api/protected/flagged/services/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri uklanjanju'))
    await fetchFlagged()
    showToast('Uklonjeno sa liste neželjenih')
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri uklanjanju', { prefix: '❌ ', duration: 3000 })
  }
}

async function removeFlaggedDriver(id) {
  try {
    const res = await fetchWithAuth(`/api/protected/flagged/drivers/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri uklanjanju'))
    await fetchFlagged()
    showToast('Uklonjeno sa liste neželjenih')
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri uklanjanju', { prefix: '❌ ', duration: 3000 })
  }
}

function cellValue(item, key) {
  const value = item?.[key]
  if (value == null || value === '') return '—'
  if (key === 'installedOn') return fmtDateSr(value)
  if (key === 'state') return stateLabel(value)
  if (key === 'startMode') return startModeLabel(value)
  return value
}

async function runSearch() {
  const query = search.value.trim()

  if (!query) {
    searchResults.value = { software: [], drivers: [], services: [], updates: [], printers: [] }
    return
  }

  searchLoading.value = true

  try {
    const params = new URLSearchParams({ category: 'all', q: query, site: site.value })
    const res = await fetchWithAuth(`/api/protected/pdsu-analytics/search?${params.toString()}`, {
      signal: getSignal(),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    searchResults.value = {
      software: Array.isArray(data.software) ? data.software : [],
      drivers: Array.isArray(data.drivers) ? data.drivers : [],
      services: Array.isArray(data.services) ? data.services : [],
      updates: Array.isArray(data.updates) ? data.updates : [],
      printers: Array.isArray(data.printers) ? data.printers : [],
    }
  } catch (err) {
    if (err?.name !== 'AbortError') {
      console.error('PDSU pretraga greška:', err)
      searchResults.value = { software: [], drivers: [], services: [], updates: [], printers: [] }
    }
  } finally {
    searchLoading.value = false
  }
}

watch(
  [search, site],
  () => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(runSearch, 300)
  },
  { immediate: true }
)

onBeforeUnmount(() => clearTimeout(searchTimer))

async function loadStats() {
  loading.value = true
  error.value = ''

  try {
    const response = await fetchWithAuth(`/api/protected/pdsu-analytics/stats?site=${site.value}`)

    if (!response.ok) {
      const message = await parseError(response, 'Greška prilikom učitavanja PDSU analitike.')

      throw new Error(message)
    }

    stats.value = await response.json()
    await fetchMissingPdsu()
    await fetchWithoutUltravnc()
  } catch (err) {
    console.error('PDSU analytics error:', err)

    error.value = err?.message || 'Greška prilikom učitavanja PDSU analitike.'
  } finally {
    loading.value = false
  }
}

async function fetchMissingPdsu() {
  try {
    const res = await fetchWithAuth(`/api/protected/pdsu-analytics/missing?site=${site.value}`)
    if (!res.ok) return
    const data = await res.json()
    missingPdsu.value = Array.isArray(data.items) ? data.items : []
  } catch {
  }
}

async function exportMissingPdsuPdf() {
  exportingMissingPdf.value = true
  try {
    const dateStamp = new Date().toISOString().slice(0, 10)
    await downloadFromResponse(
      await fetchWithAuth(`/api/protected/pdsu-analytics/missing/export-pdf?site=${site.value}`),
      `NetDesk_bez_PDSU_${dateStamp}.pdf`
    )
  } catch (err) {
    console.error('Export bez PDSU greška:', err)
  } finally {
    exportingMissingPdf.value = false
  }
}

async function fetchWithoutUltravnc() {
  try {
    const res = await fetchWithAuth(`/api/protected/pdsu-analytics/without-ultravnc?site=${site.value}`)
    if (!res.ok) return
    const data = await res.json()
    withoutUltravnc.value = Array.isArray(data.items) ? data.items : []
  } catch {
  }
}

async function exportWithoutUltravncPdf() {
  exportingWithoutUltravncPdf.value = true
  try {
    const dateStamp = new Date().toISOString().slice(0, 10)
    await downloadFromResponse(
      await fetchWithAuth(`/api/protected/pdsu-analytics/without-ultravnc/export-pdf?site=${site.value}`),
      `NetDesk_bez_UltraVNC_${dateStamp}.pdf`
    )
  } catch (err) {
    console.error('Export bez UltraVNC greška:', err)
  } finally {
    exportingWithoutUltravncPdf.value = false
  }
}

async function exportXlsx() {
  exporting.value = true

  try {
    const dateStamp = new Date().toISOString().slice(0, 10)
    await downloadFromResponse(
      await fetchWithAuth(`/api/protected/pdsu-analytics/export-xlsx?site=${site.value}`),
      `NetDesk_PDSU_${dateStamp}.xlsx`
    )
  } catch (err) {
    console.error('PDSU export greška:', err)
  } finally {
    exporting.value = false
  }
}

onMounted(() => {
  loadStats()
  fetchFlagged()
})

watch(site, loadStats)
</script>

<template>
  <div class="glass-container">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">PDSU analitika</h1>

        <p class="text-sm text-slate-500 mt-1">
          Centralni pregled programa, drajvera, servisa, Windows update podataka i štampača.
          Prikazani su samo računari (Aparati su isključeni iz analitike).
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <AppButton variant="secondary" :disabled="exporting || loading || !stats" @click="exportXlsx">
          <span v-if="exporting" class="pdsu-spinner" role="status" aria-hidden="true" />
          <span>{{ exporting ? 'Izvoz...' : 'Izvezi XLSX' }}</span>
        </AppButton>

        <AppButton variant="primary" :disabled="loading" @click="loadStats">
          <span v-if="loading" class="pdsu-spinner" role="status" aria-hidden="true" />
          <span>{{ loading ? 'Osvežavanje...' : 'Osveži' }}</span>
        </AppButton>
      </div>
    </div>

    <div v-if="loading && !stats" class="pdsu-state-card">
      <div class="pdsu-spinner pdsu-spinner-lg mb-3" role="status">
        <span class="sr-only">Učitavanje...</span>
      </div>

      <h2 class="text-lg font-bold text-slate-900 mb-2">Učitavanje PDSU analitike</h2>

      <p class="text-slate-500 mb-0">
        Prikupljamo statistiku programa, drajvera, servisa i update podataka.
      </p>
    </div>

    <div v-else-if="error && !stats" class="pdsu-state-card">
      <div class="pdsu-error-icon">!</div>

      <h2 class="text-lg font-bold text-slate-900 mb-2">Podaci nisu učitani</h2>

      <p class="text-slate-500 mb-4">
        {{ error }}
      </p>

      <AppButton variant="primary" :disabled="loading" @click="loadStats">
        Pokušaj ponovo
      </AppButton>
    </div>

    <template v-else>
      <div v-if="error" class="pdsu-alert" role="alert">
        {{ error }}
      </div>

      <div class="pdsu-card mb-4">
        <div class="p-4 flex items-center gap-2">
          <input
            v-model="search"
            type="text"
            class="app-input w-full"
            placeholder="Pretraži programe, drajvere, servise, update-e i štampače u celoj bazi..."
          />

          <button
            v-if="search"
            type="button"
            class="shrink-0 text-slate-400 hover:text-slate-600"
            title="Obriši pretragu"
            @click="search = ''"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Rezultati pretrage - cela baza, sve 4 kategorije -->
      <div v-if="search.trim()">
        <div v-if="searchLoading" class="pdsu-state-card mb-4">
          <div class="pdsu-spinner pdsu-spinner-lg mb-3" role="status">
            <span class="sr-only">Pretraživanje...</span>
          </div>
          <p class="text-slate-500 mb-0">Pretražujem programe, drajvere, servise, update-e i štampače...</p>
        </div>

        <template v-else>
          <div v-if="searchTotalCount === 0" class="pdsu-state-card mb-4">
            <h2 class="text-lg font-bold text-slate-900 mb-2">Nema rezultata</h2>
            <p class="text-slate-500 mb-0">
              Ništa ne odgovara pojmu "{{ search.trim() }}" ni u jednoj kategoriji.
            </p>
          </div>

          <template v-else>
            <div
              v-for="cat in nonEmptySearchCategories"
              :key="cat"
              class="pdsu-card mb-4"
            >
              <div class="pdsu-card-header flex items-center justify-between gap-3">
                <h5 class="pdsu-card-title">{{ searchCategoryLabels[cat] }}</h5>

                <span class="pdsu-badge bg-blue-600 text-white">
                  {{ searchResults[cat].length }}{{ searchResults[cat].length >= 50 ? '+' : '' }}
                </span>
              </div>

              <div class="pdsu-table-wrap">
                <table class="pdsu-table">
                  <thead>
                    <tr>
                      <th>Računar</th>
                      <th>IP</th>
                      <th>Odeljenje</th>
                      <th v-for="col in searchColumnsMap[cat]" :key="col.key">{{ col.label }}</th>
                      <th v-if="cat === 'software' || cat === 'services' || cat === 'drivers'"></th>
                    </tr>
                  </thead>

                  <tbody>
                    <tr v-for="(item, idx) in searchResults[cat]" :key="idx">
                      <td class="font-semibold text-slate-900">
                        {{ item.computerName || 'Nepoznat računar' }}
                      </td>

                      <td>
                        <code class="pdsu-code">{{ item.ip || '—' }}</code>
                      </td>

                      <td>{{ item.department || '—' }}</td>

                      <td v-for="col in searchColumnsMap[cat]" :key="col.key">
                        {{ cellValue(item, col.key) }}
                      </td>

                      <td v-if="cat === 'software'" class="text-right">
                        <span v-if="isSoftwareFlagged(item)" class="pdsu-badge bg-red-600 text-white">
                          ✓ Već označeno
                        </span>
                        <button
                          v-else
                          type="button"
                          class="text-red-600 hover:underline text-sm whitespace-nowrap"
                          @click="flagSoftware(item)"
                        >
                          🚫 Označi kao neželjen
                        </button>
                      </td>

                      <td v-else-if="cat === 'services'" class="text-right">
                        <span v-if="isServiceFlagged(item)" class="pdsu-badge bg-red-600 text-white">
                          ✓ Već označeno
                        </span>
                        <button
                          v-else
                          type="button"
                          class="text-red-600 hover:underline text-sm whitespace-nowrap"
                          @click="flagService(item)"
                        >
                          🚫 Označi kao neželjen
                        </button>
                      </td>

                      <td v-else-if="cat === 'drivers'" class="text-right">
                        <span v-if="isDriverFlagged(item)" class="pdsu-badge bg-red-600 text-white">
                          ✓ Već označeno
                        </span>
                        <button
                          v-else
                          type="button"
                          class="text-red-600 hover:underline text-sm whitespace-nowrap"
                          @click="flagDriver(item)"
                        >
                          🚫 Označi kao neželjen
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </template>
        </template>
      </div>

      <!-- Normalan dashboard prikaz kad se ne pretražuje -->
      <template v-else>
        <nav class="pdsu-tabs" aria-label="PDSU kategorije">
          <button
            type="button"
            class="pdsu-tab"
            :class="{ 'pdsu-tab-active': activeTab === 'overview' }"
            @click="activeTab = 'overview'"
          >
            <span class="pdsu-tab-icon">◫</span>
            <span>Pregled</span>
          </button>

          <button
            type="button"
            class="pdsu-tab"
            :class="{ 'pdsu-tab-active': activeTab === 'software' }"
            @click="activeTab = 'software'"
          >
            <span class="pdsu-tab-icon">P</span>
            <span>Programi</span>
          </button>

          <button
            type="button"
            class="pdsu-tab"
            :class="{ 'pdsu-tab-active': activeTab === 'drivers' }"
            @click="activeTab = 'drivers'"
          >
            <span class="pdsu-tab-icon">D</span>
            <span>Drajveri</span>
          </button>

          <button
            type="button"
            class="pdsu-tab"
            :class="{ 'pdsu-tab-active': activeTab === 'services' }"
            @click="activeTab = 'services'"
          >
            <span class="pdsu-tab-icon">S</span>
            <span>Servisi</span>
          </button>

          <button
            type="button"
            class="pdsu-tab"
            :class="{ 'pdsu-tab-active': activeTab === 'updates' }"
            @click="activeTab = 'updates'"
          >
            <span class="pdsu-tab-icon">U</span>
            <span>Updates</span>
          </button>

          <button
            type="button"
            class="pdsu-tab"
            :class="{ 'pdsu-tab-active': activeTab === 'printers' }"
            @click="activeTab = 'printers'"
          >
            <span class="pdsu-tab-icon">Š</span>
            <span>Štampači</span>
          </button>

          <button
            type="button"
            class="pdsu-tab"
            :class="{ 'pdsu-tab-active': activeTab === 'flagged' }"
            @click="activeTab = 'flagged'"
          >
            <span class="pdsu-tab-icon">⚠</span>
            <span>Neželjeni</span>
          </button>
        </nav>

        <section class="pdsu-content">
          <Transition name="pdsu-fade" mode="out-in">
            <PDSUOverview
              v-if="activeTab === 'overview'"
              key="overview"
              :coverage="coverage"
              :software="software"
              :drivers="drivers"
              :services="services"
              :updates="updates"
              :printers="printers"
              :missing-computers="missingPdsu"
              :exporting-missing="exportingMissingPdf"
              @export-missing="exportMissingPdsuPdf"
              :without-ultravnc="withoutUltravnc"
              :exporting-without-ultravnc="exportingWithoutUltravncPdf"
              @export-without-ultravnc="exportWithoutUltravncPdf"
            />

            <PDSUSoftware
              v-else-if="activeTab === 'software'"
              key="software"
              :software="software"
            />

            <PDSUDrivers
              v-else-if="activeTab === 'drivers'"
              key="drivers"
              :drivers="drivers"
            />

            <PDSUServices
              v-else-if="activeTab === 'services'"
              key="services"
              :services="services"
            />

            <PDSUUpdates
              v-else-if="activeTab === 'updates'"
              key="updates"
              :updates="updates"
            />

            <PDSUPrinters
              v-else-if="activeTab === 'printers'"
              key="printers"
              :printers="printers"
            />

            <PDSUFlagged
              v-else-if="activeTab === 'flagged'"
              key="flagged"
              :flagged-software="flaggedSoftware"
              :flagged-services="flaggedServices"
              :flagged-drivers="flaggedDrivers"
              @remove-software="removeFlaggedSoftware"
              @remove-service="removeFlaggedService"
              @remove-driver="removeFlaggedDriver"
            />
          </Transition>
        </section>
      </template>
    </template>

    <ToastNotification :message="toast" />
  </div>
</template>