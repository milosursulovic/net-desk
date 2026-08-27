<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">Računari bez agenta</h1>
      <div class="flex flex-wrap items-center gap-2">
        <AppButton
          variant="secondary"
          :disabled="!total || exportingPdf"
          @click="exportPdf"
        >
          {{ exportingPdf ? 'Izvoz…' : 'Izvezi PDF' }}
        </AppButton>
        <AppButton variant="secondary" to="/agents">Nazad na agente</AppButton>
      </div>
    </div>

    <div class="space-y-3">
      <!-- Pretraga -->
      <div class="relative">
        <input v-model="searchInput" @input="onSearchInput" type="text"
          placeholder="Pretraga po IP-u ili nazivu računara..."
          class="app-input w-full pr-10"
          aria-label="Pretraga računara bez agenta" />
        <button v-if="searchInput" @click="clearSearch"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
          aria-label="Obriši pretragu">
          <NavIcon name="x" />
        </button>
      </div>

      <PaginationBar
        :page="page"
        :limit="limit"
        :total="total"
        :total-pages="totalPages"
        :loading="loading"
        @prev="prevPage"
        @next="nextPage({ total })"
        @update:limit="(v) => (limit = v)"
      />

      <p class="text-sm text-ink-muted">Prikazano {{ items.length }} od {{ total }} računara</p>
    </div>

    <div class="table-shell">
      <div v-if="loading" class="space-y-2 p-4">
        <div v-for="n in 6" :key="n" class="animate-pulse h-8 bg-surface-sunken rounded-lg"></div>
      </div>

      <div v-else-if="!items.length" class="p-8 text-center text-ink-muted">
        Svi računari imaju aktivnog agenta.
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="table-head-row">
              <th class="py-2 px-3 text-left">IP</th>
              <th class="py-2 px-3 text-left">Naziv računara</th>
              <th class="py-2 px-3 text-left">Odeljenje</th>
              <th class="py-2 px-3 text-left">OS</th>
              <th class="py-2 px-3 text-left">Online</th>
              <th class="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in items" :key="e.id" class="border-b border-line last:border-0 hover:bg-surface-sunken">
              <td class="py-2 px-3 font-mono text-ink">{{ e.ip }}</td>
              <td class="py-2 px-3 text-ink-secondary">{{ e.computerName || '—' }}</td>
              <td class="py-2 px-3 text-ink-secondary">{{ e.department || '—' }}</td>
              <td class="py-2 px-3 text-ink-secondary">{{ e.os || '—' }}</td>
              <td class="py-2 px-3">
                <StatusPill :status="e.isOnline ? 'good' : 'neutral'" :label="e.isOnline ? 'Online' : 'Offline'" />
              </td>
              <td class="py-2 px-3 text-right">
                <RouterLink :to="`/ip/${e.id}/meta`" class="text-accent hover:underline">
                  Otvori
                </RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { downloadFromResponse } from '@/utils/download.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import { useCurrentSite } from '@/composables/useCurrentSite.js'
import { useAbortableFetch } from '@/composables/useAbortableFetch.js'
import AppButton from '@/components/AppButton.vue'
import StatusPill from '@/components/StatusPill.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import NavIcon from '@/components/NavIcon.vue'

const { getSignal, abort } = useAbortableFetch()
const site = useCurrentSite()

const { page, limit, search, nextPage, prevPage, applyServerPagination } =
  usePaginatedRoute({
    fields: {
      page: { type: 'int', default: 1 },
      limit: { type: 'int', default: 20 },
      search: { type: 'string', default: '', omitIfEmpty: true },
    },
    resetPageOn: ['search'],
    useReplace: true,
  })

watch([page, limit, search, site], fetchData)

const items = ref([])
const total = ref(0)
const totalPages = ref(0)
const searchInput = ref(search.value)
const loading = ref(false)
const exportingPdf = ref(false)

async function exportPdf() {
  exportingPdf.value = true
  try {
    const params = new URLSearchParams({ search: search.value, site: site.value })
    const dateStamp = new Date().toISOString().slice(0, 10)
    await downloadFromResponse(
      await fetchWithAuth(`/api/protected/agents/without-agent-computers/export-pdf?${params.toString()}`),
      `NetDesk_bez_agenta_${dateStamp}.pdf`
    )
  } catch (e) {
    console.error('Export bez agenta greška:', e)
  } finally {
    exportingPdf.value = false
  }
}

let searchT = null

async function fetchData() {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: page.value,
      limit: limit.value,
      search: search.value,
      site: site.value,
    })

    const res = await fetchWithAuth(`/api/protected/agents/without-agent-computers?${params.toString()}`, {
      signal: getSignal(),
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()

    items.value = data.entries || []
    total.value = data.total ?? 0
    totalPages.value = data.totalPages ?? 0
    applyServerPagination(data)
  } catch (e) {
    if (e?.name !== 'AbortError') {
      console.error('Neuspešno dohvatanje računara bez agenta', e)
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
