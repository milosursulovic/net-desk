<template>
  <div class="glass-container p-4 space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <h1 class="text-xl sm:text-2xl font-semibold text-slate-700">🌐 DNS logovi</h1>
      <div class="text-sm text-gray-600">Prikazano {{ items.length }} / {{ total }}</div>
    </div>

    <div class="flex flex-col sm:flex-row gap-3 sm:items-center">
      <input
        v-model="search"
        @keyup.enter="reload()"
        type="text"
        placeholder="🔎 Pretraga (domain ili IP)…"
        class="border border-gray-300 px-3 py-2 rounded w-full sm:w-[340px] shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      <label class="inline-flex items-center text-sm gap-2">
        <input type="checkbox" v-model="blockedOnly" @change="reload()" />
        Samo blokirani
      </label>

      <div class="flex items-center gap-2">
        <select v-model="sortBy" class="border px-2 py-2 rounded text-sm">
          <option value="timestamp">Vreme</option>
          <option value="name">Domain</option>
        </select>
        <button @click="toggleSortOrder" class="px-3 py-2 border rounded text-sm">
          {{ sortOrder === 'asc' ? '↑' : '↓' }}
        </button>
      </div>

      <div class="sm:ml-auto flex items-center gap-2">
        <button
          @click="prevPage"
          :disabled="page === 1"
          class="px-2 py-1 bg-gray-200 rounded disabled:opacity-50"
        >
          ⬅️
        </button>
        <span class="text-sm">Strana {{ page }}</span>
        <button
          @click="nextPage"
          :disabled="page * limit >= total"
          class="px-2 py-1 bg-gray-200 rounded disabled:opacity-50"
        >
          ➡️
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      <div
        v-for="d in items"
        :key="d._id"
        class="rounded-lg border bg-white/90 p-3 shadow-sm hover:shadow transition"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-sm text-slate-500">Domain</div>
            <div class="font-semibold truncate">{{ d.name }}</div>
            <div class="mt-1 text-xs text-gray-500">
              {{ new Date(d.timestamp).toLocaleString() }}
            </div>
          </div>
          <span
            :class="
              d.category === 'blocked'
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            "
            class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs shrink-0"
          >
            {{ d.category === 'blocked' ? '🚫 blocked' : '✅ normal' }}
          </span>
        </div>

        <div class="mt-3 text-sm">
          <span class="text-slate-500">IP:</span>
          <button
            class="ml-1 underline decoration-dotted hover:text-blue-700"
            @click="openPerIp(d.ip)"
            :title="`Prikaži domene za ${d.ip}`"
          >
            {{ d.ip || '—' }}
          </button>
        </div>
      </div>
    </div>

    <teleport to="body">
      <transition name="fade">
        <div
          v-if="showDomains"
          class="fixed inset-0 z-[9995] flex"
          @click.self="closeDomains"
          role="dialog"
          aria-modal="true"
        >
          <div class="absolute inset-0 bg-black/40"></div>
          <div
            class="relative ml-auto h-full w-full sm:w-[720px] bg-white shadow-xl overflow-y-auto"
          >
            <div
              class="sticky top-0 z-10 bg-white/90 backdrop-blur border-b p-4 flex items-center justify-between"
            >
              <h3 class="text-lg font-semibold">
                🌐 DNS logovi — {{ domainsFor?.ip || 'Nepoznato' }}
              </h3>
              <button
                @click="closeDomains"
                class="text-gray-500 hover:text-red-600 text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <div class="p-4 space-y-4">
              <div class="flex flex-col sm:flex-row sm:items-center gap-2">
                <input
                  v-model="domainsSearch"
                  @keyup.enter="fetchDomainsForIp()"
                  placeholder="🔎 Pretraga domain/ip…"
                  class="border px-3 py-2 rounded w-full sm:w-1/2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <div class="flex items-center gap-2">
                  <select v-model="domainsSortBy" class="border px-2 py-2 rounded text-sm">
                    <option value="timestamp">Vreme</option>
                    <option value="name">Domain</option>
                  </select>
                  <button @click="toggleDomainsSort" class="px-3 py-2 border rounded text-sm">
                    {{ domainsSortOrder === 'asc' ? '↑' : '↓' }}
                  </button>

                  <label class="inline-flex items-center text-sm gap-2">
                    <input
                      type="checkbox"
                      v-model="domainsBlockedOnly"
                      @change="fetchDomainsForIp()"
                    />
                    Samo blokirani
                  </label>
                </div>
                <div class="sm:ml-auto text-sm text-gray-600">
                  Prikazano {{ domainsItems.length }} / {{ domainsTotal }}
                </div>
              </div>

              <div class="space-y-2">
                <div
                  v-for="d in domainsItems"
                  :key="d._id"
                  class="border rounded-lg p-3 bg-slate-50 flex items-center justify-between"
                >
                  <div class="min-w-0">
                    <div class="font-medium truncate">{{ d.name }}</div>
                    <div class="text-xs text-gray-500">
                      {{ new Date(d.timestamp).toLocaleString() }} •
                      {{ d.category === 'blocked' ? '🚫 blocked' : '✅ normal' }}
                    </div>
                  </div>
                  <div class="text-xs text-gray-600 shrink-0">
                    IP: {{ d.ip || domainsFor?.ip || '—' }}
                  </div>
                </div>
              </div>

              <div class="flex items-center justify-between pt-2">
                <div class="text-sm">Strana {{ domainsPage }}</div>
                <div class="flex items-center gap-2">
                  <button
                    class="px-2 py-1 bg-gray-200 rounded"
                    :disabled="domainsPage <= 1"
                    @click="prevDomainsPage"
                  >
                    ⬅️
                  </button>

                  <button
                    class="px-2 py-1 bg-gray-200 rounded"
                    :disabled="domainsPage * domainsLimit >= domainsTotal"
                    @click="nextDomainsPage"
                  >
                    ➡️
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </teleport>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'

