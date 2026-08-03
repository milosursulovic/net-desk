<template>
  <div class="glass-container space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">DNS Logovi</h1>
        <p class="text-sm text-slate-500 mt-1">
          Domeni koje su računari upitivali (DNS), agregirano po računaru - za bezbednosnu
          vidljivost i naknadnu forenziku.
        </p>
      </div>
    </div>

    <div class="space-y-3">
      <!-- Pretraga -->
      <div class="relative">
        <input v-model="searchInput" @input="onSearchInput" type="text"
          placeholder="Pretraga po domenu, računaru, IP-u ili odeljenju..."
          class="app-input w-full pr-10"
          aria-label="Pretraga DNS logova" />
        <button v-if="searchInput" @click="clearSearch"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          aria-label="Obriši pretragu">
          ✖️
        </button>
      </div>

      <!-- Sortiranje, po strani i paginacija -->
      <div class="flex flex-wrap items-center gap-2">
        <select v-model="sortBy" class="app-input w-auto py-1.5 text-sm">
          <option value="lastSeen">Poslednji put viđen</option>
          <option value="firstSeen">Prvi put viđen</option>
          <option value="domain">Domen</option>
          <option value="queryCount">Broj upita</option>
          <option value="computerName">Računar</option>
        </select>
        <button @click="sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'"
          class="px-2.5 py-1.5 border rounded-lg text-sm hover:bg-slate-50"
          :title="sortOrder === 'asc' ? 'Rastuće — klikni za opadajuće' : 'Opadajuće — klikni za rastuće'"
          aria-label="Promeni redosled sortiranja">
          {{ sortOrder === 'asc' ? '↑' : '↓' }}
        </button>

        <span class="mx-1 hidden h-5 w-px bg-slate-200 sm:inline-block"></span>

        <label class="text-sm text-slate-600" for="pp">Po strani</label>
        <select id="pp" v-model.number="limit" class="app-input w-auto py-1.5 text-sm">
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

      <p class="text-sm text-slate-500">Prikazano {{ items.length }} od {{ total }} unosa</p>
    </div>

    <div class="min-h-50 overflow-x-auto">
      <div v-if="loading" class="space-y-2">
        <div v-for="n in 6" :key="n" class="animate-pulse h-12 bg-white border border-slate-200 rounded-lg"></div>
      </div>

      <div v-else-if="!items.length"
        class="rounded-xl border border-slate-200 bg-white shadow-sm p-8 text-center text-slate-500">
        Nema DNS zapisa za zadate filtere.
      </div>

      <table v-else class="w-full text-sm border-collapse">
        <thead>
          <tr class="text-left text-slate-500 border-b border-slate-200">
            <th class="py-2 pr-3">Domen</th>
            <th class="py-2 pr-3">Računar</th>
            <th class="py-2 pr-3">IP</th>
            <th class="py-2 pr-3">Odeljenje</th>
            <th class="py-2 pr-3">Prvi put viđen</th>
            <th class="py-2 pr-3">Poslednji put viđen</th>
            <th class="py-2 pr-3 text-right">Broj upita</th>
            <th class="py-2 pr-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in items" :key="row.id"
            class="border-b border-slate-100 hover:bg-slate-50"
            :class="row.isBlacklisted ? 'bg-red-50' : ''">
            <td class="py-2 pr-3 font-mono break-all">
              {{ row.domain }}
              <span v-if="row.isBlacklisted" class="ml-1 text-red-600" title="Domen je na crnoj listi">🚫</span>
            </td>
            <td class="py-2 pr-3">
              <RouterLink :to="`/ip/${row.ipEntryId}/meta`" class="text-blue-600 hover:underline">
                {{ row.computerName || '—' }}
              </RouterLink>
            </td>
            <td class="py-2 pr-3 font-mono">{{ row.ip }}</td>
            <td class="py-2 pr-3">{{ row.department || '—' }}</td>
            <td class="py-2 pr-3 whitespace-nowrap">{{ fmtDate(row.firstSeen) }}</td>
            <td class="py-2 pr-3 whitespace-nowrap">{{ fmtDate(row.lastSeen) }}</td>
            <td class="py-2 pr-3 text-right tabular-nums">{{ row.queryCount }}</td>
            <td class="py-2 pr-3 text-right">
              <button v-if="!row.isBlacklisted" @click="blacklistDomain(row.domain)"
                class="text-red-600 hover:underline text-xs whitespace-nowrap">
                Na crnu listu
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Crna lista domena -->
    <div class="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div class="flex items-center justify-between gap-3 p-4 border-b border-slate-100">
        <div>
          <h2 class="font-semibold text-slate-800">Crna lista domena</h2>
          <p class="text-xs text-slate-500 mt-0.5">
            Domeni koji, ako ih bilo koji računar poseti, izazivaju upozorenje (uključujući poddomene).
          </p>
        </div>
        <span class="rounded-full bg-red-600 text-white text-xs px-2 py-0.5">{{ blacklist.length }}</span>
      </div>

      <form @submit.prevent="addToBlacklist" class="flex flex-wrap items-end gap-2 p-4 border-b border-slate-100">
        <div class="flex-1 min-w-40">
          <label class="text-xs text-slate-600">Domen</label>
          <input v-model.trim="newBlacklistDomain" type="text" class="app-input w-full" placeholder="npr. malware-c2.example.com" />
        </div>
        <div class="flex-1 min-w-40">
          <label class="text-xs text-slate-600">Napomena (opciono)</label>
          <input v-model.trim="newBlacklistReason" type="text" class="app-input w-full" placeholder="npr. poznat C2 domen" />
        </div>
        <AppButton type="submit" variant="danger" :disabled="!newBlacklistDomain || savingBlacklist">
          {{ savingBlacklist ? 'Dodajem…' : 'Dodaj na crnu listu' }}
        </AppButton>
      </form>

      <div class="overflow-x-auto">
        <table v-if="blacklist.length" class="w-full text-sm border-collapse">
          <thead>
            <tr class="text-left text-slate-500 border-b border-slate-200">
              <th class="py-2 px-4">Domen</th>
              <th class="py-2 px-4">Napomena</th>
              <th class="py-2 px-4">Dodato</th>
              <th class="py-2 px-4"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in blacklist" :key="item.id" class="border-b border-slate-100">
              <td class="py-2 px-4 font-mono">{{ item.domain }}</td>
              <td class="py-2 px-4">{{ item.reason || '—' }}</td>
              <td class="py-2 px-4 whitespace-nowrap">{{ fmtDate(item.createdAt) }}</td>
              <td class="py-2 px-4 text-right">
                <button @click="removeFromBlacklist(item.id)" class="text-red-600 hover:underline text-xs">
                  Ukloni
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-sm text-slate-500 p-4">Crna lista je prazna.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onBeforeUnmount, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { fmtDate as formatDate } from '@/utils/format.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import { useCurrentSite } from '@/composables/useCurrentSite.js'
import { useAbortableFetch } from '@/composables/useAbortableFetch.js'
import { useToast } from '@/composables/useToast.js'
import AppButton from '@/components/AppButton.vue'

