<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'

import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { downloadFromResponse } from '@/utils/download.js'
import { fmtDateSr } from '@/utils/format.js'
import { stateLabel, startModeLabel } from '@/utils/pdsuServiceLabels.js'
import { useAbortableFetch } from '@/composables/useAbortableFetch.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import AppButton from '@/components/AppButton.vue'

import PDSUOverview from '@/components/pdsu/PDSUOverview.vue'
import PDSUSoftware from '@/components/pdsu/PDSUSoftware.vue'
import PDSUDrivers from '@/components/pdsu/PDSUDrivers.vue'
import PDSUServices from '@/components/pdsu/PDSUServices.vue'
import PDSUUpdates from '@/components/pdsu/PDSUUpdates.vue'

const loading = ref(false)
const exporting = ref(false)
const error = ref('')
const stats = ref(null)

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

const searchCategories = ['software', 'drivers', 'services', 'updates']

const searchCategoryLabels = {
  software: 'Programi',
  drivers: 'Drajveri',
  services: 'Servisi',
  updates: 'Updates',
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
}

const searchResults = ref({ software: [], drivers: [], services: [], updates: [] })
const searchLoading = ref(false)
let searchTimer = null
const { getSignal } = useAbortableFetch()

const searchTotalCount = computed(() =>
  searchCategories.reduce((sum, cat) => sum + (searchResults.value[cat]?.length || 0), 0)
)

const nonEmptySearchCategories = computed(() =>
  searchCategories.filter((cat) => searchResults.value[cat]?.length)
)

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
    searchResults.value = { software: [], drivers: [], services: [], updates: [] }
    return
  }

  searchLoading.value = true

  try {
    const params = new URLSearchParams({ category: 'all', q: query })
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
    }
  } catch (err) {
    if (err?.name !== 'AbortError') {
      console.error('PDSU pretraga greška:', err)
      searchResults.value = { software: [], drivers: [], services: [], updates: [] }
    }
  } finally {
    searchLoading.value = false
  }
}

watch(
  search,
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
    const response = await fetchWithAuth('/api/protected/pdsu-analytics/stats')

    if (!response.ok) {
      const message = await parseError(response, 'Greška prilikom učitavanja PDSU analitike.')

      throw new Error(message)
    }

    stats.value = await response.json()
  } catch (err) {
    console.error('PDSU analytics error:', err)

    error.value = err?.message || 'Greška prilikom učitavanja PDSU analitike.'
  } finally {
    loading.value = false
  }
}

async function exportXlsx() {
  exporting.value = true

  try {
    const dateStamp = new Date().toISOString().slice(0, 10)
    await downloadFromResponse(
      await fetchWithAuth('/api/protected/pdsu-analytics/export-xlsx'),
      `NetDesk_PDSU_${dateStamp}.xlsx`
    )
  } catch (err) {
    console.error('PDSU export greška:', err)
  } finally {
    exporting.value = false
  }
}

onMounted(loadStats)
</script>

<template>
  <div class="glass-container">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">PDSU analitika</h1>

        <p class="text-sm text-slate-500 mt-1">
          Centralni pregled programa, drajvera, servisa i Windows update podataka.
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
          <span v-else>↻</span>
          <span>{{ loading ? 'Osvežavanje...' : 'Osveži podatke' }}</span>
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
            placeholder="Pretraži programe, drajvere, servise i update-e u celoj bazi..."
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
          <p class="text-slate-500 mb-0">Pretražujem programe, drajvere, servise i update-e...</p>
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
          </Transition>
        </section>
      </template>
    </template>
  </div>
</template>