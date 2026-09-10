<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">Štampači</h1>
      <div class="flex flex-wrap items-center gap-2">
        <AppButton variant="success" @click="openCreate">Dodaj štampač</AppButton>
        <AppButton variant="secondary" @click="exportXlsx">Izvezi XLSX</AppButton>
      </div>
    </div>

    <div class="space-y-3">
      <!-- Pretraga -->
      <div class="relative">
        <input v-model="searchInput" @input="onSearchInput" type="text"
          placeholder="Pretraga po nazivu, modelu, IP, serijskom..."
          class="app-input w-full pr-10"
          aria-label="Pretraga štampača" />
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

      <p class="text-sm text-ink-muted">Prikazano {{ items.length }} od {{ total }} štampača</p>
    </div>

    <div class="min-h-50">
      <div v-if="loading" class="table-shell p-4">
        <div v-for="n in 6" :key="n" class="animate-pulse border-b border-line py-3 last:border-0">
          <div class="mb-2 h-4 w-1/3 rounded bg-surface-sunken"></div>
          <div class="h-3 w-1/4 rounded bg-surface-sunken"></div>
        </div>
      </div>

      <div v-else-if="!items.length" class="table-shell p-8 text-center text-ink-muted">
        Nema rezultata za zadate filtere.
      </div>

      <div v-else class="table-shell">
        <div class="overflow-x-auto">
          <table class="w-full min-w-225 border-collapse text-sm">
            <thead>
              <tr class="table-head-row">
                <th class="px-3 py-2 text-left">Naziv</th>
                <th class="px-3 py-2 text-left">Konekcija</th>
                <th class="px-3 py-2 text-left">IP</th>
                <th class="px-3 py-2 text-left">Host</th>
                <th class="px-3 py-2 text-left">Povezani PC</th>
                <th class="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in items" :key="p.id" class="group border-b border-line last:border-0 hover:bg-surface-sunken">
                <td class="px-3 py-2.5 align-top">
                  <div class="font-semibold text-ink">{{ p.name || '—' }}</div>
                  <div class="mt-1 flex flex-wrap items-center gap-1.5">
                    <TagChip v-if="p.manufacturer" :label="p.manufacturer" />
                    <TagChip v-if="p.model" :label="p.model" />
                    <TagChip v-if="p.serial" :label="`SN: ${p.serial}`" />
                    <TagChip v-if="p.department" :label="p.department" />
                  </div>
                </td>
                <td class="px-3 py-2.5 align-top">
                  <div class="flex items-center gap-2">
                    <TagChip :label="p.connectionType || '—'" />
                    <StatusPill v-if="p.shared" status="good" label="Deljen" />
                  </div>
                </td>
                <td class="px-3 py-2.5 align-top">
                  <div class="flex items-center gap-1.5">
                    <span class="font-mono text-ink-secondary">{{ p.ip || '—' }}</span>
                    <button v-if="p.ip" @click="copy(p.ip)" class="text-xs text-ink-muted hover:underline">
                      kopiraj
                    </button>
                  </div>
                </td>
                <td class="px-3 py-2.5 align-top text-ink-secondary">
                  <span v-if="p.host">{{ p.host.computerName || p.host.ip }}</span>
                  <span v-else class="text-ink-muted">—</span>
                </td>
                <td class="px-3 py-2.5 align-top font-mono tabular-nums text-ink-secondary">
                  {{ typeof p.connectedCount === 'number' ? p.connectedCount : 0 }}
                </td>
                <td class="px-3 py-2.5 align-top text-right">
                  <div class="table-row-actions">
                    <button @click="openTools(p)" class="rounded p-1 text-ink-secondary hover:bg-surface-sunken" title="Poveži/otkači računar">
                      <NavIcon name="link" />
                    </button>
                    <button @click="openEdit(p)" class="rounded p-1 text-accent hover:bg-surface-sunken" title="Izmeni">
                      <NavIcon name="edit" />
                    </button>
                    <button v-if="isAdmin" @click="confirmDelete(p)" class="rounded p-1 text-bad hover:bg-surface-sunken" title="Obriši">
                      <NavIcon name="trash" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <SlideOverPanel :open="showModal" :title="editId ? 'Izmena štampača' : 'Novi štampač'" @close="closeModal">
      <div class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormInput v-model.trim="form.name" label="Naziv" placeholder="HP LaserJet 400" />
          <FormInput v-model.trim="form.manufacturer" label="Proizvođač" placeholder="HP" />
          <FormInput v-model.trim="form.model" label="Model" placeholder="M401dne" />
          <FormInput v-model.trim="form.serial" label="Serijski" />
          <div>
            <label class="text-sm text-ink-secondary">Odeljenje</label>
            <GroupSelect
              v-model="form.department"
              :options="groupOptions"
              :is-admin="isAdmin"
              @group-added="groupOptions.push($event)"
              @error="(msg) => showToast(msg, { kind: 'error', duration: 3000 })"
            />
          </div>
          <div>
            <label class="text-sm text-ink-secondary">Lokacija</label>
            <select v-model="form.site" class="app-input w-full">
              <option v-for="o in SITE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </div>
          <div>
            <label class="text-sm text-ink-secondary">Tip konekcije</label>
            <select v-model="form.connectionType" class="app-input w-full">
              <option value="Network">Network</option>
              <option value="USB">USB</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <FormInput v-model.trim="form.ip" label="IP" placeholder="10.230.62.200" />
          <div class="flex items-center gap-2 mt-6">
            <input id="shared" type="checkbox" v-model="form.shared" class="accent-accent scale-110" />
            <label for="shared" class="text-sm text-ink">Deljen</label>
          </div>
        </div>

        <div class="flex gap-2 justify-end">
          <AppButton variant="neutral" @click="closeModal">Otkaži</AppButton>
          <AppButton variant="success" :disabled="saving" @click="save">
            {{ saving ? 'Čuvam…' : 'Sačuvaj' }}
          </AppButton>
        </div>
      </div>
    </SlideOverPanel>

    <SlideOverPanel :open="toolsOpen" width-class="sm:w-[720px]" @close="closeTools">
      <template #title>
        Povezivanje — {{ toolsPrinter?.name || '—' }}
        <span v-if="toolsPrinter?.ip" class="ml-2 text-sm text-ink-muted">({{ toolsPrinter.ip }})</span>
      </template>

      <div class="space-y-4">
        <div class="grid grid-cols-1 gap-3">
          <div class="border border-line rounded-lg p-3 bg-surface-sunken">
            <div class="font-medium text-ink mb-2">Poveži računar</div>
            <div class="text-xs text-ink-muted mb-1">Unesi IP ili id računara (IpEntry)</div>
            <div class="flex gap-2">
              <input v-model.trim="toolsForm.connectInput" placeholder="npr. 10.230.62.15"
                class="app-input w-full text-sm" @keyup.enter="connectComputerFromTools" />
              <AppButton variant="success" @click="connectComputerFromTools">Poveži</AppButton>
            </div>
          </div>

          <div class="border border-line rounded-lg p-3 bg-surface-sunken">
            <div class="font-medium text-ink mb-2">Postavi host</div>
            <div class="text-xs text-ink-muted mb-1">Računar koji "šeruje" ovaj štampač</div>
            <div class="flex gap-2">
              <input v-model.trim="toolsForm.hostInput" placeholder="IP ili id"
                class="app-input w-full text-sm" @keyup.enter="setHostFromTools" />
              <AppButton variant="primary" @click="setHostFromTools">Postavi</AppButton>
              <AppButton variant="neutral" @click="unsetHostFromTools">Skini</AppButton>
            </div>
          </div>

          <div class="border border-line rounded-lg p-3 bg-surface-sunken">
            <div class="font-medium text-ink mb-2">Otkači računar</div>
            <div class="text-xs text-ink-muted mb-1">Skini jedan računar sa ovog štampača</div>
            <div class="flex gap-2">
              <input v-model.trim="toolsForm.disconnectInput" placeholder="IP ili id"
                class="app-input w-full text-sm" @keyup.enter="disconnectComputerFromTools" />
              <AppButton variant="danger" @click="disconnectComputerFromTools">Otkači</AppButton>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div class="font-medium text-ink mb-1">Host računar</div>
            <div v-if="toolsLoadingDetails" class="text-sm text-ink-muted">Učitavanje…</div>
            <div v-else class="text-sm text-ink-secondary">
              <span v-if="toolsDetails?.hostComputer">
                {{
                  toolsDetails.hostComputer.computerName || toolsDetails.hostComputer.ip || '—'
                }}
              </span>
              <span v-else>—</span>
            </div>
          </div>

          <div>
            <div class="font-medium text-ink mb-1">Povezani računari</div>
            <div v-if="toolsLoadingDetails" class="text-sm text-ink-muted">
              Učitavanje detalja…
            </div>
            <template v-else>
              <ul v-if="toolsDetails?.connectedComputers?.length" class="list-disc list-inside space-y-1 text-sm text-ink-secondary">
                <li v-for="c in toolsDetails.connectedComputers" :key="c.id">
                  {{ c.computerName || '—' }} — {{ c.ip || '—' }}
                </li>
              </ul>
              <div v-else class="text-sm text-ink-muted">Nema povezanih računara</div>
            </template>
          </div>
        </div>

        <div class="text-xs text-ink-muted flex flex-wrap gap-x-4 font-mono">
          <span>Ažurirano: {{ fmtDate(toolsPrinter?.updatedAt) }}</span>
          <span>Kreirano: {{ fmtDate(toolsPrinter?.createdAt) }}</span>
        </div>
      </div>
    </SlideOverPanel>

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
import { ref, watch, onBeforeUnmount, onMounted } from 'vue'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { fmtDate as formatDate } from '@/utils/format.js'
import { downloadFromResponse } from '@/utils/download.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import { useCurrentSite } from '@/composables/useCurrentSite.js'
import { useToast } from '@/composables/useToast.js'
import { useAbortableFetch } from '@/composables/useAbortableFetch.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import { SITE_OPTIONS } from '@/constants/sites.js'
import FormInput from '@/components/FormInput.vue'
import GroupSelect from '@/components/GroupSelect.vue'
import SlideOverPanel from '@/components/SlideOverPanel.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AppButton from '@/components/AppButton.vue'
import TagChip from '@/components/TagChip.vue'
import StatusPill from '@/components/StatusPill.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import NavIcon from '@/components/NavIcon.vue'

