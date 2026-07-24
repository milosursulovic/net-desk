<template>
  <div class="glass-container space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <h1 class="text-2xl font-bold text-slate-800">Netdesk Agenti</h1>
      <div class="flex gap-2">
        <AppButton variant="secondary" to="/computers-without-agent">Računari bez agenta</AppButton>
        <AppButton variant="secondary" to="/agent-releases">Verzije agenta</AppButton>
      </div>
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

        <button
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 sm:hidden"
          @click="detailedFiltersOpen = !detailedFiltersOpen"
        >
          Detaljni filteri
          <span
            v-if="activeDetailedFilterCount"
            class="rounded-full bg-blue-600 px-1.5 py-0.5 text-xs font-semibold text-white"
          >{{ activeDetailedFilterCount }}</span>
          <span class="text-xs">{{ detailedFiltersOpen ? '▲' : '▼' }}</span>
        </button>
      </div>

      <!-- Detaljni filteri - skupljeno na mobilnom po difoltu -->
      <div :class="detailedFiltersOpen ? 'block' : 'hidden sm:block'">
        <div class="flex flex-wrap items-center gap-2">
          <select v-model="connectivityStatus" class="app-input w-auto" aria-label="Filter po konekciji">
            <option value="">Sve konekcije</option>
            <option value="online">Online</option>
            <option value="stale">Neaktivan</option>
            <option value="offline">Offline</option>
            <option value="unknown">Nepoznato</option>
          </select>

          <select v-model="deploymentGroup" class="app-input w-auto" aria-label="Filter po deployment grupi">
            <option value="">Sve deployment grupe</option>
            <option v-for="g in DEPLOYMENT_GROUPS" :key="g" :value="g">{{ g }}</option>
          </select>

          <select v-model="os" class="app-input w-auto" aria-label="Filter po operativnom sistemu">
            <option value="">Svi OS</option>
            <option v-for="o in osOptions" :key="o" :value="o">{{ o }}</option>
          </select>
        </div>

        <div class="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <label class="block text-xs text-slate-500 mb-1" for="enrolledFrom">Enroll od</label>
            <input id="enrolledFrom" v-model="enrolledFrom" type="date" class="app-input w-auto text-sm" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1" for="enrolledTo">Enroll do</label>
            <input id="enrolledTo" v-model="enrolledTo" type="date" class="app-input w-auto text-sm" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1" for="heartbeatFrom">Heartbeat od</label>
            <input id="heartbeatFrom" v-model="heartbeatFrom" type="date" class="app-input w-auto text-sm" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1" for="heartbeatTo">Heartbeat do</label>
            <input id="heartbeatTo" v-model="heartbeatTo" type="date" class="app-input w-auto text-sm" />
          </div>
          <AppButton variant="neutral" @click="clearDetailedFilters">Poništi filtere</AppButton>
        </div>
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

      <label v-if="items.length" class="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" :checked="allVisibleSelected" @change="toggleSelectAllVisible" />
        Selektuj sve prikazane ({{ selectedIds.size }} izabrano)
      </label>
    </div>

    <!-- Batch komanda - vidljivo samo kad je bar 1 agent selektovan -->
    <div v-if="selectedIds.size" class="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
      <div class="font-medium text-blue-900">
        Pošalji komandu na {{ selectedIds.size }} izabranih agenata
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="text-sm text-slate-600">Tip komande</label>
          <select v-model="batchForm.commandType" class="app-input w-full">
            <option v-for="c in COMMAND_TYPES" :key="c" :value="c">{{ COMMAND_LABELS[c] }}</option>
          </select>
        </div>
        <FormInput v-if="isBatchServiceCommand" v-model.trim="batchForm.serviceName" label="Naziv servisa" placeholder="Spooler" />
      </div>
      <div v-if="batchForm.commandType === 'run_powershell_script'" class="space-y-2">
        <div>
          <label class="text-sm text-slate-600">Gotova skripta (opciono)</label>
          <select v-model="batchSelectedPresetId" class="app-input w-full" @change="applyBatchPreset">
            <option value="">— Prilagođena skripta —</option>
            <option v-for="p in POWERSHELL_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
        </div>
        <div>
          <label class="text-sm text-slate-600">PowerShell skripta</label>
          <textarea v-model="batchForm.script" rows="6" class="app-input w-full font-mono text-xs" placeholder="Get-Service | Where-Object ..."></textarea>
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <AppButton variant="neutral" @click="clearSelection">Poništi selekciju</AppButton>
        <AppButton variant="success" :disabled="sendingBatch" @click="sendBatchJob">
          {{ sendingBatch ? 'Šaljem…' : `Pošalji na ${selectedIds.size} agenata` }}
        </AppButton>
      </div>
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
            <div class="min-w-0 flex items-start gap-2">
              <input
                type="checkbox"
                class="mt-1.5 shrink-0"
                :checked="selectedIds.has(a.id)"
                @change="toggleSelect(a.id)"
                aria-label="Selektuj agenta"
              />
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { fmtDate as formatDate, fmtRelative } from '@/utils/format.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import { useToast } from '@/composables/useToast.js'
import { useAbortableFetch } from '@/composables/useAbortableFetch.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { parseError } from '@/utils/api.js'
import { COMMAND_TYPES, COMMAND_LABELS, SERVICE_COMMANDS } from '@/constants/agentCommands.js'
import { POWERSHELL_PRESETS } from '@/constants/powershellPresets.js'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import FormInput from '@/components/FormInput.vue'
import AppButton from '@/components/AppButton.vue'

