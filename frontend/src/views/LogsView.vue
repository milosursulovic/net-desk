<template>
  <div class="glass-container">
    <h1 class="text-2xl font-bold text-slate-800 mb-4">Logovi</h1>

    <div class="mb-4 flex flex-wrap gap-2">
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

    <div class="overflow-x-auto rounded-xl border bg-white shadow-sm">
      <table class="min-w-full text-sm">
        <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th class="px-4 py-3">Vreme</th>
            <th class="px-4 py-3">Korisnik</th>
            <th class="px-4 py-3">Akcija</th>
            <th class="px-4 py-3">IP adresa</th>
            <th class="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr v-for="entry in entries" :key="entry.id">
            <td class="px-4 py-3 text-slate-500 whitespace-nowrap">{{ fmtDate(entry.createdAt) }}</td>
            <td class="px-4 py-3 font-medium">{{ entry.username || '—' }}</td>
            <td class="px-4 py-3 font-mono text-xs">{{ entry.action }}</td>
            <td class="px-4 py-3 text-slate-500">{{ entry.ipAddress || '—' }}</td>
            <td class="px-4 py-3">
              <span
                class="rounded-full border px-2 py-0.5 text-xs"
                :class="statusClass(entry.statusCode)"
              >
                {{ entry.statusCode ?? '—' }}
              </span>
            </td>
          </tr>
          <tr v-if="!loading && !entries.length">
            <td colspan="5" class="px-4 py-8 text-center text-slate-500">Nema zapisa.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <button @click="prevPage" :disabled="page === 1"
        class="px-2 py-1 bg-white border rounded-lg disabled:opacity-50 hover:bg-slate-100">
        ⬅️
      </button>
      <span class="text-sm text-slate-600">Strana {{ page }} / {{ totalPages || 1 }} ({{ total }} ukupno)</span>
      <button @click="nextPage({ totalPages })" :disabled="page >= totalPages"
        class="px-2 py-1 bg-white border rounded-lg disabled:opacity-50 hover:bg-slate-100">
        ➡️
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { fmtDate as formatDate } from '@/utils/format.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'

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

function statusClass(status) {
  if (!status) return 'bg-slate-50 text-slate-500 border-slate-200'
  if (status >= 500) return 'bg-red-50 text-red-700 border-red-200'
  if (status >= 400) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-green-50 text-green-700 border-green-200'
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
