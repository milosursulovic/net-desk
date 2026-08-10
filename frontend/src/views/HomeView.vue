<template>
  <div class="glass-container">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <h1 class="text-2xl font-bold text-slate-800">IP Adrese</h1>

      <div class="flex flex-wrap items-center gap-2">
        <AppButton variant="success" @click="addEntry">Dodaj</AppButton>

        <AppButton variant="secondary" @click="exportToXlsx">Izvezi XLSX</AppButton>

        <AppButton variant="secondary" to="/computers-for-repack">
          📦 Za pakovanje{{ counts.pendingRepack ? ` (${counts.pendingRepack})` : '' }}
        </AppButton>
      </div>
    </div>

    <div class="mb-4 space-y-3">
      <!-- Pretraga -->
      <input
        v-model="search"
        @input="page = 1"
        type="text"
        placeholder="Pretraga po IP-u, imenu računara, odeljenju..."
        class="app-input w-full"
      />

      <!-- Filteri -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 sm:hidden"
          @click="filtersOpen = !filtersOpen"
        >
          Filteri
          <span
            v-if="activeFilterCount"
            class="rounded-full bg-blue-600 px-1.5 py-0.5 text-xs font-semibold text-white"
          >{{ activeFilterCount }}</span>
          <span class="text-xs">{{ filtersOpen ? '▲' : '▼' }}</span>
        </button>
      </div>

      <div class="flex-wrap items-center gap-2" :class="filtersOpen ? 'flex' : 'hidden sm:flex'">
        <select v-model="status" class="app-input w-auto max-w-full min-w-0 truncate py-2 text-sm" :title="'Filter statusa'">
          <option value="all">Svi statusi</option>
          <option value="online">Samo online</option>
          <option value="offline">Samo offline</option>
        </select>

        <select v-model="entryType" class="app-input w-auto max-w-full min-w-0 truncate py-2 text-sm" :title="'Filter tipa'">
          <option value="all">Svi tipovi</option>
          <option value="computer">Računari</option>
          <option value="device">Aparati</option>
          <option value="unknown">Nepoznato</option>
        </select>

        <select v-model="department" class="app-input w-auto max-w-full min-w-0 truncate py-2 text-sm" :title="'Filter odeljenja'">
          <option value="">Sva odeljenja</option>
          <option v-for="d in departmentOptions" :key="d" :value="d">{{ d }}</option>
        </select>

        <select v-model="os" class="app-input w-auto max-w-full min-w-0 truncate py-2 text-sm" :title="'Filter operativnog sistema'">
          <option value="">Svi OS</option>
          <option v-for="o in osOptions" :key="o" :value="o">{{ o }}</option>
        </select>

        <select v-model="osArchitecture" class="app-input w-auto max-w-full min-w-0 truncate py-2 text-sm" :title="'Filter arhitekture OS-a'">
          <option value="">Sve arhitekture</option>
          <option v-for="a in osArchitectureOptions" :key="a" :value="a">{{ a }}</option>
        </select>

        <select v-model="rdpApp" class="app-input w-auto max-w-full min-w-0 truncate py-2 text-sm" :title="'Filter RDP/remote-access alata'">
          <option value="">Svi RDP alati</option>
          <option v-for="r in rdpAppOptions" :key="r" :value="r">{{ r }}</option>
        </select>

        <label class="inline-flex items-center gap-1.5 text-sm text-slate-600 shrink-0" title="Folder C:\Izvolte pronađen na računaru">
          <input
            type="checkbox"
            :checked="hasIzvolteFolder === 'true'"
            @change="hasIzvolteFolder = hasIzvolteFolder === 'true' ? '' : 'true'"
          />
          Izvolte folder
        </label>

        <select v-model="sortBy" class="app-input w-auto max-w-full min-w-0 truncate py-2 text-sm">
          <option v-for="o in sortOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>

        <button
          @click="sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'"
          class="px-2.5 py-2 border rounded-lg text-sm hover:bg-slate-50"
          :title="sortOrder === 'asc' ? 'Rastuće — klikni za opadajuće' : 'Opadajuće — klikni za rastuće'"
          aria-label="Promeni redosled sortiranja"
        >
          {{ sortOrder === 'asc' ? '↑' : '↓' }}
        </button>
      </div>

      <!-- Statistika i paginacija - uvek vidljivo, nije deo filter panela -->
      <div class="flex flex-wrap items-center gap-2">
        <span
          class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs bg-emerald-50 text-emerald-700 border-emerald-200"
        >
          <span class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span> Online:
          {{ counts.online }}
        </span>
        <span
          class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs bg-rose-50 text-rose-700 border-rose-200"
        >
          <span class="h-2 w-2 rounded-full bg-rose-500"></span> Offline: {{ counts.offline }}
        </span>

        <span class="mx-1 hidden h-5 w-px bg-slate-200 sm:inline-block"></span>

        <button
          @click="prevPage"
          :disabled="page === 1"
          class="px-2 py-1 bg-white border rounded-lg disabled:opacity-50 hover:bg-slate-100"
        >
          ⬅️
        </button>
        <span class="text-sm text-slate-600">Strana {{ currentPageDisplay }} / {{ totalPages }}</span>
        <button
          @click="nextPage({ total })"
          :disabled="page * limit >= total"
          class="px-2 py-1 bg-white border rounded-lg disabled:opacity-50 hover:bg-slate-100"
        >
          ➡️
        </button>
      </div>

      <p class="text-sm text-slate-500">Prikazano {{ entries.length }} od {{ total }} unosa</p>
    </div>

    <div
      v-if="duplicateTotalGroups > 0"
      class="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 flex items-start justify-between gap-3"
      role="alert"
    >
      <div class="text-sm">
        Pronađeno je
        <b>{{ duplicateTotalGroups }}</b> duplih imena računara (ukupno
        <b>{{ duplicateTotalRows }}</b> zapisa).
      </div>
      <div class="shrink-0">
        <router-link
          to="/duplicates"
          class="text-sm bg-amber-600 text-white px-3 py-1 rounded hover:bg-amber-700"
        >
          Pogledaj detalje
        </router-link>
      </div>
    </div>

    <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      <article
        v-for="entry in entries"
        :key="entry.id"
        class="rounded-xl border bg-white/90 shadow-sm hover:shadow-md transition p-4 flex flex-col"
      >
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div class="min-w-0">
            <div class="text-sm text-slate-500">IP adresa</div>
            <div class="text-lg font-semibold tracking-tight">
              {{ entry.ip }}
            </div>

            <div class="mt-1 text-xs text-slate-500 break-words">
              {{ entry.computerName || '—' }}
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-end gap-2 min-w-0">
            <span
              class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs"
              :class="
                entry.entryType
                  ? 'bg-slate-50 text-slate-700 border-slate-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              "
              title="Tip unosa"
            >
              {{ labelForEntryType(entry.entryType) }}
            </span>

            <span
              v-if="entry.department"
              class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-slate-50 text-slate-700 max-w-40 truncate"
              :title="entry.department"
            >
              {{ entry.department }}
            </span>

            <span
              class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
              :class="
                entry.isOnline
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              "
              :title="statusTooltip(entry)"
            >
              <span
                class="h-2 w-2 rounded-full"
                :class="entry.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'"
              ></span>
              {{ entry.isOnline ? 'Online' : 'Offline' }}
            </span>

            <button
              @click="copyToClipboard(entry.ip, `IP ${entry.ip} kopiran!`)"
              class="text-blue-600 text-sm hover:underline"
              title="Kopiraj IP"
            >
              📋
            </button>
          </div>
        </div>

        <div v-if="entry.flaggedSoftwareCount || entry.flaggedServiceCount || entry.flaggedDriverCount || entry.pendingRepack || entry.hasIzvolteFolder" class="mt-2 flex flex-wrap gap-2">
          <router-link
            v-if="entry.flaggedSoftwareCount || entry.flaggedServiceCount || entry.flaggedDriverCount"
            :to="`/ip/${entry.id}/pdsu`"
            class="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700 hover:bg-red-100"
            :title="`${entry.flaggedSoftwareCount || 0} programa, ${entry.flaggedServiceCount || 0} servisa, ${entry.flaggedDriverCount || 0} drajvera`"
          >
            ⚠ Neželjeni programi/servisi/drajveri
          </router-link>

          <router-link
            v-if="entry.pendingRepack"
            to="/computers-for-repack"
            class="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-100"
            title="Markiran za pakovanje/zamenu komponenti"
          >
            📦 Za pakovanje
          </router-link>

          <button
            v-if="entry.hasIzvolteFolder"
            type="button"
            @click="copyToClipboard(`\\\\${entry.ip}\\Izvolte`, 'Putanja do Izvolte foldera kopirana - nalepi je u Explorer-u')"
            class="appearance-none inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs leading-none text-sky-700 hover:bg-sky-100"
            :title="`Kopiraj putanju \\\\${entry.ip}\\Izvolte (mrežni share, Everyone read/write) - browser ne sme da otvori file:// linkove direktno`"
          >
            📁 Izvolte folder
          </button>
        </div>

        <div class="mt-3 space-y-1.5 text-sm">
          <div class="grid grid-cols-3 gap-2 pt-2">
            <div class="rounded-lg bg-slate-50 px-2 py-1.5">
              <div class="text-xs text-slate-500">RDP App</div>
              <div class="text-sm font-medium break-all">{{ entry.rdpApp || '—' }}</div>
            </div>
            <div class="rounded-lg bg-slate-50 px-2 py-1.5">
              <div class="text-xs text-slate-500">Sistem</div>
              <div class="text-sm font-medium break-all">{{ entry.os || '—' }}</div>
            </div>
            <div class="rounded-lg bg-slate-50 px-2 py-1.5">
              <div class="text-xs text-slate-500">Arhitektura</div>
              <div class="text-sm font-medium break-all">{{ entry.osArchitecture || '—' }}</div>
            </div>
          </div>
        </div>

        <!-- ✅ OPIS / DESCRIPTION -->
        <div v-if="entry.description" class="mt-3 rounded-lg bg-slate-50 px-3 py-2">
          <div class="text-xs text-slate-500 mb-1">Opis</div>

          <p
            class="text-sm text-slate-800 whitespace-pre-wrap break-words"
            :class="expandedDesc[entry.id] ? '' : 'line-clamp-3'"
          >
            {{ entry.description }}
          </p>

          <button
            v-if="entry.description.length > 140"
            @click="toggleDesc(entry.id)"
            class="mt-1 text-xs text-blue-600 hover:underline"
            type="button"
          >
            {{ expandedDesc[entry.id] ? 'Sakrij' : 'Prikaži više' }}
          </button>
        </div>

        <div class="mt-2 text-[11px] text-slate-500">
          Poslednja provera: {{ fmtRelative(entry.lastChecked) }} • Promena statusa:
          {{ fmtRelative(entry.lastStatusChange) }}
        </div>

        <div class="mt-4 pt-3 border-t flex flex-wrap items-center gap-3">
          <button @click="editEntry(entry)" class="text-blue-600 hover:underline text-sm">
            Izmeni
          </button>
          <button
            @click="togglePendingRepack(entry)"
            class="text-sm hover:underline"
            :class="entry.pendingRepack ? 'text-amber-700' : 'text-slate-600'"
            :title="entry.pendingRepack ? 'Ukloni oznaku za pakovanje' : 'Markiraj za pakovanje'"
          >
            {{ entry.pendingRepack ? '📦 Ukloni oznaku' : '📦 Za pakovanje' }}
          </button>
          <button v-if="isAdmin" @click="deleteEntry(entry.id)" class="text-red-600 hover:underline text-sm">
            Obriši
          </button>
          <router-link :to="`/ip/${entry.id}/meta`" class="text-slate-600 hover:underline text-sm">
            Meta
          </router-link>
          <router-link :to="`/ip/${entry.id}/pdsu`" class="text-slate-600 hover:underline text-sm">
            PDSU
          </router-link>
          <router-link :to="`/ip/${entry.id}/port-scan`" class="text-slate-600 hover:underline text-sm">
            Port scan
          </router-link>
          <router-link
            v-if="entry.agentId"
            :to="`/agents/${entry.agentId}`"
            class="text-emerald-600 hover:underline text-sm"
            title="Otvori Netdesk Agent za ovaj računar"
          >
            🖥️ Agent
          </router-link>
        </div>
      </article>
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
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { fmtRelative } from '@/utils/format.js'
import { labelForEntryType } from '@/constants/entryTypes.js'
import { downloadFromResponse } from '@/utils/download.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import { useCurrentSite } from '@/composables/useCurrentSite.js'
import { useToast } from '@/composables/useToast.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AppButton from '@/components/AppButton.vue'

