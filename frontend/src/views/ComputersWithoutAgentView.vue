<template>
  <div class="glass-container space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <h1 class="text-2xl font-bold text-slate-800">Računari bez agenta</h1>
      <AppButton variant="secondary" to="/agents">Nazad na agente</AppButton>
    </div>

    <div class="space-y-3">
      <!-- Pretraga -->
      <div class="relative">
        <input v-model="searchInput" @input="onSearchInput" type="text"
          placeholder="Pretraga po IP-u ili nazivu računara..."
          class="app-input w-full pr-10"
          aria-label="Pretraga računara bez agenta" />
        <button v-if="searchInput" @click="clearSearch"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          aria-label="Obriši pretragu">
          ✖️
        </button>
      </div>

      <!-- Po strani i paginacija -->
      <div class="flex flex-wrap items-center gap-2">
        <label class="text-sm text-slate-600" for="pp">Po strani</label>
        <select id="pp" v-model.number="limit" class="app-input w-auto py-1.5 text-sm">
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>

        <span class="mx-1 hidden h-5 w-px bg-slate-200 sm:inline-block"></span>

        <button @click="prevPage" :disabled="page === 1 || loading"
          class="px-2 py-1 bg-white border rounded-lg disabled:opacity-50 hover:bg-slate-100" aria-label="Prethodna strana">
          ⬅️
        </button>
        <span class="text-sm text-slate-600">
          Strana {{ totalPages === 0 ? '0' : page }} / {{ totalPages }}
        </span>
        <button @click="nextPage({ total })" :disabled="page * limit >= total || loading"
          class="px-2 py-1 bg-white border rounded-lg disabled:opacity-50 hover:bg-slate-100" aria-label="Sledeća strana">
          ➡️
        </button>
      </div>

      <p class="text-sm text-slate-500">Prikazano {{ items.length }} od {{ total }} računara</p>
    </div>

    <div class="min-h-50 overflow-x-auto">
      <div v-if="loading" class="space-y-2">
        <div v-for="n in 6" :key="n" class="animate-pulse h-12 bg-white border border-slate-200 rounded-lg"></div>
      </div>

      <div v-else-if="!items.length"
        class="rounded-xl border border-slate-200 bg-white shadow-sm p-8 text-center text-slate-500">
        Svi računari imaju aktivnog agenta.
      </div>

      <table v-else class="w-full text-sm border-collapse">
        <thead>
          <tr class="text-left text-slate-500 border-b border-slate-200">
            <th class="py-2 pr-3">IP</th>
            <th class="py-2 pr-3">Naziv računara</th>
            <th class="py-2 pr-3">Odeljenje</th>
            <th class="py-2 pr-3">OS</th>
            <th class="py-2 pr-3">Online</th>
            <th class="py-2 pr-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in items" :key="e.id" class="border-b border-slate-100 hover:bg-slate-50">
            <td class="py-2 pr-3 font-mono">{{ e.ip }}</td>
            <td class="py-2 pr-3">{{ e.computerName || '—' }}</td>
            <td class="py-2 pr-3">{{ e.department || '—' }}</td>
            <td class="py-2 pr-3">{{ e.os || '—' }}</td>
            <td class="py-2 pr-3">
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs border"
                :class="e.isOnline
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200'">
                {{ e.isOnline ? 'Online' : 'Offline' }}
              </span>
            </td>
            <td class="py-2 pr-3 text-right">
              <RouterLink :to="`/ip/${e.id}/meta`" class="text-blue-600 hover:underline">
                Otvori
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import { useAbortableFetch } from '@/composables/useAbortableFetch.js'
import AppButton from '@/components/AppButton.vue'

const { getSignal, abort } = useAbortableFetch()

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

watch([page, limit, search], fetchData)

const items = ref([])
const total = ref(0)
const totalPages = ref(0)
const searchInput = ref(search.value)
const loading = ref(false)

let searchT = null

async function fetchData() {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: page.value,
      limit: limit.value,
      search: search.value,
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
