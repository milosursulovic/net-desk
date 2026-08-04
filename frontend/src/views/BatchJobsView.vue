<template>
  <div class="glass-container space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">Istorija batch komandi</h1>
        <p class="text-sm text-slate-500 mt-1">Komande poslate na više agenata odjednom</p>
      </div>
      <AppButton variant="neutral" to="/agents">Nazad na agente</AppButton>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <label class="text-sm text-slate-600" for="pp">Po strani</label>
      <select id="pp" v-model.number="limit" class="app-input w-auto py-1.5 text-sm">
        <option :value="10">10</option>
        <option :value="20">20</option>
        <option :value="50">50</option>
      </select>

      <span class="mx-1 hidden h-5 w-px bg-slate-200 sm:inline-block"></span>

      <button @click="prevPage" :disabled="page === 1 || loading"
        class="px-2 py-1 bg-white border rounded-lg disabled:opacity-50 hover:bg-slate-100" aria-label="Prethodna strana">
        ⬅️
      </button>
      <span class="text-sm text-slate-600">Strana {{ totalPages === 0 ? '0' : page }} / {{ totalPages }}</span>
      <button @click="nextPage({ totalPages })" :disabled="page >= totalPages || loading"
        class="px-2 py-1 bg-white border rounded-lg disabled:opacity-50 hover:bg-slate-100" aria-label="Sledeća strana">
        ➡️
      </button>
    </div>

    <div v-if="loading" class="text-slate-600">Učitavanje…</div>
    <div v-else-if="!items.length" class="rounded-xl border border-slate-200 bg-white shadow-sm p-8 text-center text-slate-500">
      Još nema poslatih batch komandi.
    </div>

    <div v-else class="space-y-2">
      <RouterLink
        v-for="b in items"
        :key="b.batchId"
        :to="`/agent-batches/${b.batchId}`"
        class="block rounded-lg border bg-white p-3 text-sm hover:shadow-md transition"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="font-medium">{{ COMMAND_LABELS[b.commandType] || b.commandType }}</div>
          <span class="text-xs text-slate-500">{{ fmtDate(b.createdAt) }}</span>
        </div>
        <div class="mt-2 flex flex-wrap gap-2">
          <span class="rounded-full border px-2 py-0.5 text-xs bg-slate-50 text-slate-600 border-slate-200">
            Ukupno: {{ b.total }}
          </span>
          <span v-if="b.pendingCount" class="rounded-full border px-2 py-0.5 text-xs bg-slate-50 text-slate-600 border-slate-200">
            Na čekanju: {{ b.pendingCount }}
          </span>
          <span v-if="b.sentCount" class="rounded-full border px-2 py-0.5 text-xs bg-blue-50 text-blue-700 border-blue-200">
            Poslato: {{ b.sentCount }}
          </span>
          <span v-if="b.completedCount" class="rounded-full border px-2 py-0.5 text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
            Završeno: {{ b.completedCount }}
          </span>
          <span v-if="b.failedCount" class="rounded-full border px-2 py-0.5 text-xs bg-red-50 text-red-700 border-red-200">
            Neuspešno: {{ b.failedCount }}
          </span>
          <span v-if="b.cancelledCount" class="rounded-full border px-2 py-0.5 text-xs bg-slate-100 text-slate-500 border-slate-200">
            Otkazano: {{ b.cancelledCount }}
          </span>
        </div>
      </RouterLink>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { fmtDate as formatDate } from '@/utils/format.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import { COMMAND_LABELS } from '@/constants/agentCommands.js'
import AppButton from '@/components/AppButton.vue'

const fmtDate = (d) => formatDate(d, 'sr-RS')

const { page, limit, nextPage, prevPage, applyServerPagination } = usePaginatedRoute({
  fields: {
    page: { type: 'int', default: 1 },
    limit: { type: 'int', default: 20 },
  },
  useReplace: true,
})

const items = ref([])
const totalPages = ref(0)
const loading = ref(false)

async function fetchData() {
  loading.value = true
  try {
    const params = new URLSearchParams({ page: page.value, limit: limit.value })
    const res = await fetchWithAuth(`/api/protected/agents/jobs/batches?${params.toString()}`)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    items.value = data.items || []
    totalPages.value = data.totalPages ?? 0
    applyServerPagination(data)
  } catch (e) {
    console.error('Neuspešno dohvatanje istorije batch komandi', e)
  } finally {
    loading.value = false
  }
}

watch([page, limit], fetchData)
onMounted(fetchData)
</script>