const router = useRouter()
const site = useCurrentSite()
const { toast, showToast, copyToClipboard } = useToast()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()
const { isAdmin } = useCurrentUser()

const {
  page,
  limit,
  search,
  sortBy,
  sortOrder,
  status,
  entryType,
  department,
  os,
  osArchitecture,
  rdpApp,
  hasIzvolteFolder,
  nextPage,
  prevPage,
} = usePaginatedRoute({
  fields: {
    page: { type: 'int', default: 1 },
    limit: { type: 'int', default: 10 },
    search: { type: 'string', default: '' },
    sortBy: { type: 'string', default: 'ip' },
    sortOrder: { type: 'string', default: 'asc' },
    status: { type: 'string', default: 'all', oneOf: ['all', 'online', 'offline'] },
    entryType: {
      type: 'string',
      default: 'computer',
      oneOf: ['all', 'computer', 'device', 'unknown'],
    },
    department: { type: 'string', default: '', omitIfEmpty: true },
    os: { type: 'string', default: '', omitIfEmpty: true },
    osArchitecture: { type: 'string', default: '', omitIfEmpty: true },
    rdpApp: { type: 'string', default: '', omitIfEmpty: true },
    hasIzvolteFolder: { type: 'string', default: '', omitIfEmpty: true, oneOf: ['', 'true'] },
  },
  resetPageOn: [
    'sortBy',
    'sortOrder',
    'status',
    'entryType',
    'department',
    'os',
    'osArchitecture',
    'rdpApp',
    'hasIzvolteFolder',
  ],
})

