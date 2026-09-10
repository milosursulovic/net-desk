<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">{{ t('home.title') }}</h1>

      <div class="flex flex-wrap items-center gap-2">
        <AppButton variant="success" @click="addEntry">{{ t('home.add') }}</AppButton>

        <AppButton variant="secondary" @click="exportToXlsx">{{ t('home.exportXlsx') }}</AppButton>

        <AppButton variant="secondary" to="/computers-for-repack" class="inline-flex items-center gap-1.5">
          <NavIcon name="package" />
          {{ t('home.forPackaging') }}{{ counts.pendingRepack ? ` (${counts.pendingRepack})` : '' }}
        </AppButton>

        <AppButton variant="secondary" to="/free-ip-addresses">{{ t('home.freeIps') }}</AppButton>

        <AppButton variant="secondary" to="/groups">{{ t('home.groups') }}</AppButton>
      </div>
    </div>

    <div class="space-y-3">
      <!-- Pretraga -->
      <input
        v-model="search"
        @input="page = 1"
        type="text"
        :placeholder="t('home.searchPlaceholder')"
        class="app-input w-full"
      />

      <!-- Filteri -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-sunken sm:hidden"
          @click="filtersOpen = !filtersOpen"
        >
          {{ t('home.filters') }}
          <span
            v-if="activeFilterCount"
            class="rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold text-white"
          >{{ activeFilterCount }}</span>
          <NavIcon :name="filtersOpen ? 'chevron-up' : 'chevron-down'" class="text-xs" />
        </button>
      </div>

      <div class="flex-wrap items-center gap-2" :class="filtersOpen ? 'flex' : 'hidden sm:flex'">
        <select v-model="status" class="app-input w-auto max-w-full min-w-0 truncate py-2 text-sm" :title="t('home.statusAll')">
          <option value="all">{{ t('home.statusAll') }}</option>
          <option value="online">{{ t('home.statusOnline') }}</option>
          <option value="offline">{{ t('home.statusOffline') }}</option>
        </select>

        <select v-model="entryType" class="app-input w-auto max-w-full min-w-0 truncate py-2 text-sm" :title="t('home.typeAll')">
          <option value="all">{{ t('home.typeAll') }}</option>
          <option value="computer">{{ t('home.typeComputer') }}</option>
          <option value="device">{{ t('home.typeDevice') }}</option>
          <option value="unknown">{{ t('home.typeUnknown') }}</option>
        </select>

        <MultiSelect
          v-model="department"
          :options="departmentOptions"
          :placeholder="t('home.allDepartments')"
          class="w-auto max-w-40 min-w-0"
          :title="t('home.departmentFilterTitle')"
        />

        <MultiSelect
          v-model="os"
          :options="osOptions"
          :placeholder="t('home.allOs')"
          class="w-auto max-w-40 min-w-0"
          :title="t('home.osFilterTitle')"
        />

        <select v-model="osArchitecture" class="app-input w-auto max-w-full min-w-0 truncate py-2 text-sm" :title="t('home.archFilterTitle')">
          <option value="">{{ t('home.allArchitectures') }}</option>
          <option v-for="a in osArchitectureOptions" :key="a" :value="a">{{ a }}</option>
        </select>

        <MultiSelect
          v-model="rdpApp"
          :options="rdpAppOptions"
          :placeholder="t('home.allRdpTools')"
          class="w-auto max-w-40 min-w-0"
          :title="t('home.rdpFilterTitle')"
        />

        <label class="inline-flex items-center gap-1.5 text-sm text-ink-secondary shrink-0" :title="t('home.missingIzvolteTitle')">
          <input
            type="checkbox"
            :checked="missingIzvolteFolder === 'true'"
            @change="missingIzvolteFolder = missingIzvolteFolder === 'true' ? '' : 'true'"
          />
          {{ t('home.missingIzvolteLabel') }}
        </label>

        <select v-model="sortBy" class="app-input w-auto max-w-full min-w-0 truncate py-2 text-sm">
          <option v-for="o in sortOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>

        <button
          @click="sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'"
          class="px-2.5 py-2 border border-line rounded-lg text-sm hover:bg-surface-sunken"
          :title="sortOrder === 'asc' ? t('home.sortAsc') : t('home.sortDesc')"
          :aria-label="t('home.changeSortOrder')"
        >
          <NavIcon :name="sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'" />
        </button>
      </div>

      <!-- Statistika i paginacija - uvek vidljivo, nije deo filter panela -->
      <div class="flex flex-wrap items-center gap-3">
        <StatusPill status="good" :label="t('home.online', { n: counts.online })" />
        <StatusPill status="bad" :label="t('home.offline', { n: counts.offline })" />

        <span class="mx-1 hidden h-5 w-px bg-line sm:inline-block"></span>

        <PaginationBar
          :page="page"
          :limit="limit"
          :total="total"
          :total-pages="totalPages"
          :limit-options="[10, 20, 50, 100]"
          @prev="prevPage"
          @next="nextPage({ total })"
          @update:limit="(v) => (limit = v)"
        />
      </div>

      <p class="text-sm text-ink-muted">{{ t('home.shown', { shown: entries.length, total }) }}</p>
    </div>

    <div
      v-if="duplicateTotalGroups > 0"
      class="rounded-lg border border-warn/40 bg-warn-subtle px-3 py-2 text-warn flex items-start justify-between gap-3"
      role="alert"
    >
      <div class="text-sm">
        {{ t('home.duplicatesFoundPrefix') }}
        <b>{{ duplicateTotalGroups }}</b> {{ t('home.duplicatesFoundMid') }}
        <b>{{ duplicateTotalRows }}</b> {{ t('home.duplicatesFoundSuffix') }}
      </div>
      <div class="shrink-0">
        <router-link
          to="/duplicates"
          class="text-sm bg-warn text-white px-3 py-1 rounded hover:brightness-95"
        >
          {{ t('home.viewDetails') }}
        </router-link>
      </div>
    </div>

    <div v-if="!entries.length" class="table-shell p-8 text-center text-ink-muted">
      {{ t('home.noResults') }}
    </div>

    <div v-else class="table-shell">
      <div class="overflow-x-auto">
        <table class="w-full min-w-300 border-collapse text-sm">
          <thead>
            <tr class="table-head-row">
              <th class="px-3 py-2 text-left">{{ t('home.colIpComputer') }}</th>
              <th class="px-3 py-2 text-left">{{ t('home.colType') }}</th>
              <th class="px-3 py-2 text-left">{{ t('home.colStatus') }}</th>
              <th class="px-3 py-2 text-left">{{ t('home.colSystem') }}</th>
              <th class="px-3 py-2 text-left">{{ t('home.colRdpApp') }}</th>
              <th class="px-3 py-2 text-left">{{ t('home.colFlags') }}</th>
              <th class="px-3 py-2 text-left">{{ t('home.colDescription') }}</th>
              <th class="px-3 py-2 text-left">{{ t('home.colLastChecked') }}</th>
              <th class="px-3 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in entries" :key="entry.id" class="group border-b border-line last:border-0 hover:bg-surface-sunken">
              <td class="px-3 py-2.5 align-top">
                <div class="flex items-center gap-1.5">
                  <span class="font-mono font-semibold text-ink">{{ entry.ip }}</span>
                  <button
                    @click="copyToClipboard(entry.ip, t('home.copyIpToast', { ip: entry.ip }))"
                    class="shrink-0 text-ink-muted hover:text-ink"
                    :title="t('home.copyIpTitle')"
                  >
                    <NavIcon name="copy" />
                  </button>
                </div>
                <div class="mt-0.5 text-xs text-ink-muted wrap-break-word">{{ entry.computerName || '—' }}</div>
                <div v-if="entry.department" class="mt-1"><TagChip :label="entry.department" class="max-w-40 truncate" /></div>
              </td>
              <td class="px-3 py-2.5 align-top"><TagChip :label="labelForEntryType(entry.entryType)" :title="t('home.entryTypeTitle')" /></td>
              <td class="px-3 py-2.5 align-top">
                <StatusPill
                  :status="entry.isOnline ? 'good' : 'bad'"
                  :label="entry.isOnline ? t('common.online') : t('common.offline')"
                  :title="statusTooltip(entry)"
                />
              </td>
              <td class="px-3 py-2.5 align-top text-ink-secondary">
                <div>{{ entry.os || '—' }}</div>
                <div class="text-xs text-ink-muted">{{ entry.osArchitecture || '—' }}</div>
              </td>
              <td class="px-3 py-2.5 align-top text-ink-secondary">{{ entry.rdpApp || '—' }}</td>
              <td class="px-3 py-2.5 align-top">
                <div v-if="entry.flaggedSoftwareCount || entry.flaggedServiceCount || entry.flaggedDriverCount || entry.pendingRepack || entry.hasIzvolteFolder" class="flex flex-wrap gap-1">
                  <router-link
                    v-if="entry.flaggedSoftwareCount || entry.flaggedServiceCount || entry.flaggedDriverCount"
                    :to="`/ip/${entry.id}/pdsu`"
                    :title="t('home.flaggedTitle', { soft: entry.flaggedSoftwareCount || 0, svc: entry.flaggedServiceCount || 0, drv: entry.flaggedDriverCount || 0 })"
                  >
                    <StatusPill status="bad" :label="t('home.flaggedLabel')" icon="alert-triangle" />
                  </router-link>

                  <router-link v-if="entry.pendingRepack" to="/computers-for-repack" :title="t('home.repackTitle')">
                    <StatusPill status="warn" :label="t('home.repackLabel')" icon="package" />
                  </router-link>

                  <button
                    v-if="entry.hasIzvolteFolder"
                    type="button"
                    @click="copyToClipboard(`\\\\${entry.ip}\\Izvolte`, t('home.copyIzvolteToast'))"
                    class="appearance-none"
                    :title="t('home.copyIzvolteTitle', { path: `\\\\${entry.ip}\\Izvolte` })"
                  >
                    <StatusPill status="info" :label="t('home.izvolteLabel')" icon="folder" />
                  </button>
                </div>
                <span v-else class="text-ink-muted">—</span>
              </td>
              <td class="px-3 py-2.5 align-top max-w-70 truncate text-xs text-ink-secondary" :title="entry.description">
                {{ entry.description || '—' }}
              </td>
              <td class="px-3 py-2.5 align-top text-xs text-ink-muted font-mono" :title="t('home.statusChange', { date: fmtRelative(entry.lastStatusChange) })">
                {{ fmtRelative(entry.lastChecked) }}
              </td>
              <td class="px-3 py-2.5 align-top text-right">
                <div class="table-row-actions flex-wrap justify-end">
                  <button @click="editEntry(entry)" class="rounded p-1 text-accent hover:bg-surface-sunken" :title="t('common.edit')">
                    <NavIcon name="edit" />
                  </button>
                  <button
                    @click="togglePendingRepack(entry)"
                    class="rounded p-1 hover:bg-surface-sunken"
                    :class="entry.pendingRepack ? 'text-warn' : 'text-ink-secondary'"
                    :title="entry.pendingRepack ? t('home.unmarkRepack') : t('home.markRepack')"
                  >
                    <NavIcon name="package" />
                  </button>
                  <router-link :to="`/ip/${entry.id}/meta`" class="rounded p-1 text-ink-secondary hover:bg-surface-sunken inline-flex" :title="t('nav.metadata')">
                    <NavIcon name="metadata" />
                  </router-link>
                  <router-link :to="`/ip/${entry.id}/pdsu`" class="rounded p-1 text-ink-secondary hover:bg-surface-sunken inline-flex" :title="t('home.pdsuTitle')">
                    <NavIcon name="pdsu" />
                  </router-link>
                  <router-link :to="`/ip/${entry.id}/port-scan`" class="rounded p-1 text-ink-secondary hover:bg-surface-sunken inline-flex" :title="t('home.portScanTitle')">
                    <NavIcon name="port" />
                  </router-link>
                  <router-link
                    v-if="entry.agentId"
                    :to="`/agents/${entry.agentId}`"
                    class="rounded p-1 text-good hover:bg-surface-sunken inline-flex"
                    :title="t('home.openAgentTitle')"
                  >
                    <NavIcon name="agents" />
                  </router-link>
                  <button v-if="isAdmin" @click="deleteEntry(entry.id)" class="rounded p-1 text-bad hover:bg-surface-sunken" :title="t('common.delete')">
                    <NavIcon name="trash" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
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
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
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
import MultiSelect from '@/components/MultiSelect.vue'
import StatusPill from '@/components/StatusPill.vue'
import TagChip from '@/components/TagChip.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import NavIcon from '@/components/NavIcon.vue'

