<template>
  <div class="glass-container space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <h1 class="text-2xl font-bold text-slate-800">Netdesk Agenti</h1>
      <AppButton variant="secondary" to="/agent-releases">Verzije agenta</AppButton>
    </div>

    <div class="space-y-3">
      <!-- Pretraga i filter -->
      <div class="flex flex-col sm:flex-row gap-2">
        <div class="relative flex-1">
          <input v-model="searchInput" @input="onSearchInput" type="text"
            placeholder="Pretraga po hostname-u ili agent id-u..."
            class="app-input w-full pr-10"
            aria-label="Pretraga agenata" />
          <button v-if="searchInput" @click="clearSearch"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label="Obriši pretragu">
            ✖️
          </button>
        </div>

        <select v-model="status" class="app-input w-full sm:w-48" aria-label="Filter po statusu">
          <option value="all">Svi statusi</option>
          <option value="active">Aktivni</option>
          <option value="revoked">Povučeni</option>
        </select>
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

      <p class="text-sm text-slate-500">Prikazano {{ items.length }} od {{ total }} agenata</p>
    </div>

    <div class="min-h-50">
      <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="n in 6" :key="n" class="animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm p-4">
          <div class="h-5 w-2/3 bg-slate-200 rounded mb-3"></div>
          <div class="h-4 w-1/2 bg-slate-200 rounded mb-2"></div>
          <div class="h-4 w-1/3 bg-slate-200 rounded mb-4"></div>
        </div>
      </div>

      <div v-else-if="!items.length"
        class="rounded-xl border border-slate-200 bg-white shadow-sm p-8 text-center text-slate-500">
        Nema agenata za zadate filtere.
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="a in items" :key="a.id"
          class="rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition p-4 flex flex-col">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <RouterLink :to="`/agents/${a.id}`" class="text-lg font-semibold text-slate-800 truncate hover:underline block">
                {{ a.hostname || '—' }}
              </RouterLink>
              <div class="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <span class="truncate">{{ a.agentUid }}</span>
                <button @click="copy(a.agentUid)" class="shrink-0 text-slate-400 hover:text-slate-600" aria-label="Kopiraj agent id">
                  📋
                </button>
              </div>
            </div>
            <span class="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs border"
              :class="a.status === 'active'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-100 text-slate-500 border-slate-200'">
              {{ a.status === 'active' ? 'Aktivan' : 'Povučen' }}
            </span>
          </div>

          <div class="mt-3 space-y-1.5 text-sm">
            <div class="flex items-center gap-2">
              <span class="font-medium">OS:</span>
              <span>{{ a.osCaption || '—' }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-medium">Verzija agenta:</span>
              <span>{{ a.agentVersion || '—' }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-medium">Poslednji heartbeat:</span>
              <span>{{ fmtRelative(a.lastHeartbeatAt) }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-medium">Poslednji IP:</span>
              <span>{{ a.lastIp || '—' }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-medium">Povezan računar:</span>
              <RouterLink v-if="a.ipEntryId" :to="`/ip/${a.ipEntryId}/meta`" class="text-blue-600 hover:underline">
                Otvori
              </RouterLink>
              <span v-else>—</span>
            </div>
          </div>

          <div class="mt-3 pt-3 border-t flex items-center justify-between text-xs text-slate-500">
            <span>Enroll: {{ fmtDate(a.enrolledAt) }}</span>
            <button v-if="a.status === 'active'" @click="confirmRevoke(a)" class="text-red-600 hover:underline text-sm">
              Povuci
            </button>
          </div>
        </div>
      </div>
    </div>

    <ToastNotification :message="toast" />

    <ConfirmDialog
      :open="confirmState.open"
      :title="confirmState.title"
      :message="confirmState.message"
      @confirm="resolveConfirm(true)"
      @cancel="resolveConfirm(false)"
    />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { fmtDate as formatDate, fmtRelative } from '@/utils/format.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import { useToast } from '@/composables/useToast.js'
import { useAbortableFetch } from '@/composables/useAbortableFetch.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AppButton from '@/components/AppButton.vue'

const fmtDate = (d) => formatDate(d, 'sr-RS')
const { toast, showToast, copyToClipboard } = useToast()
const { getSignal, abort } = useAbortableFetch()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()

const { page, limit, search, status, nextPage, prevPage, applyServerPagination } =
  usePaginatedRoute({
    fields: {
      page: { type: 'int', default: 1 },
      limit: { type: 'int', default: 20 },
      search: { type: 'string', default: '', omitIfEmpty: true },
      status: { default: 'all', oneOf: ['all', 'active', 'revoked'] },
    },
    resetPageOn: ['search', 'status'],
    useReplace: true,
  })

watch([page, limit, search, status], fetchData)

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
      status: status.value,
    })

    const res = await fetchWithAuth(`/api/protected/agents?${params.toString()}`, {
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
      console.error('Neuspešno dohvatanje agenata', e)
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

async function copy(text) {
  await copyToClipboard(text, 'Agent ID kopiran')
}

async function confirmRevoke(a) {
  const ok = await askConfirm(`Povući pristup agentu "${a.hostname || a.agentUid}"?`, {
    title: 'Povlačenje agenta',
  })
  if (!ok) return

  try {
    const res = await fetchWithAuth(`/api/protected/agents/${a.id}/revoke`, { method: 'POST' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    await fetchData()
    showToast('Agent povučen')
  } catch (e) {
    console.error(e)
    showToast('Greška pri povlačenju agenta', { prefix: '❌ ', duration: 3000 })
  }
}

onBeforeUnmount(() => {
  abort()
  clearTimeout(searchT)
})

onMounted(() => {
  fetchData()
})
</script>