watch(
  [
    page,
    limit,
    search,
    sortBy,
    sortOrder,
    status,
    entryType,
    department,
    os,
    osArchitecture,
    rdpApp,
    hasIzvolteFolder,
    site,
  ],
  fetchData,
  { immediate: true },
)

const departmentOptions = ref([])
const osOptions = ref([])
const osArchitectureOptions = ref([])
const rdpAppOptions = ref([])

async function fetchFilterOptions() {
  try {
    const res = await fetchWithAuth(
      `/api/protected/ip-addresses/filter-options?site=${site.value}`,
    )
    if (!res.ok) throw new Error()
    const data = await res.json()
    departmentOptions.value = data.departments || []
    osOptions.value = data.os || []
    osArchitectureOptions.value = data.osArchitectures || []
    rdpAppOptions.value = data.rdpApps || []
  } catch (err) {
    console.error('Neuspešno dohvatanje opcija filtera')
  }
}

const entries = ref([])
const total = ref(0)
const totalPages = ref(0)
const counts = ref({ online: 0, offline: 0, pendingRepack: 0 })
const currentPageDisplay = computed(() => (totalPages.value === 0 ? '0' : page.value))

// Filter panel je na mobilnom skupljen po difoltu (ispod sm) - broj na dugmetu
// je vizuelni podsetnik da nešto NIJE na difoltnoj vrednosti, čak i dok je
// panel zatvoren.
const filtersOpen = ref(false)
const activeFilterCount = computed(() => {
  let n = 0
  if (status.value !== 'all') n++
  if (entryType.value !== 'computer') n++
  if (department.value) n++
  if (os.value) n++
  if (osArchitecture.value) n++
  if (rdpApp.value) n++
  if (hasIzvolteFolder.value) n++
  return n
})