const fmtDate = (d) => formatDate(d, 'sr-RS')
const { toast, showToast, copyToClipboard } = useToast()
const { getSignal, abort } = useAbortableFetch()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()

const DEPLOYMENT_GROUPS = ['test', 'it', 'pilot', 'rest']

const {
  page,
  limit,
  search,
  status,
  connectivityStatus,
  deploymentGroup,
  os,
  enrolledFrom,
  enrolledTo,
  heartbeatFrom,
  heartbeatTo,
  nextPage,
  prevPage,
  applyServerPagination,
} = usePaginatedRoute({
  fields: {
    page: { type: 'int', default: 1 },
    limit: { type: 'int', default: 20 },
    search: { type: 'string', default: '', omitIfEmpty: true },
    status: { default: 'all', oneOf: ['all', 'active', 'revoked'] },
    connectivityStatus: {
      type: 'string',
      default: '',
      omitIfEmpty: true,
      oneOf: ['', 'online', 'stale', 'offline', 'unknown'],
    },
    deploymentGroup: {
      type: 'string',
      default: '',
      omitIfEmpty: true,
      oneOf: ['', ...DEPLOYMENT_GROUPS],
    },
    os: { type: 'string', default: '', omitIfEmpty: true },
    enrolledFrom: { type: 'string', default: '', omitIfEmpty: true },
    enrolledTo: { type: 'string', default: '', omitIfEmpty: true },
    heartbeatFrom: { type: 'string', default: '', omitIfEmpty: true },
    heartbeatTo: { type: 'string', default: '', omitIfEmpty: true },
  },
  resetPageOn: [
    'search',
    'status',
    'connectivityStatus',
    'deploymentGroup',
    'os',
    'enrolledFrom',
    'enrolledTo',
    'heartbeatFrom',
    'heartbeatTo',
  ],
  useReplace: true,
})

watch(
  [
    page,
    limit,
    search,
    status,
    connectivityStatus,
    deploymentGroup,
    os,
    enrolledFrom,
    enrolledTo,
    heartbeatFrom,
    heartbeatTo,
  ],
  fetchData,
)

const items = ref([])
const total = ref(0)
const totalPages = ref(0)
const searchInput = ref(search.value)
const loading = ref(false)
const osOptions = ref([])

// Detaljni filteri su na mobilnom skupljeni po difoltu (ispod sm) - broj na
// dugmetu je vizuelni podsetnik da nešto NIJE na difoltnoj vrednosti, čak i
// dok je panel zatvoren.
const detailedFiltersOpen = ref(false)
const activeDetailedFilterCount = computed(() => {
  let n = 0
  if (connectivityStatus.value) n++
  if (deploymentGroup.value) n++
  if (os.value) n++
  if (enrolledFrom.value) n++
  if (enrolledTo.value) n++
  if (heartbeatFrom.value) n++
  if (heartbeatTo.value) n++
  return n
})

