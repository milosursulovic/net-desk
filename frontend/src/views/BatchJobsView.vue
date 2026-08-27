<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">Istorija batch komandi</h1>
        <p class="text-sm text-ink-muted mt-1">Komande poslate na više agenata odjednom</p>
      </div>
      <AppButton variant="neutral" to="/agents">Nazad na agente</AppButton>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <label class="text-sm text-ink-secondary" for="pp">Po strani</label>
      <select id="pp" v-model.number="limit" class="app-input w-auto py-1.5 text-sm">
        <option :value="10">10</option>
        <option :value="20">20</option>
        <option :value="50">50</option>
      </select>

      <span class="mx-1 hidden h-5 w-px bg-line sm:inline-block"></span>

      <label class="flex items-center gap-1.5 text-sm text-ink-secondary cursor-pointer">
        <input type="checkbox" v-model="onlyUnfinishedChecked" class="rounded" />
        Samo nezavršeni (na čekanju/poslato)
      </label>

      <span class="mx-1 hidden h-5 w-px bg-line sm:inline-block"></span>

      <button @click="prevPage" :disabled="page === 1 || loading"
        class="px-2 py-1 bg-surface border border-line rounded-lg disabled:opacity-50 hover:bg-surface-sunken" aria-label="Prethodna strana">
        <NavIcon name="chevron-left" />
      </button>
      <span class="text-sm text-ink-secondary font-mono">Strana {{ totalPages === 0 ? '0' : page }} / {{ totalPages }}</span>
      <button @click="nextPage({ totalPages })" :disabled="page >= totalPages || loading"
        class="px-2 py-1 bg-surface border border-line rounded-lg disabled:opacity-50 hover:bg-surface-sunken" aria-label="Sledeća strana">
        <NavIcon name="chevron-right" />
      </button>
    </div>

    <div v-if="loading" class="text-ink-secondary">Učitavanje…</div>
    <div v-else-if="!items.length" class="rounded-xl border border-line bg-surface shadow-sm p-8 text-center text-ink-muted">
      {{ onlyUnfinishedChecked ? 'Nema batch komandi koje su još u toku.' : 'Još nema poslatih batch komandi.' }}
    </div>

    <div v-else class="space-y-2">
      <RouterLink
        v-for="b in items"
        :key="b.batchId"
        :to="`/agent-batches/${b.batchId}`"
        class="block rounded-lg border border-line bg-surface p-3 text-sm hover:shadow-md transition"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="font-medium text-ink">{{ COMMAND_LABELS[b.commandType] || b.commandType }}</div>
          <span class="text-xs text-ink-muted font-mono">{{ fmtDate(b.createdAt) }}</span>
        </div>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <StatusPill status="neutral" :label="`Ukupno: ${b.total}`" :dot="false" />
          <StatusPill v-if="b.pendingCount" status="neutral" :label="`Na čekanju: ${b.pendingCount}`" :dot="false" />
          <StatusPill v-if="b.sentCount" status="info" :label="`Poslato: ${b.sentCount}`" :dot="false" />
          <StatusPill v-if="b.completedCount" status="good" :label="`Završeno: ${b.completedCount}`" :dot="false" />
          <StatusPill v-if="b.failedCount" status="bad" :label="`Neuspešno: ${b.failedCount}`" :dot="false" />
          <StatusPill v-if="b.cancelledCount" status="neutral" :label="`Otkazano: ${b.cancelledCount}`" :dot="false" />
        </div>
      </RouterLink>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { fmtDate as formatDate } from '@/utils/format.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import { COMMAND_LABELS } from '@/constants/agentCommands.js'
import AppButton from '@/components/AppButton.vue'
import StatusPill from '@/components/StatusPill.vue'
import NavIcon from '@/components/NavIcon.vue'

const fmtDate = (d) => formatDate(d, 'sr-RS')

const { page, limit, onlyUnfinished, nextPage, prevPage, applyServerPagination } = usePaginatedRoute({
  fields: {
    page: { type: 'int', default: 1 },
    limit: { type: 'int', default: 20 },
    onlyUnfinished: { oneOf: ['', '1'], default: '', omitIfEmpty: true },
  },
  resetPageOn: ['onlyUnfinished'],
  useReplace: true,
})

const onlyUnfinishedChecked = computed({
  get: () => onlyUnfinished.value === '1',
  set: (v) => {
    onlyUnfinished.value = v ? '1' : ''
  },
})

const items = ref([])
const totalPages = ref(0)
const loading = ref(false)

async function fetchData() {
  loading.value = true
  try {
    const params = new URLSearchParams({ page: page.value, limit: limit.value })
    if (onlyUnfinished.value === '1') params.set('onlyUnfinished', '1')
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

watch([page, limit, onlyUnfinished], fetchData)
onMounted(fetchData)
</script>