const expandedDesc = ref({}) // ✅ novo: state za expand opisa

const sortOptions = [
  { value: 'ip', label: 'IP adresa' },
  { value: 'computerName', label: 'Ime računara' },
  { value: 'department', label: 'Odeljenje' },
  { value: 'rdpApp', label: 'RDP App' },
  { value: 'os', label: 'Sistem' },
]

const addEntry = () => router.push('/add')
const editEntry = (entry) => router.push(`/edit/${entry.id}`)

const toggleDesc = (id) => {
  expandedDesc.value[id] = !expandedDesc.value[id]
}

async function fetchData() {
  const params = new URLSearchParams({
    page: page.value,
    limit: limit.value,
    search: search.value,
    sortBy: sortBy.value,
    sortOrder: sortOrder.value,
    status: status.value,
    entryType: entryType.value,
    site: site.value,
  })
  if (department.value) params.set('department', department.value)
  if (os.value) params.set('os', os.value)
  if (osArchitecture.value) params.set('osArchitecture', osArchitecture.value)
  if (rdpApp.value) params.set('rdpApp', rdpApp.value)
  if (hasIzvolteFolder.value) params.set('hasIzvolteFolder', hasIzvolteFolder.value)

  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses?${params.toString()}`)
    if (!res.ok) throw new Error()
    const data = await res.json()
    entries.value = data.entries
    total.value = data.total
    totalPages.value = data.totalPages
    counts.value = data.counts || { online: 0, offline: 0, pendingRepack: 0 }

    // ✅ opcionalno: očisti expand state za obrisane/skrivene entry-je
    const next = {}
    for (const e of entries.value) next[e.id] = !!expandedDesc.value[e.id]
    expandedDesc.value = next
  } catch (err) {
    console.error('Neuspešno dohvatanje podataka')
  }
}

const togglePendingRepack = async (entry) => {
  const nextValue = !entry.pendingRepack
  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses/${entry.id}/pending-repack`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingRepack: nextValue }),
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    entry.pendingRepack = nextValue
    counts.value.pendingRepack += nextValue ? 1 : -1
  } catch (err) {
    console.error('Neuspešna izmena oznake za pakovanje', err)
    showToast('Greška pri izmeni oznake', { prefix: '❌ ', duration: 3000 })
  }
}

