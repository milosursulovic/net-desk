<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">{{ t('nav.dnsLogs') }}</h1>
        <p class="text-sm text-ink-muted mt-1">
          {{ t('dnsLogs.subtitle') }}
        </p>
      </div>
    </div>

    <div class="space-y-3">
      <!-- Pretraga -->
      <div class="relative">
        <input v-model="searchInput" @input="onSearchInput" type="text"
          :placeholder="t('dnsLogs.searchPlaceholder')"
          class="app-input w-full pr-10"
          :aria-label="t('dnsLogs.searchAriaLabel')" />
        <button v-if="searchInput" @click="clearSearch"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
          :aria-label="t('printers.clearSearchAriaLabel')">
          <NavIcon name="x" />
        </button>
      </div>

      <!-- Sortiranje i filter -->
      <div class="flex flex-wrap items-center gap-2">
        <select v-model="sortBy" class="app-input w-auto py-1.5 text-sm">
          <option value="lastSeen">{{ t('processDetections.lastSeen') }}</option>
          <option value="firstSeen">{{ t('processDetections.firstSeen') }}</option>
          <option value="domain">{{ t('dnsLogs.domain') }}</option>
          <option value="queryCount">{{ t('dnsLogs.queryCount') }}</option>
          <option value="computerName">{{ t('repack.colComputerName') }}</option>
        </select>
        <button @click="sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'"
          class="px-2.5 py-1.5 border border-line rounded-lg text-sm hover:bg-surface-sunken"
          :title="sortOrder === 'asc' ? t('home.sortAsc') : t('home.sortDesc')"
          :aria-label="t('home.changeSortOrder')">
          <NavIcon :name="sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'" />
        </button>

        <span class="mx-1 hidden h-5 w-px bg-line sm:inline-block"></span>

        <label class="inline-flex items-center gap-1.5 text-sm text-ink-secondary">
          <input
            type="checkbox"
            :checked="blacklistedOnly === 'true'"
            @change="blacklistedOnly = blacklistedOnly === 'true' ? '' : 'true'"
          />
          {{ t('dnsLogs.blacklistedOnly') }}
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

      <p class="text-sm text-ink-muted">{{ t('home.shown', { shown: items.length, total }) }}</p>
    </div>

    <div class="table-shell">
      <div v-if="loading" class="space-y-2 p-4">
        <div v-for="n in 6" :key="n" class="animate-pulse h-8 bg-surface-sunken rounded-lg"></div>
      </div>

      <div v-else-if="!items.length" class="p-8 text-center text-ink-muted">
        {{ t('dnsLogs.noResults') }}
      </div>

      <div v-else class="table-scroll overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="table-head-row">
              <th class="py-2 px-3 text-left">{{ t('dnsLogs.domain') }}</th>
              <th class="py-2 px-3 text-left">{{ t('repack.colComputerName') }}</th>
              <th class="py-2 px-3 text-left">IP</th>
              <th class="py-2 px-3 text-left">{{ t('common.department') }}</th>
              <th class="py-2 px-3 text-left">{{ t('processDetections.firstSeen') }}</th>
              <th class="py-2 px-3 text-left">{{ t('processDetections.lastSeen') }}</th>
              <th class="py-2 px-3 text-right">{{ t('dnsLogs.queryCount') }}</th>
              <th class="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in items" :key="row.id"
              class="border-b border-line last:border-0 hover:bg-surface-sunken"
              :class="row.isBlacklisted ? 'bg-bad-subtle' : ''">
              <td class="py-2 px-3 font-mono whitespace-nowrap text-ink">
                {{ row.domain }}
                <span v-if="row.isBlacklisted" class="ml-1 inline-flex text-bad" :title="t('dnsLogs.blacklistedTitle')"><NavIcon name="ban" /></span>
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
                  {{ t('dnsLogs.addToBlacklist') }}
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
          <h2 class="font-semibold text-ink" style="font-family: var(--font-display)">{{ t('dnsLogs.blacklistTitle') }}</h2>
          <p class="text-xs text-ink-muted mt-0.5">
            {{ t('dnsLogs.blacklistDescription') }}
          </p>
        </div>
        <span class="rounded-full bg-bad text-white text-xs px-2 py-0.5 font-mono">{{ blacklistTotal }}</span>
      </div>

      <form v-if="isAdmin" @submit.prevent="addToBlacklist" class="flex flex-wrap items-end gap-2 p-4 border-b border-line">
        <div class="flex-1 min-w-40">
          <label class="text-xs text-ink-secondary">{{ t('dnsLogs.domain') }}</label>
          <input v-model.trim="newBlacklistDomain" type="text" class="app-input w-full" :placeholder="t('dnsLogs.domainPlaceholder')" />
        </div>
        <div class="flex-1 min-w-40">
          <label class="text-xs text-ink-secondary">{{ t('dnsLogs.noteOptional') }}</label>
          <input v-model.trim="newBlacklistReason" type="text" class="app-input w-full" :placeholder="t('dnsLogs.reasonPlaceholder')" />
        </div>
        <AppButton type="submit" variant="danger" :disabled="!newBlacklistDomain || savingBlacklist">
          {{ savingBlacklist ? t('groups.adding') : t('dnsLogs.addToBlacklist') }}
        </AppButton>
      </form>

      <div class="flex flex-wrap items-center gap-2 p-4 border-b border-line">
        <input
          v-model="blacklistSearchInput"
          @input="onBlacklistSearchInput"
          type="text"
          :placeholder="t('dnsLogs.blacklistSearchPlaceholder')"
          class="app-input flex-1 min-w-40 text-sm"
          :aria-label="t('dnsLogs.blacklistSearchAriaLabel')"
        />
        <button @click="prevBlacklistPage" :disabled="blacklistPage === 1"
          class="px-2 py-1 bg-surface border border-line rounded-lg disabled:opacity-50 hover:bg-surface-sunken" :aria-label="t('freeIps.prevPage')">
          <NavIcon name="chevron-left" />
        </button>
        <span class="text-sm text-ink-secondary whitespace-nowrap font-mono">
          {{ t('freeIps.pageOf', { page: blacklistTotalPages === 0 ? '0' : blacklistPage, total: blacklistTotalPages }) }}
        </span>
        <button @click="nextBlacklistPage" :disabled="blacklistPage >= blacklistTotalPages"
          class="px-2 py-1 bg-surface border border-line rounded-lg disabled:opacity-50 hover:bg-surface-sunken" :aria-label="t('freeIps.nextPage')">
          <NavIcon name="chevron-right" />
        </button>
      </div>

      <div class="overflow-x-auto">
        <table v-if="blacklist.length" class="w-full text-sm border-collapse">
          <thead>
            <tr class="table-head-row">
              <th class="py-2 px-4 text-left">{{ t('dnsLogs.domain') }}</th>
              <th class="py-2 px-4 text-left">{{ t('inventory.colNote') }}</th>
              <th class="py-2 px-4 text-left">{{ t('dnsLogs.added') }}</th>
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
                  {{ t('dnsLogs.remove') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-sm text-ink-muted p-4">{{ t('dnsLogs.noDomainsFound') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onBeforeUnmount, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
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

const { t, locale } = useI18n()
const fmtDate = (d) => formatDate(d, locale.value === 'en' ? 'en-US' : 'sr-RS')
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
    if (!res.ok) throw new Error(await parseError(res, t('dnsLogs.errorAddBlacklist')))
    newBlacklistDomain.value = ''
    newBlacklistReason.value = ''
    await Promise.all([fetchBlacklist(), fetchData()])
    showToast(t('dnsLogs.domainAdded'))
  } catch (err) {
    console.error(err)
    showToast(err?.message || t('dnsLogs.errorAddBlacklist'), { kind: 'error', duration: 3000 })
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
    if (!res.ok) throw new Error(await parseError(res, t('dnsLogs.errorRemove')))
    // Ako je ovo bio poslednji unos na trenutnoj strani (a nije prva), vrati
    // se na prethodnu - inače bi ostala prazna strana posle brisanja.
    if (blacklist.value.length === 1 && blacklistPage.value > 1) {
      blacklistPage.value -= 1
    }
    await Promise.all([fetchBlacklist(), fetchData()])
    showToast(t('dnsLogs.removedFromBlacklist'))
  } catch (err) {
    console.error(err)
    showToast(err?.message || t('dnsLogs.errorRemove'), { kind: 'error', duration: 3000 })
  }
}

onMounted(() => {
  fetchData()
  fetchBlacklist()
})
</script>
