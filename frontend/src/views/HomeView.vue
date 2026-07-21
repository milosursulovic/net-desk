<template>
  <div class="glass-container">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <h1 class="text-2xl font-bold text-slate-800">IP Adrese</h1>

      <div class="flex flex-wrap items-center gap-2">
        <AppButton variant="success" @click="addEntry">Dodaj</AppButton>

        <AppButton variant="secondary" @click="exportToXlsx">Izvezi XLSX</AppButton>
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

      <!-- Filteri, status, paginacija -->
      <div class="flex flex-wrap items-center gap-2">
        <select v-model="status" class="app-input w-auto py-2 text-sm" :title="'Filter statusa'">
          <option value="all">Svi statusi</option>
          <option value="online">Samo online</option>
          <option value="offline">Samo offline</option>
        </select>

        <select v-model="entryType" class="app-input w-auto py-2 text-sm" :title="'Filter tipa'">
          <option value="all">Svi tipovi</option>
          <option value="computer">Računari</option>
          <option value="device">Aparati</option>
          <option value="unknown">Nepoznato</option>
        </select>

        <select v-model="department" class="app-input w-auto py-2 text-sm" :title="'Filter odeljenja'">
          <option value="">Sva odeljenja</option>
          <option v-for="d in departmentOptions" :key="d" :value="d">{{ d }}</option>
        </select>

        <select v-model="os" class="app-input w-auto py-2 text-sm" :title="'Filter operativnog sistema'">
          <option value="">Svi OS</option>
          <option v-for="o in osOptions" :key="o" :value="o">{{ o }}</option>
        </select>

        <select v-model="sortBy" class="app-input w-auto py-2 text-sm">
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

        <span class="mx-1 hidden h-5 w-px bg-slate-200 sm:inline-block"></span>

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
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-sm text-slate-500">IP adresa</div>
            <div class="text-lg font-semibold tracking-tight">
              {{ entry.ip }}
            </div>

            <div class="mt-1 text-xs text-slate-500">
              {{ entry.computerName || '—' }}
            </div>
          </div>

          <div class="flex items-center gap-2">
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
              class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-slate-50 text-slate-700"
              title="Odeljenje"
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

        <div class="mt-3 space-y-1.5 text-sm">
          <div class="grid grid-cols-2 gap-2 pt-2">
            <div class="rounded-lg bg-slate-50 px-2 py-1.5">
              <div class="text-xs text-slate-500">RDP App</div>
              <div class="text-sm font-medium break-all">{{ entry.rdpApp || '—' }}</div>
            </div>
            <div class="rounded-lg bg-slate-50 px-2 py-1.5">
              <div class="text-xs text-slate-500">Sistem</div>
              <div class="text-sm font-medium break-all">{{ entry.os || '—' }}</div>
            </div>
            <div class="rounded-lg bg-slate-50 px-2 py-1.5">
              <div class="text-xs text-slate-500">Remote skripta?</div>
              <div class="text-sm font-medium break-all">{{ entry.remoteScript || '—' }}</div>
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
          <button @click="deleteEntry(entry.id)" class="text-red-600 hover:underline text-sm">
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
import { useToast } from '@/composables/useToast.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AppButton from '@/components/AppButton.vue'

const router = useRouter()
const { toast, showToast, copyToClipboard } = useToast()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()

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
  },
  resetPageOn: ['sortBy', 'sortOrder', 'status', 'entryType', 'department', 'os'],
})

watch(
  [page, limit, search, sortBy, sortOrder, status, entryType, department, os],
  fetchData,
  { immediate: true },
)

const departmentOptions = ref([])
const osOptions = ref([])

async function fetchFilterOptions() {
  try {
    const res = await fetchWithAuth('/api/protected/ip-addresses/filter-options')
    if (!res.ok) throw new Error()
    const data = await res.json()
    departmentOptions.value = data.departments || []
    osOptions.value = data.os || []
  } catch (err) {
    console.error('Neuspešno dohvatanje opcija filtera')
  }
}

const entries = ref([])
const total = ref(0)
const totalPages = ref(0)
const counts = ref({ online: 0, offline: 0 })
const currentPageDisplay = computed(() => (totalPages.value === 0 ? '0' : page.value))

const expandedDesc = ref({}) // ✅ novo: state za expand opisa

const sortOptions = [
  { value: 'ip', label: 'IP adresa' },
  { value: 'computerName', label: 'Ime računara' },
  { value: 'department', label: 'Odeljenje' },
  { value: 'rdpApp', label: 'RDP App' },
  { value: 'os', label: 'Sistem' },
  { value: 'remoteScript', label: 'Remote skripta?' },
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
  })
  if (department.value) params.set('department', department.value)
  if (os.value) params.set('os', os.value)

  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses?${params.toString()}`)
    if (!res.ok) throw new Error()
    const data = await res.json()
    entries.value = data.entries
    total.value = data.total
    totalPages.value = data.totalPages
    counts.value = data.counts || { online: 0, offline: 0 }

    // ✅ opcionalno: očisti expand state za obrisane/skrivene entry-je
    const next = {}
    for (const e of entries.value) next[e.id] = !!expandedDesc.value[e.id]
    expandedDesc.value = next
  } catch (err) {
    console.error('Neuspešno dohvatanje podataka')
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
    await downloadFromResponse(
      await fetchWithAuth(
        `/api/protected/ip-addresses/export-xlsx?search=${encodeURIComponent(search.value)}`
      ),
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