const route = useRoute()
const router = useRouter()

const items = ref([])
const total = ref(0)
const page = ref(parseInt(route.query.page) || 1)
const limit = ref(parseInt(route.query.limit) || 24)
const search = ref(route.query.search || '')
const sortBy = ref(route.query.sortBy || 'timestamp')
const sortOrder = ref(route.query.sortOrder || 'desc')
const blockedOnly = ref(route.query.blockedOnly === '1')

const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  reload()
}

const toggleDomainsSort = () => {
  domainsSortOrder.value = domainsSortOrder.value === 'asc' ? 'desc' : 'asc'
  fetchDomainsForIp()
}

const prevDomainsPage = () => {
  if (domainsPage.value > 1) {
    domainsPage.value--
    fetchDomainsForIp()
  }
}

const nextDomainsPage = () => {
  if (domainsPage.value * domainsLimit.value < domainsTotal.value) {
    domainsPage.value++
    fetchDomainsForIp()
  }
}

async function fetchAll() {
  const params = new URLSearchParams({
    page: String(page.value),
    limit: String(limit.value),
    search: search.value,
    sortBy: sortBy.value,
    sortOrder: sortOrder.value,
  })
  const base = blockedOnly.value ? '/api/domains/blocked' : '/api/domains'
  const res = await fetchWithAuth(`${base}?${params.toString()}`)
  if (!res.ok) {
    items.value = []
    total.value = 0
    return
  }
  const data = await res.json()
  items.value = data.data || []
  total.value = data.total || 0
}

function reload() {
  page.value = 1
  pushState()
  fetchAll()
}

function pushState() {
  router.replace({
    query: {
      page: page.value,
      limit: limit.value,
      search: search.value || undefined,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      blockedOnly: blockedOnly.value ? '1' : undefined,
    },
  })
}

function nextPage() {
  if (page.value * limit.value < total.value) {
    page.value++
    pushState()
    fetchAll()
  }
}
function prevPage() {
  if (page.value > 1) {
    page.value--
    pushState()
    fetchAll()
  }
}

watch(
  () => route.query,
  (q) => {
    page.value = parseInt(q.page) || 1
    limit.value = parseInt(q.limit) || 24
    search.value = q.search || ''
    sortBy.value = q.sortBy || 'timestamp'
    sortOrder.value = q.sortOrder || 'desc'
    blockedOnly.value = q.blockedOnly === '1'
    fetchAll()
  },
  { immediate: true }
)

const showDomains = ref(false)
const domainsFor = ref(null)
const domainsItems = ref([])
const domainsTotal = ref(0)
const domainsPage = ref(1)
const domainsLimit = ref(20)
const domainsSearch = ref('')
const domainsSortBy = ref('timestamp')
const domainsSortOrder = ref('desc')
const domainsBlockedOnly = ref(false)

const openPerIp = (ip) => {
  domainsFor.value = { ip }
  domainsPage.value = 1
  domainsSearch.value = ip
  showDomains.value = true
  fetchDomainsForIp()
}
const closeDomains = () => {
  showDomains.value = false
  domainsFor.value = null
  domainsItems.value = []
  domainsTotal.value = 0
  domainsSearch.value = ''
}

async function fetchDomainsForIp() {
  try {
    const params = new URLSearchParams({
      page: String(domainsPage.value),
      limit: String(domainsLimit.value),
      search: domainsSearch.value || (domainsFor.value?.ip ?? ''),
      sortBy: domainsSortBy.value,
      sortOrder: domainsSortOrder.value,
    })
    const path = domainsBlockedOnly.value
      ? '/api/domains/blocked'
      : '/api/domains'
    const res = await fetchWithAuth(`${path}?${params.toString()}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    domainsItems.value = Array.isArray(data.data) ? data.data : []
    domainsTotal.value = data.total ?? 0
  } catch (e) {
    console.error('Neuspešno učitavanje domena:', e)
    domainsItems.value = []
    domainsTotal.value = 0
  }
}
</script>

<style scoped>
.glass-container {
  backdrop-filter: saturate(140%) blur(2px);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