const { t } = useI18n()
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
  missingIzvolteFolder,
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
    department: { type: 'array', default: [] },
    os: { type: 'array', default: [] },
    osArchitecture: { type: 'string', default: '', omitIfEmpty: true },
    rdpApp: { type: 'array', default: [] },
    missingIzvolteFolder: { type: 'string', default: '', omitIfEmpty: true, oneOf: ['', 'true'] },
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
    'missingIzvolteFolder',
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
    missingIzvolteFolder,
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

// Filter panel je na mobilnom skupljen po difoltu (ispod sm) - broj na dugmetu
// je vizuelni podsetnik da nešto NIJE na difoltnoj vrednosti, čak i dok je
// panel zatvoren.
const filtersOpen = ref(false)
const activeFilterCount = computed(() => {
  let n = 0
  if (status.value !== 'all') n++
  if (entryType.value !== 'computer') n++
  if (department.value.length) n++
  if (os.value.length) n++
  if (osArchitecture.value) n++
  if (rdpApp.value.length) n++
  if (missingIzvolteFolder.value) n++
  return n
})

const sortOptions = computed(() => [
  { value: 'ip', label: t('home.sortIp') },
  { value: 'computerName', label: t('home.sortComputerName') },
  { value: 'department', label: t('home.sortDepartment') },
  { value: 'rdpApp', label: t('home.sortRdpApp') },
  { value: 'os', label: t('home.sortOs') },
])