const fmtDate = (d) => formatDate(d, 'sr-RS')
const site = useCurrentSite()
const { toast, showToast, copyToClipboard } = useToast()
const { getSignal, abort } = useAbortableFetch()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()
const { isAdmin } = useCurrentUser()

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
const saving = ref(false)

const showModal = ref(false)
const editId = ref(null)
const groupOptions = ref([])
const form = ref({
  name: '',
  manufacturer: '',
  model: '',
  serial: '',
  department: '',
  site: site.value,
  connectionType: 'Network',
  ip: '',
  shared: false,
})

let searchT = null
const getItem = (id) => items.value.find((x) => x.id === id)

const toolsOpen = ref(false)
const toolsPrinter = ref(null)
const toolsDetails = ref(null)
const toolsLoadingDetails = ref(false)
const toolsForm = ref({ connectInput: '', hostInput: '', disconnectInput: '' })

async function fetchData() {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: page.value,
      limit: limit.value,
      search: search.value,
      site: site.value,
    })

    const res = await fetchWithAuth(`/api/protected/printers?${params.toString()}`, {
      signal: getSignal(),
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()

    items.value = data.items || []
    total.value = data.total ?? 0
    totalPages.value = data.totalPages ?? 0
    applyServerPagination(data)

    if (toolsOpen.value && toolsPrinter.value) {
      const np = getItem(toolsPrinter.value.id)
      if (np) toolsPrinter.value = np
    }
  } catch (e) {
    if (e?.name !== 'AbortError') {
      console.error('Neuspešno dohvatanje štampača', e)
    }
  } finally {
    loading.value = false
  }
}

