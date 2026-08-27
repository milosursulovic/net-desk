<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">DNS Logovi</h1>
        <p class="text-sm text-ink-muted mt-1">
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
          class="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
          aria-label="Obriši pretragu">
          <NavIcon name="x" />
        </button>
      </div>

      <!-- Sortiranje i filter -->
      <div class="flex flex-wrap items-center gap-2">
        <select v-model="sortBy" class="app-input w-auto py-1.5 text-sm">
          <option value="lastSeen">Poslednji put viđen</option>
          <option value="firstSeen">Prvi put viđen</option>
          <option value="domain">Domen</option>
          <option value="queryCount">Broj upita</option>
          <option value="computerName">Računar</option>
        </select>
        <button @click="sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'"
          class="px-2.5 py-1.5 border border-line rounded-lg text-sm hover:bg-surface-sunken"
          :title="sortOrder === 'asc' ? 'Rastuće — klikni za opadajuće' : 'Opadajuće — klikni za rastuće'"
          aria-label="Promeni redosled sortiranja">
          <NavIcon :name="sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'" />
        </button>

        <span class="mx-1 hidden h-5 w-px bg-line sm:inline-block"></span>

        <label class="inline-flex items-center gap-1.5 text-sm text-ink-secondary">
          <input
            type="checkbox"
            :checked="blacklistedOnly === 'true'"
            @change="blacklistedOnly = blacklistedOnly === 'true' ? '' : 'true'"
          />
          Samo domeni sa crne liste
        </label>
      </div>

      <PaginationBar
        :page="page"
        :limit="limit"
        :total="total"
        :total-pages="totalPages"
        :loading="loading"
        :limit-options="[20, 50, 100]"
        @prev="prevPage"
        @next="nextPage({ total })"
        @update:limit="(v) => (limit = v)"
      />

      <p class="text-sm text-ink-muted">Prikazano {{ items.length }} od {{ total }} unosa</p>
    </div>

    <div class="table-shell">
      <div v-if="loading" class="space-y-2 p-4">
        <div v-for="n in 6" :key="n" class="animate-pulse h-8 bg-surface-sunken rounded-lg"></div>
      </div>

      <div v-else-if="!items.length" class="p-8 text-center text-ink-muted">
        Nema DNS zapisa za zadate filtere.
      </div>

      <div v-else class="table-scroll overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="table-head-row">
              <th class="py-2 px-3 text-left">Domen</th>
              <th class="py-2 px-3 text-left">Računar</th>
              <th class="py-2 px-3 text-left">IP</th>
              <th class="py-2 px-3 text-left">Odeljenje</th>
              <th class="py-2 px-3 text-left">Prvi put viđen</th>
              <th class="py-2 px-3 text-left">Poslednji put viđen</th>
              <th class="py-2 px-3 text-right">Broj upita</th>
              <th class="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in items" :key="row.id"
              class="border-b border-line last:border-0 hover:bg-surface-sunken"
              :class="row.isBlacklisted ? 'bg-bad-subtle' : ''">
              <td class="py-2 px-3 font-mono whitespace-nowrap text-ink">
                {{ row.domain }}
                <span v-if="row.isBlacklisted" class="ml-1 inline-flex text-bad" title="Domen je na crnoj listi"><NavIcon name="ban" /></span>
              </td>
              <td class="py-2 px-3">
                <RouterLink :to="`/ip/${row.ipEntryId}/meta`" class="text-accent hover:underline">
                  {{ row.computerName || '—' }}
                </RouterLink>
              </td>
              <td class="py-2 px-3 font-mono text-ink-secondary">{{ row.ip }}</td>
              <td class="py-2 px-3 text-ink-secondary">{{ row.department || '—' }}</td>
              <td class="py-2 px-3 whitespace-nowrap font-mono text-ink-muted">{{ fmtDate(row.firstSeen) }}</td>
              <td class="py-2 px-3 whitespace-nowrap font-mono text-ink-muted">{{ fmtDate(row.lastSeen) }}</td>
              <td class="py-2 px-3 text-right font-mono tabular-nums text-ink">{{ row.queryCount }}</td>
              <td class="py-2 px-3 text-right">
                <button v-if="!row.isBlacklisted && isAdmin" @click="blacklistDomain(row.domain)"
                  class="text-bad hover:underline text-xs whitespace-nowrap">
                  Na crnu listu
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Crna lista domena -->
    <div class="table-shell">
      <div class="flex items-center justify-between gap-3 p-4 border-b border-line">
        <div>
          <h2 class="font-semibold text-ink" style="font-family: var(--font-display)">Crna lista domena</h2>
          <p class="text-xs text-ink-muted mt-0.5">
            Domeni koji, ako ih bilo koji računar poseti, izazivaju upozorenje (uključujući poddomene).
          </p>
        </div>
        <span class="rounded-full bg-bad text-white text-xs px-2 py-0.5 font-mono">{{ blacklistTotal }}</span>
      </div>

      <form v-if="isAdmin" @submit.prevent="addToBlacklist" class="flex flex-wrap items-end gap-2 p-4 border-b border-line">
        <div class="flex-1 min-w-40">
          <label class="text-xs text-ink-secondary">Domen</label>
          <input v-model.trim="newBlacklistDomain" type="text" class="app-input w-full" placeholder="npr. malware-c2.example.com" />
        </div>
        <div class="flex-1 min-w-40">
          <label class="text-xs text-ink-secondary">Napomena (opciono)</label>
          <input v-model.trim="newBlacklistReason" type="text" class="app-input w-full" placeholder="npr. poznat C2 domen" />
        </div>
        <AppButton type="submit" variant="danger" :disabled="!newBlacklistDomain || savingBlacklist">
          {{ savingBlacklist ? 'Dodajem…' : 'Dodaj na crnu listu' }}
        </AppButton>
      </form>

      <div class="flex flex-wrap items-center gap-2 p-4 border-b border-line">
        <input
          v-model="blacklistSearchInput"
          @input="onBlacklistSearchInput"
          type="text"
          placeholder="Pretraga po domenu..."
          class="app-input flex-1 min-w-40 text-sm"
          aria-label="Pretraga crne liste domena"
        />
        <button @click="prevBlacklistPage" :disabled="blacklistPage === 1"
          class="px-2 py-1 bg-surface border border-line rounded-lg disabled:opacity-50 hover:bg-surface-sunken" aria-label="Prethodna strana">
          <NavIcon name="chevron-left" />
        </button>
        <span class="text-sm text-ink-secondary whitespace-nowrap font-mono">
          Strana {{ blacklistTotalPages === 0 ? '0' : blacklistPage }} / {{ blacklistTotalPages }}
        </span>
        <button @click="nextBlacklistPage" :disabled="blacklistPage >= blacklistTotalPages"
          class="px-2 py-1 bg-surface border border-line rounded-lg disabled:opacity-50 hover:bg-surface-sunken" aria-label="Sledeća strana">
          <NavIcon name="chevron-right" />
        </button>
      </div>

      <div class="overflow-x-auto">
        <table v-if="blacklist.length" class="w-full text-sm border-collapse">
          <thead>
            <tr class="table-head-row">
              <th class="py-2 px-4 text-left">Domen</th>
              <th class="py-2 px-4 text-left">Napomena</th>
              <th class="py-2 px-4 text-left">Dodato</th>
              <th v-if="isAdmin" class="py-2 px-4"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in blacklist" :key="item.id" class="border-b border-line last:border-0">
              <td class="py-2 px-4 font-mono text-ink">{{ item.domain }}</td>
              <td class="py-2 px-4 text-ink-secondary">{{ item.reason || '—' }}</td>
              <td class="py-2 px-4 whitespace-nowrap font-mono text-ink-muted">{{ fmtDate(item.createdAt) }}</td>
              <td v-if="isAdmin" class="py-2 px-4 text-right">
                <button @click="removeFromBlacklist(item.id)" class="text-bad hover:underline text-xs">
                  Ukloni
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-sm text-ink-muted p-4">Nema domena za zadatu pretragu.</p>
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
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import AppButton from '@/components/AppButton.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import NavIcon from '@/components/NavIcon.vue'

