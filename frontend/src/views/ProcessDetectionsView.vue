<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">{{ t('processDetections.title') }}</h1>
        <p class="text-sm text-ink-muted mt-1">
          {{ t('processDetections.subtitle') }}
        </p>
      </div>
    </div>

    <div class="space-y-3">
      <!-- Pretraga -->
      <div class="relative">
        <input v-model="searchInput" @input="onSearchInput" type="text"
          :placeholder="t('processDetections.searchPlaceholder')"
          class="app-input w-full pr-10"
          :aria-label="t('processDetections.searchAriaLabel')" />
        <button v-if="searchInput" @click="clearSearch"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
          :aria-label="t('printers.clearSearchAriaLabel')">
          <NavIcon name="x" />
        </button>
      </div>

      <!-- Sortiranje -->
      <div class="flex flex-wrap items-center gap-2">
        <select v-model="sortBy" class="app-input w-auto py-1.5 text-sm">
          <option value="lastSeen">{{ t('processDetections.lastSeen') }}</option>
          <option value="firstSeen">{{ t('processDetections.firstSeen') }}</option>
          <option value="processName">{{ t('processDetections.process') }}</option>
          <option value="detectionCount">{{ t('processDetections.detectionCount') }}</option>
          <option value="killCount">{{ t('processDetections.killCount') }}</option>
          <option value="computerName">{{ t('repack.colComputerName') }}</option>
        </select>
        <button @click="sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'"
          class="px-2.5 py-1.5 border border-line rounded-lg text-sm hover:bg-surface-sunken"
          :title="sortOrder === 'asc' ? t('home.sortAsc') : t('home.sortDesc')"
          :aria-label="t('home.changeSortOrder')">
          <NavIcon :name="sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'" />
        </button>
      </div>

      <PaginationBar
        :page="page"
        :limit="limit"
        :total="total"
        :total-pages="totalPages"
        :loading="loading"
        :limit-options="[20, 50, 100]"
        @prev="prevPage"
        @next="nextPage({ total })"
        @update:limit="(v) => (limit = v)"
      />

      <p class="text-sm text-ink-muted">{{ t('home.shown', { shown: items.length, total }) }}</p>
    </div>

    <div class="table-shell">
      <div v-if="loading" class="space-y-2 p-4">
        <div v-for="n in 6" :key="n" class="animate-pulse h-8 bg-surface-sunken rounded-lg"></div>
      </div>

      <div v-else-if="!items.length" class="p-8 text-center text-ink-muted">
        {{ t('processDetections.noResults') }}
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="table-head-row">
              <th class="py-2 px-3 text-left">{{ t('processDetections.process') }}</th>
              <th class="py-2 px-3 text-left">{{ t('repack.colComputerName') }}</th>
              <th class="py-2 px-3 text-left">IP</th>
              <th class="py-2 px-3 text-left">{{ t('common.department') }}</th>
              <th class="py-2 px-3 text-left">{{ t('processDetections.firstSeen') }}</th>
              <th class="py-2 px-3 text-left">{{ t('processDetections.lastSeen') }}</th>
              <th class="py-2 px-3 text-right">{{ t('processDetections.detectionCount') }}</th>
              <th class="py-2 px-3 text-right">{{ t('processDetections.killCount') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in items" :key="row.id" class="border-b border-line last:border-0 hover:bg-surface-sunken">
              <td class="py-2 px-3 font-mono whitespace-nowrap text-ink">{{ row.processName }}</td>
              <td class="py-2 px-3">
                <RouterLink :to="`/ip/${row.ipEntryId}/meta`" class="text-accent hover:underline">
                  {{ row.computerName || '—' }}
                </RouterLink>
              </td>
              <td class="py-2 px-3 font-mono text-ink-secondary">{{ row.ip }}</td>
              <td class="py-2 px-3 text-ink-secondary">{{ row.department || '—' }}</td>
              <td class="py-2 px-3 whitespace-nowrap font-mono text-ink-muted">{{ fmtDate(row.firstSeen) }}</td>
              <td class="py-2 px-3 whitespace-nowrap font-mono text-ink-muted">{{ fmtDate(row.lastSeen) }}</td>
              <td class="py-2 px-3 text-right font-mono tabular-nums text-ink">{{ row.detectionCount }}</td>
              <td class="py-2 px-3 text-right font-mono tabular-nums">
                <span v-if="row.killCount" class="text-bad font-medium">{{ row.killCount }}</span>
                <span v-else class="text-ink-muted">0</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onBeforeUnmount, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { fmtDate as formatDate } from '@/utils/format.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import { useCurrentSite } from '@/composables/useCurrentSite.js'
import { useAbortableFetch } from '@/composables/useAbortableFetch.js'
import PaginationBar from '@/components/PaginationBar.vue'
import NavIcon from '@/components/NavIcon.vue'

const { t, locale } = useI18n()
const fmtDate = (d) => formatDate(d, locale.value === 'en' ? 'en-US' : 'sr-RS')
const site = useCurrentSite()
const { getSignal, abort } = useAbortableFetch()

const { page, limit, search, sortBy, sortOrder, nextPage, prevPage, applyServerPagination } =
  usePaginatedRoute({
    fields: {
      page: { type: 'int', default: 1 },
      limit: { type: 'int', default: 50 },
      search: { type: 'string', default: '', omitIfEmpty: true },
      sortBy: { type: 'string', default: 'lastSeen' },
      sortOrder: { type: 'string', default: 'desc' },
    },
    resetPageOn: ['search', 'sortBy', 'sortOrder'],
    useReplace: true,
  })

watch([page, limit, search, sortBy, sortOrder, site], fetchData)

const items = ref([])
const total = ref(0)
const totalPages = ref(0)
const loading = ref(false)
const searchInput = ref(search.value)

let searchT = null

async function fetchData() {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: page.value,
      limit: limit.value,
      search: search.value,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      site: site.value,
    })

    const res = await fetchWithAuth(`/api/protected/process-detections?${params.toString()}`, {
      signal: getSignal(),
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()

    items.value = data.items || []
    total.value = data.total ?? 0
    totalPages.value = data.totalPages ?? 0
    applyServerPagination(data)
  } catch (e) {
    if (e?.name !== 'AbortError') {
      console.error('Neuspešno dohvatanje detekcija procesa', e)
    }
  } finally {
    loading.value = false
  }
}

watch(search, (value) => {
  searchInput.value = value
})

const onSearchInput = () => {
  clearTimeout(searchT)
  searchT = setTimeout(() => {
    search.value = searchInput.value
  }, 300)
}
const clearSearch = () => {
  searchInput.value = ''
  onSearchInput()
}

onBeforeUnmount(() => {
  abort()
  clearTimeout(searchT)
})

onMounted(() => {
  fetchData()
})
</script>