const deleteEntry = async (id) => {
  const ok = await askConfirm('Da li si siguran da želiš da obrišeš ovaj unos?', {
    title: 'Brisanje unosa',
  })
  if (!ok) return

  const res = await fetchWithAuth(`/api/protected/ip-addresses/${id}`, { method: 'DELETE' })
  if (res.ok) {
    fetchData()
  } else {
    showToast('Greška pri brisanju unosa', { prefix: '❌ ', duration: 3000 })
  }
}

const exportToXlsx = async () => {
  try {
    const params = new URLSearchParams({ search: search.value, site: site.value })
    await downloadFromResponse(
      await fetchWithAuth(`/api/protected/ip-addresses/export-xlsx?${params.toString()}`),
      'ip-entries.xlsx'
    )
  } catch {
    console.log('Greška pri izvozu XLSX-a')
  }
}

const statusTooltip = (e) => {
  const onlineTxt = e.isOnline ? 'Online' : 'Offline'
  const lc = e.lastChecked ? new Date(e.lastChecked).toLocaleString() : '—'
  const lsc = e.lastStatusChange ? new Date(e.lastStatusChange).toLocaleString() : '—'
  return `${onlineTxt}\nPoslednja provera: ${lc}\nPromena statusa: ${lsc}`
}

const duplicateTotalGroups = ref(0)
const duplicateTotalRows = ref(0)

async function fetchDuplicateNames() {
  try {
    const params = new URLSearchParams({
      search: search.value,
      status: status.value,
      site: site.value,
    })
    const res = await fetchWithAuth(`/api/protected/ip-addresses/duplicates?${params.toString()}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    duplicateTotalGroups.value = data.totalDuplicateGroups || 0
    duplicateTotalRows.value = data.totalDuplicateRows || 0
  } catch (e) {
    console.error('Neuspešno dohvatanje duplikata:', e)
    duplicateTotalGroups.value = 0
    duplicateTotalRows.value = 0
  }
}

const AUTO_REFRESH_SEC = 30
let refreshTimer = null
onMounted(() => {
  refreshTimer = setInterval(() => {
    fetchData()
  }, AUTO_REFRESH_SEC * 1000)
  fetchDuplicateNames()
  fetchFilterOptions()
})
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

watch(site, () => {
  // department/os su dropdown vrednosti preuzete iz PRETHODNE lokacije -
  // ostavljanje stare vrednosti posle promene lokacije bi filtriralo na
  // vrednost koja verovatno ne postoji na novoj lokaciji (prazna lista).
  department.value = ''
  os.value = ''
  fetchDuplicateNames()
  fetchFilterOptions()
})
</script>

<style scoped>
/* fallback ako nemaš tailwind line-clamp plugin */
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
