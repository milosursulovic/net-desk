<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">Logovi</h1>

    <div class="flex flex-wrap gap-2">
      <input
        v-model="username"
        type="text"
        placeholder="Filter po korisničkom imenu…"
        class="app-input w-auto text-sm"
      />
      <input
        v-model="action"
        type="text"
        placeholder="Filter po akciji (npr. login, DELETE, /printers…)"
        class="app-input w-auto text-sm"
      />
    </div>

    <div class="table-shell overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead class="table-head-row">
          <tr>
            <th class="px-4 py-3 text-left">Vreme</th>
            <th class="px-4 py-3 text-left">Korisnik</th>
            <th class="px-4 py-3 text-left">Akcija</th>
            <th class="px-4 py-3 text-left">IP adresa</th>
            <th class="px-4 py-3 text-left">Status</th>
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
            <td colspan="5" class="px-4 py-8 text-center text-ink-muted">Nema zapisa.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button @click="prevPage" :disabled="page === 1"
        class="px-2 py-1 bg-surface border border-line rounded-lg disabled:opacity-50 hover:bg-surface-sunken">
        <NavIcon name="chevron-left" />
      </button>
      <span class="text-sm text-ink-secondary font-mono">Strana {{ page }} / {{ totalPages || 1 }} ({{ total }} ukupno)</span>
      <button @click="nextPage({ totalPages })" :disabled="page >= totalPages"
        class="px-2 py-1 bg-surface border border-line rounded-lg disabled:opacity-50 hover:bg-surface-sunken">
        <NavIcon name="chevron-right" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { fmtDate as formatDate } from '@/utils/format.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import StatusPill from '@/components/StatusPill.vue'
import NavIcon from '@/components/NavIcon.vue'

const { page, limit, nextPage, prevPage, applyServerPagination } = usePaginatedRoute({
  fields: {
    page: { type: 'int', default: 1 },
    limit: { type: 'int', default: 50 },
  },
  useReplace: true,
})

const fmtDate = (d) => formatDate(d, 'sr-RS')

const username = ref('')
const action = ref('')
const entries = ref([])
const total = ref(0)
const totalPages = ref(0)
const loading = ref(false)

function statusTone(status) {
  if (!status) return 'neutral'
  if (status >= 500) return 'bad'
  if (status >= 400) return 'warn'
  return 'good'
}

async function fetchData() {
  loading.value = true
  const params = new URLSearchParams({
    page: String(page.value),
    limit: String(limit.value),
  })
  if (username.value) params.set('username', username.value)
  if (action.value) params.set('action', action.value)

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

let debounceTimer
watch([username, action], () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    page.value = 1
    fetchData()
  }, 300)
})
watch([page, limit], fetchData)

onMounted(fetchData)
</script>