async function refreshToolsState(p, message) {
  await fetchData()
  const np = getItem(p.id)
  if (np) toolsPrinter.value = np
  await loadToolsDetails(np || p)
  showToast(message)
}

async function loadToolsDetails(p) {
  toolsLoadingDetails.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/printers/${p.id}`)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    toolsDetails.value = await res.json()
  } catch (e) {
    console.error('Neuspešno dohvatanje detalja', e)
    toolsDetails.value = null
  } finally {
    toolsLoadingDetails.value = false
  }
}

async function openTools(p) {
  toolsPrinter.value = p
  toolsForm.value = { connectInput: '', hostInput: '', disconnectInput: '' }
  await loadToolsDetails(p)
  toolsOpen.value = true
}

function closeTools() {
  toolsOpen.value = false
  toolsPrinter.value = null
  toolsDetails.value = null
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

const openCreate = () => {
  editId.value = null
  form.value = {
    name: '',
    manufacturer: '',
    model: '',
    serial: '',
    department: '',
    site: site.value,
    connectionType: 'Network',
    ip: '',
    shared: false,
  }
  showModal.value = true
}

const openEdit = (p) => {
  editId.value = p.id
  form.value = {
    name: p.name || '',
    manufacturer: p.manufacturer || '',
    model: p.model || '',
    serial: p.serial || '',
    department: p.department || '',
    site: p.site || site.value,
    connectionType: p.connectionType || 'Network',
    ip: p.ip || '',
    shared: !!p.shared,
  }
  showModal.value = true
}

const closeModal = () => {
  showModal.value = false
}

async function save() {
  saving.value = true
  try {
    const method = editId.value ? 'PUT' : 'POST'
    const url = editId.value ? `/api/protected/printers/${editId.value}` : '/api/protected/printers'
    const res = await fetchWithAuth(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form.value),
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    showModal.value = false
    await fetchData()
    showToast('Sačuvano')
  } catch (e) {
    console.error(e)
  } finally {
    saving.value = false
  }
}

async function confirmDelete(p) {
  const ok = await askConfirm(`Obrisati "${p.name || 'štampač'}"?`, { title: 'Brisanje štampača' })
  if (!ok) return

  try {
    const res = await fetchWithAuth(`/api/protected/printers/${p.id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    await fetchData()
    showToast('Obrisano')
  } catch (e) {
    console.error(e)
    showToast('Greška pri brisanju štampača', { kind: 'error', duration: 3000 })
  }
}