const fmtDate = (d) => formatDate(d, 'sr-RS')
const site = useCurrentSite()
const { getSignal, abort } = useAbortableFetch()
const { showToast } = useToast()

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

    const res = await fetchWithAuth(`/api/protected/dns-logs?${params.toString()}`, {
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
      console.error('Neuspešno dohvatanje DNS logova', e)
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

const blacklist = ref([])
const newBlacklistDomain = ref('')
const newBlacklistReason = ref('')
const savingBlacklist = ref(false)

async function fetchBlacklist() {
  try {
    const res = await fetchWithAuth('/api/protected/dns-logs/blacklist')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    blacklist.value = data.items || []
  } catch (e) {
    console.error('Neuspešno dohvatanje crne liste domena', e)
  }
}

async function addToBlacklist() {
  if (!newBlacklistDomain.value) return
  savingBlacklist.value = true
  try {
    const res = await fetchWithAuth('/api/protected/dns-logs/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: newBlacklistDomain.value, reason: newBlacklistReason.value }),
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri dodavanju na crnu listu'))
    newBlacklistDomain.value = ''
    newBlacklistReason.value = ''
    await Promise.all([fetchBlacklist(), fetchData()])
    showToast('Domen dodat na crnu listu')
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri dodavanju na crnu listu', { prefix: '❌ ', duration: 3000 })
  } finally {
    savingBlacklist.value = false
  }
}

async function blacklistDomain(domain) {
  newBlacklistDomain.value = domain
  newBlacklistReason.value = ''
  await addToBlacklist()
}

async function removeFromBlacklist(id) {
  try {
    const res = await fetchWithAuth(`/api/protected/dns-logs/blacklist/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri uklanjanju'))
    await Promise.all([fetchBlacklist(), fetchData()])
    showToast('Uklonjeno sa crne liste')
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri uklanjanju', { prefix: '❌ ', duration: 3000 })
  }
}

onMounted(() => {
  fetchData()
  fetchBlacklist()
})
</script>