const fmtDate = (d) => formatDate(d, 'sr-RS')
const site = useCurrentSite()
const { getSignal, abort } = useAbortableFetch()
const { showToast } = useToast()
const { isAdmin } = useCurrentUser()

const { page, limit, search, sortBy, sortOrder, blacklistedOnly, nextPage, prevPage, applyServerPagination } =
  usePaginatedRoute({
    fields: {
      page: { type: 'int', default: 1 },
      limit: { type: 'int', default: 50 },
      search: { type: 'string', default: '', omitIfEmpty: true },
      sortBy: { type: 'string', default: 'lastSeen' },
      sortOrder: { type: 'string', default: 'desc' },
      blacklistedOnly: { type: 'string', default: '', omitIfEmpty: true, oneOf: ['', 'true'] },
    },
    resetPageOn: ['search', 'sortBy', 'sortOrder', 'blacklistedOnly'],
    useReplace: true,
  })

watch([page, limit, search, sortBy, sortOrder, blacklistedOnly, site], fetchData)

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
    if (blacklistedOnly.value) params.set('blacklistedOnly', blacklistedOnly.value)

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
const blacklistTotal = ref(0)
const blacklistPage = ref(1)
const blacklistLimit = ref(50)
const blacklistTotalPages = ref(0)
const blacklistSearch = ref('')
const blacklistSearchInput = ref('')
const newBlacklistDomain = ref('')
const newBlacklistReason = ref('')
const savingBlacklist = ref(false)