async function connectComputerFromTools() {
  const p = toolsPrinter.value
  const v = toolsForm.value.connectInput.trim()
  if (!p || !v) return
  try {
    await fetchWithAuth(`/api/protected/printers/${p.id}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ computer: v }),
    })
    toolsForm.value.connectInput = ''
    await refreshToolsState(p, 'Računar povezan')
  } catch (e) {
    console.error(e)
  }
}

async function disconnectComputerFromTools() {
  const p = toolsPrinter.value
  const v = toolsForm.value.disconnectInput.trim()
  if (!p || !v) return
  try {
    await fetchWithAuth(`/api/protected/printers/${p.id}/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ computer: v }),
    })
    toolsForm.value.disconnectInput = ''
    await refreshToolsState(p, 'Računar otkačen')
  } catch (e) {
    console.error(e)
  }
}

async function setHostFromTools() {
  const p = toolsPrinter.value
  const v = toolsForm.value.hostInput.trim()
  if (!p || !v) return
  try {
    await fetchWithAuth(`/api/protected/printers/${p.id}/set-host`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ computer: v }),
    })
    toolsForm.value.hostInput = ''
    await refreshToolsState(p, 'Host postavljen')
  } catch (e) {
    console.error(e)
  }
}

async function unsetHostFromTools() {
  const p = toolsPrinter.value
  if (!p) return
  try {
    await fetchWithAuth(`/api/protected/printers/${p.id}/unset-host`, { method: 'POST' })
    await refreshToolsState(p, 'Host uklonjen')
  } catch (e) {
    console.error(e)
  }
}

async function fetchGroupOptions() {
  try {
    const res = await fetchWithAuth('/api/protected/groups')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    groupOptions.value = await res.json()
  } catch (err) {
    console.error('Neuspešno dohvatanje grupa', err)
  }
}

async function copy(text) {
  await copyToClipboard(text, 'IP kopiran')
}

async function exportXlsx() {
  try {
    const params = new URLSearchParams({ site: site.value })
    if (search.value) params.set('search', search.value)

    const date = new Date().toISOString().slice(0, 10)
    await downloadFromResponse(
      await fetchWithAuth(`/api/protected/printers/export-xlsx?${params.toString()}`),
      `NetDesk_Printers_${date}.xlsx`
    )
    showToast('Export spreman')
  } catch (e) {
    console.error('Export greška', e)
    showToast('Greška pri exportu')
  }
}

onBeforeUnmount(() => {
  abort()
  clearTimeout(searchT)
})

onMounted(() => {
  fetchData()
  fetchGroupOptions()
})
</script>
