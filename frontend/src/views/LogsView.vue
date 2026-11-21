<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">{{ t('nav.logs') }}</h1>

    <div class="flex flex-wrap items-end gap-2">
      <select v-model="category" class="app-input w-auto text-sm" :aria-label="t('logs.category')">
        <option value="all">{{ t('logs.catAll') }}</option>
        <option value="vnc">{{ t('logs.catVnc') }}</option>
        <option value="auth">{{ t('logs.catAuth') }}</option>
        <option value="requests">{{ t('logs.catRequests') }}</option>
        <option value="other">{{ t('logs.catOther') }}</option>
      </select>
      <input
        v-model="username"
        type="text"
        :placeholder="t('logs.usernameFilterPlaceholder')"
        class="app-input w-auto text-sm"
      />
      <input
        v-model="action"
        type="text"
        :placeholder="t('logs.actionFilterPlaceholder')"
        class="app-input w-auto text-sm"
      />
      <label class="flex flex-col text-xs text-ink-muted">
        {{ t('logs.dateFrom') }}
        <input v-model="dateFrom" type="date" class="app-input w-auto text-sm" />
      </label>
      <label class="flex flex-col text-xs text-ink-muted">
        {{ t('logs.dateTo') }}
        <input v-model="dateTo" type="date" class="app-input w-auto text-sm" />
      </label>
      <button
        type="button"
        :disabled="exporting"
        class="px-3 py-2 bg-surface border border-line rounded-lg text-sm disabled:opacity-50 hover:bg-surface-sunken"
        @click="exportLogs"
      >
        {{ exporting ? t('logs.exporting') : t('logs.exportXlsx') }}
      </button>
    </div>

    <div class="table-shell overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead class="table-head-row">
          <tr>
            <th class="px-4 py-3 text-left">{{ t('logs.colTime') }}</th>
            <th class="px-4 py-3 text-left">{{ t('logs.colUser') }}</th>
            <th class="px-4 py-3 text-left">{{ t('logs.colAction') }}</th>
            <th class="px-4 py-3 text-left">{{ t('logs.colIp') }}</th>
            <th class="px-4 py-3 text-left">{{ t('home.colStatus') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in entries" :key="entry.id" class="border-b border-line last:border-0 hover:bg-surface-sunken">
            <td class="px-4 py-3 font-mono text-ink-muted whitespace-nowrap">{{ fmtDate(entry.createdAt) }}</td>
            <td class="px-4 py-3 font-medium text-ink">{{ entry.username || '—' }}</td>
            <td class="px-4 py-3 font-mono text-xs text-ink-secondary">
              <div>{{ entry.action }}</div>
              <div
                v-if="entry.details"
                class="mt-0.5 max-w-xs truncate text-ink-muted"
                :title="entry.details"
              >
                {{ entry.details }}
              </div>
            </td>
            <td class="px-4 py-3 font-mono text-ink-secondary">{{ entry.ipAddress || '—' }}</td>
            <td class="px-4 py-3">
              <StatusPill :status="statusTone(entry.statusCode)" :label="String(entry.statusCode ?? '—')" :dot="false" />
            </td>
          </tr>
          <tr v-if="!loading && !entries.length">
            <td colspan="5" class="px-4 py-8 text-center text-ink-muted">{{ t('logs.noEntries') }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button @click="prevPage" :disabled="page === 1"
        class="px-2 py-1 bg-surface border border-line rounded-lg disabled:opacity-50 hover:bg-surface-sunken">
        <NavIcon name="chevron-left" />
      </button>
      <span class="text-sm text-ink-secondary font-mono">{{ t('logs.pageOfTotal', { page, total: totalPages || 1, count: total }) }}</span>
      <button @click="nextPage({ totalPages })" :disabled="page >= totalPages"
        class="px-2 py-1 bg-surface border border-line rounded-lg disabled:opacity-50 hover:bg-surface-sunken">
        <NavIcon name="chevron-right" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { fmtDate as formatDate } from '@/utils/format.js'
import { downloadFromResponse } from '@/utils/download.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import StatusPill from '@/components/StatusPill.vue'
import NavIcon from '@/components/NavIcon.vue'

const { t, locale } = useI18n()
const { page, limit, nextPage, prevPage, applyServerPagination } = usePaginatedRoute({
  fields: {
    page: { type: 'int', default: 1 },
    limit: { type: 'int', default: 50 },
  },
  useReplace: true,
})

const fmtDate = (d) => formatDate(d, locale.value === 'en' ? 'en-US' : 'sr-RS')

const username = ref('')
const action = ref('')
const category = ref('all')
const dateFrom = ref('')
const dateTo = ref('')
const entries = ref([])
const total = ref(0)
const totalPages = ref(0)
const loading = ref(false)
const exporting = ref(false)

// Deljeno izmedju liste i export-a - isti filteri idu na oba endpointa.
function filterParams() {
  const p = new URLSearchParams()
  if (username.value) p.set('username', username.value)
  if (action.value) p.set('action', action.value)
  if (category.value && category.value !== 'all') p.set('category', category.value)
  if (dateFrom.value) p.set('dateFrom', dateFrom.value)
  if (dateTo.value) p.set('dateTo', dateTo.value)
  return p
}

function statusTone(status) {
  if (!status) return 'neutral'
  if (status >= 500) return 'bad'
  if (status >= 400) return 'warn'
  return 'good'
}

async function fetchData() {
  loading.value = true
  const params = filterParams()
  params.set('page', String(page.value))
  params.set('limit', String(limit.value))

  try {
    const res = await fetchWithAuth(`/api/protected/activity-log?${params.toString()}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()

    entries.value = data.items || []
    total.value = data.total ?? 0
    totalPages.value = data.totalPages ?? 0
    applyServerPagination(data)
  } catch (e) {
    console.error('Neuspešno učitavanje logova:', e)
    entries.value = []
  } finally {
    loading.value = false
  }
}

async function exportLogs() {
  exporting.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/activity-log/export?${filterParams().toString()}`)
    const filename = `activity-log_${new Date().toISOString().slice(0, 10)}.xlsx`
    await downloadFromResponse(res, filename)
  } catch (e) {
    console.error('Neuspešan izvoz logova:', e)
    alert(t('logs.exportError'))
  } finally {
    exporting.value = false
  }
}

let debounceTimer
watch([username, action, category, dateFrom, dateTo], () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    page.value = 1
    fetchData()
  }, 300)
})
watch([page, limit], fetchData)

onMounted(fetchData)
</script>