// flagged_domains ima ~88k redova (dnevna sinhronizacija sa spoljnim
// izvorima, domainBlacklistSync.service.js) - paginirano, ne sve odjednom
// (renderovanje 88k <tr> elemenata je i bilo uzrok kočenja ove strane).
async function fetchBlacklist() {
  try {
    const params = new URLSearchParams({
      page: blacklistPage.value,
      limit: blacklistLimit.value,
      search: blacklistSearch.value,
    })
    const res = await fetchWithAuth(`/api/protected/dns-logs/blacklist?${params.toString()}`)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    blacklist.value = data.items || []
    blacklistTotal.value = data.total ?? 0
    blacklistTotalPages.value = data.totalPages ?? 0
    if (data.page) blacklistPage.value = data.page
  } catch (e) {
    console.error('Neuspešno dohvatanje crne liste domena', e)
  }
}

let blacklistSearchT = null
const onBlacklistSearchInput = () => {
  clearTimeout(blacklistSearchT)
  blacklistSearchT = setTimeout(() => {
    blacklistSearch.value = blacklistSearchInput.value
    blacklistPage.value = 1
    fetchBlacklist()
  }, 300)
}

function prevBlacklistPage() {
  if (blacklistPage.value > 1) {
    blacklistPage.value -= 1
    fetchBlacklist()
  }
}
function nextBlacklistPage() {
  if (blacklistPage.value < blacklistTotalPages.value) {
    blacklistPage.value += 1
    fetchBlacklist()
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
    showToast(err?.message || 'Greška pri dodavanju na crnu listu', { kind: 'error', duration: 3000 })
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
    // Ako je ovo bio poslednji unos na trenutnoj strani (a nije prva), vrati
    // se na prethodnu - inače bi ostala prazna strana posle brisanja.
    if (blacklist.value.length === 1 && blacklistPage.value > 1) {
      blacklistPage.value -= 1
    }
    await Promise.all([fetchBlacklist(), fetchData()])
    showToast('Uklonjeno sa crne liste')
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri uklanjanju', { kind: 'error', duration: 3000 })
  }
}

onMounted(() => {
  fetchData()
  fetchBlacklist()
})
</script>