const addEntry = () => router.push('/add')
const editEntry = (entry) => router.push(`/edit/${entry.id}`)

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
  department.value.forEach((v) => params.append('department', v))
  os.value.forEach((v) => params.append('os', v))
  if (osArchitecture.value) params.set('osArchitecture', osArchitecture.value)
  rdpApp.value.forEach((v) => params.append('rdpApp', v))
  if (missingIzvolteFolder.value) params.set('missingIzvolteFolder', missingIzvolteFolder.value)

  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses?${params.toString()}`)
    if (!res.ok) throw new Error()
    const data = await res.json()
    entries.value = data.entries
    total.value = data.total
    totalPages.value = data.totalPages
    counts.value = data.counts || { online: 0, offline: 0, pendingRepack: 0 }
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
    showToast(t('home.toggleRepackErrorToast'), { kind: 'error', duration: 3000 })
  }
}

const deleteEntry = async (id) => {
  const ok = await askConfirm(t('home.confirmDeleteMessage'), {
    title: t('home.confirmDeleteTitle'),
  })
  if (!ok) return

  const res = await fetchWithAuth(`/api/protected/ip-addresses/${id}`, { method: 'DELETE' })
  if (res.ok) {
    fetchData()
  } else {
    showToast(t('home.deleteErrorToast'), { kind: 'error', duration: 3000 })
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
  const onlineTxt = e.isOnline ? t('common.online') : t('common.offline')
  const lc = e.lastChecked ? new Date(e.lastChecked).toLocaleString() : '—'
  const lsc = e.lastStatusChange ? new Date(e.lastStatusChange).toLocaleString() : '—'
  return `${onlineTxt}\n${t('home.colLastChecked')}: ${lc}\n${t('home.statusChange', { date: lsc })}`
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
  department.value = []
  os.value = []
  fetchDuplicateNames()
  fetchFilterOptions()
})
</script>