let searchT = null

async function fetchFilterOptions() {
  try {
    const res = await fetchWithAuth('/api/protected/agents/filter-options')
    if (!res.ok) throw new Error()
    const data = await res.json()
    osOptions.value = data.os || []
  } catch (e) {
    console.error('Neuspešno dohvatanje opcija filtera', e)
  }
}

function clearDetailedFilters() {
  connectivityStatus.value = ''
  deploymentGroup.value = ''
  os.value = ''
  enrolledFrom.value = ''
  enrolledTo.value = ''
  heartbeatFrom.value = ''
  heartbeatTo.value = ''
}

async function fetchData() {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: page.value,
      limit: limit.value,
      search: search.value,
      status: status.value,
    })
    if (connectivityStatus.value) params.set('connectivityStatus', connectivityStatus.value)
    if (deploymentGroup.value) params.set('deploymentGroup', deploymentGroup.value)
    if (os.value) params.set('os', os.value)
    if (enrolledFrom.value) params.set('enrolledFrom', enrolledFrom.value)
    if (enrolledTo.value) params.set('enrolledTo', enrolledTo.value)
    if (heartbeatFrom.value) params.set('heartbeatFrom', heartbeatFrom.value)
    if (heartbeatTo.value) params.set('heartbeatTo', heartbeatTo.value)

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

// Selekcija za batch komande - samo trenutno prikazana (paginirana) strana,
// ne prelazi kroz stranice automatski.
const selectedIds = ref(new Set())
const allVisibleSelected = computed(
  () => items.value.length > 0 && items.value.every((a) => selectedIds.value.has(a.id)),
)

function toggleSelect(id) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function toggleSelectAllVisible() {
  if (allVisibleSelected.value) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(items.value.map((a) => a.id))
  }
}

function clearSelection() {
  selectedIds.value = new Set()
}

const batchForm = ref({ commandType: 'collect_inventory', serviceName: '', script: '' })
const isBatchServiceCommand = computed(() => SERVICE_COMMANDS.has(batchForm.value.commandType))
const batchSelectedPresetId = ref('')
const sendingBatch = ref(false)

function applyBatchPreset() {
  const preset = POWERSHELL_PRESETS.find((p) => p.id === batchSelectedPresetId.value)
  batchForm.value.script = preset ? preset.script : ''
}

async function sendBatchJob() {
  const payload = {}
  if (isBatchServiceCommand.value) {
    if (!batchForm.value.serviceName.trim()) {
      showToast('Naziv servisa je obavezan', { prefix: '❌ ', duration: 3000 })
      return
    }
    payload.serviceName = batchForm.value.serviceName.trim()
  }
  if (batchForm.value.commandType === 'run_powershell_script') {
    if (!batchForm.value.script.trim()) {
      showToast('Skripta je obavezna', { prefix: '❌ ', duration: 3000 })
      return
    }
    payload.script = batchForm.value.script.trim()
  }

  const ok = await askConfirm(
    `Poslati "${COMMAND_LABELS[batchForm.value.commandType]}" na ${selectedIds.value.size} agenata?`,
    { title: 'Batch komanda' },
  )
  if (!ok) return

  sendingBatch.value = true
  try {
    const res = await fetchWithAuth('/api/protected/agents/jobs/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commandType: batchForm.value.commandType,
        payload,
        agentIds: [...selectedIds.value],
      }),
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri slanju batch komande'))
    const data = await res.json()

    const parts = [`Poslato na ${data.created.length} agenata`]
    if (data.skipped.length) parts.push(`preskočeno ${data.skipped.length}`)
    showToast(parts.join(', '))

    clearSelection()
  } catch (e) {
    console.error(e)
    showToast(e?.message || 'Greška pri slanju batch komande', { prefix: '❌ ', duration: 3000 })
  } finally {
    sendingBatch.value = false
  }
}

onBeforeUnmount(() => {
  abort()
  clearTimeout(searchT)
})

onMounted(() => {
  fetchFilterOptions()
  fetchData()
})
</script>
