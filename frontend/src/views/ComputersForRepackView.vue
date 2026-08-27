<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">Računari za pakovanje</h1>
        <p class="text-sm text-ink-muted mt-1">
          Računari markirani za pakovanje/zamenu komponenti.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <AppButton variant="success" to="/repack-recommendations">Preporuke za pakovanje</AppButton>
        <AppButton variant="secondary" to="/">Nazad na IP adrese</AppButton>
      </div>
    </div>

    <div class="space-y-3">
      <!-- Pretraga -->
      <div class="relative">
        <input v-model="searchInput" @input="onSearchInput" type="text"
          placeholder="Pretraga po IP-u, imenu računara, odeljenju..."
          class="app-input w-full pr-10"
          aria-label="Pretraga računara za pakovanje" />
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
        Nema markiranih računara za pakovanje.
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
              <td class="py-2 px-3 text-right whitespace-nowrap space-x-3">
                <RouterLink :to="`/ip/${e.id}/meta`" class="text-accent hover:underline">
                  Otvori
                </RouterLink>
                <button type="button" class="text-bad hover:underline" @click="unmark(e)">
                  Ukloni oznaku
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <ToastNotification :message="toast" />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import { useCurrentSite } from '@/composables/useCurrentSite.js'
import { useAbortableFetch } from '@/composables/useAbortableFetch.js'
import { useToast } from '@/composables/useToast.js'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import StatusPill from '@/components/StatusPill.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import NavIcon from '@/components/NavIcon.vue'

const { getSignal, abort } = useAbortableFetch()
const site = useCurrentSite()
const { toast, showToast } = useToast()

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

let searchT = null

async function fetchData() {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: page.value,
      limit: limit.value,
      search: search.value,
      site: site.value,
      entryType: 'all',
      pendingRepack: '1',
    })

    const res = await fetchWithAuth(`/api/protected/ip-addresses?${params.toString()}`, {
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
      console.error('Neuspešno dohvatanje računara za pakovanje', e)
    }
  } finally {
    loading.value = false
  }
}

async function unmark(entry) {
  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses/${entry.id}/pending-repack`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingRepack: false }),
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri uklanjanju oznake'))
    await fetchData()
    showToast('Oznaka uklonjena')
  } catch (err) {
    console.error('Neuspešno uklanjanje oznake za pakovanje', err)
    showToast(err?.message || 'Greška pri uklanjanju oznake', { kind: 'error', duration: 3000 })
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
