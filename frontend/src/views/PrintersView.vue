<template>
  <div class="glass-container space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <h1 class="text-2xl font-bold text-slate-800">Štampači</h1>
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
          class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          aria-label="Obriši pretragu">
          ✖️
        </button>
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

      <p class="text-sm text-slate-500">Prikazano {{ items.length }} od {{ total }} štampača</p>
    </div>

    <div class="min-h-[200px]">
      <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="n in 6" :key="n" class="animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm p-4">
          <div class="h-5 w-2/3 bg-slate-200 rounded mb-3"></div>
          <div class="h-4 w-1/2 bg-slate-200 rounded mb-2"></div>
          <div class="h-4 w-1/3 bg-slate-200 rounded mb-4"></div>
          <div class="h-24 bg-slate-100 rounded"></div>
        </div>
      </div>

      <div v-else-if="!items.length"
        class="rounded-xl border border-slate-200 bg-white shadow-sm p-8 text-center text-slate-500">
        Nema rezultata za zadate filtere.
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="p in items" :key="p.id" class="rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition p-4 flex flex-col">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-lg font-semibold text-slate-800">{{ p.name || '—' }}</div>
              <div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span v-if="p.manufacturer"
                  class="inline-flex items-center px-2 py-0.5 rounded-full border bg-slate-50">{{ p.manufacturer
                  }}</span>
                <span v-if="p.model" class="inline-flex items-center px-2 py-0.5 rounded-full border bg-slate-50">{{
                  p.model }}</span>
                <span v-if="p.serial" class="inline-flex items-center px-2 py-0.5 rounded-full border bg-slate-50">SN:
                  {{ p.serial }}</span>
                <span v-if="p.department"
                  class="inline-flex items-center px-2 py-0.5 rounded-full border bg-slate-50">{{ p.department }}</span>
              </div>
            </div>
            <div class="shrink-0 flex gap-2">
              <button @click="openEdit(p)" class="text-blue-600 hover:underline text-sm">
                Izmeni
              </button>
              <button @click="confirmDelete(p)" class="text-red-600 hover:underline text-sm">
                Obriši
              </button>
            </div>
          </div>

          <div class="mt-3 space-y-2 text-sm">
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-100 border">{{
                p.connectionType || '—' }}</span>
              <span v-if="p.shared"
                class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">Deljen</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-medium">IP:</span>
              <span>{{ p.ip || '—' }}</span>
              <button v-if="p.ip" @click="copy(p.ip)" class="text-xs text-slate-500 hover:underline">
                kopiraj
              </button>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-medium">Host:</span>
              <span v-if="p.host">{{ p.host.computerName || p.host.ip }}</span>
              <span v-else>—</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-medium">Povezani PC:</span>
              <span>{{ typeof p.connectedCount === 'number' ? p.connectedCount : 0 }}</span>
            </div>
          </div>

          <div class="mt-3 pt-3 border-t flex items-center justify-end gap-3">
            <button @click="openTools(p)" class="text-slate-600 hover:underline text-sm">
              Poveži/otkači
            </button>
          </div>
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
          <FormInput v-model.trim="form.department" label="Odeljenje" />
          <div>
            <label class="text-sm text-slate-600">Tip konekcije</label>
            <select v-model="form.connectionType" class="app-input w-full">
              <option value="Network">Network</option>
              <option value="USB">USB</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <FormInput v-model.trim="form.ip" label="IP" placeholder="10.230.62.200" />
          <div class="flex items-center gap-2 mt-6">
            <input id="shared" type="checkbox" v-model="form.shared" class="accent-blue-600 scale-110" />
            <label for="shared" class="text-sm">Deljen</label>
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
        <span v-if="toolsPrinter?.ip" class="ml-2 text-sm text-slate-500">({{ toolsPrinter.ip }})</span>
      </template>

      <div class="space-y-4">
        <div class="grid grid-cols-1 gap-3">
          <div class="border border-slate-200 rounded-lg p-3 bg-slate-50">
            <div class="font-medium mb-2">Poveži računar</div>
            <div class="text-xs text-slate-500 mb-1">Unesi IP ili id računara (IpEntry)</div>
            <div class="flex gap-2">
              <input v-model.trim="toolsForm.connectInput" placeholder="npr. 10.230.62.15"
                class="app-input w-full text-sm" @keyup.enter="connectComputerFromTools" />
              <button @click="connectComputerFromTools"
                class="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-emerald-700">
                Poveži
              </button>
            </div>
          </div>

          <div class="border border-slate-200 rounded-lg p-3 bg-slate-50">
            <div class="font-medium mb-2">Postavi host</div>
            <div class="text-xs text-slate-500 mb-1">Računar koji "šeruje" ovaj štampač</div>
            <div class="flex gap-2">
              <input v-model.trim="toolsForm.hostInput" placeholder="IP ili id"
                class="app-input w-full text-sm" @keyup.enter="setHostFromTools" />
              <button @click="setHostFromTools"
                class="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700">
                Postavi
              </button>
              <button @click="unsetHostFromTools"
                class="bg-slate-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-slate-600">
                Skini
              </button>
            </div>
          </div>

          <div class="border border-slate-200 rounded-lg p-3 bg-slate-50">
            <div class="font-medium mb-2">Otkači računar</div>
            <div class="text-xs text-slate-500 mb-1">Skini jedan računar sa ovog štampača</div>
            <div class="flex gap-2">
              <input v-model.trim="toolsForm.disconnectInput" placeholder="IP ili id"
                class="app-input w-full text-sm" @keyup.enter="disconnectComputerFromTools" />
              <button @click="disconnectComputerFromTools"
                class="bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-red-700">
                Otkači
              </button>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div class="font-medium mb-1">Host računar</div>
            <div v-if="toolsLoadingDetails" class="text-sm text-slate-500">Učitavanje…</div>
            <div v-else class="text-sm">
              <span v-if="toolsDetails?.hostComputer">
                {{
                  toolsDetails.hostComputer.computerName || toolsDetails.hostComputer.ip || '—'
                }}
              </span>
              <span v-else>—</span>
            </div>
          </div>

          <div>
            <div class="font-medium mb-1">Povezani računari</div>
            <div v-if="toolsLoadingDetails" class="text-sm text-slate-500">
              Učitavanje detalja…
            </div>
            <template v-else>
              <ul v-if="toolsDetails?.connectedComputers?.length" class="list-disc list-inside space-y-1 text-sm">
                <li v-for="c in toolsDetails.connectedComputers" :key="c.id">
                  {{ c.computerName || '—' }} — {{ c.ip || '—' }}
                </li>
              </ul>
              <div v-else class="text-sm text-slate-500">Nema povezanih računara</div>
            </template>
          </div>
        </div>

        <div class="text-xs text-slate-500 flex flex-wrap gap-x-4">
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
import { useToast } from '@/composables/useToast.js'
import { useAbortableFetch } from '@/composables/useAbortableFetch.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import FormInput from '@/components/FormInput.vue'
import SlideOverPanel from '@/components/SlideOverPanel.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AppButton from '@/components/AppButton.vue'

const fmtDate = (d) => formatDate(d, 'sr-RS')
const { toast, showToast, copyToClipboard } = useToast()
const { getSignal, abort } = useAbortableFetch()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()

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

watch([page, limit, search], fetchData)

const items = ref([])
const total = ref(0)
const totalPages = ref(0)
const searchInput = ref(search.value)
const loading = ref(false)
const saving = ref(false)

const showModal = ref(false)
const editId = ref(null)
const form = ref({
  name: '',
  manufacturer: '',
  model: '',
  serial: '',
  department: '',
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
    showToast('Greška pri brisanju štampača', { prefix: '❌ ', duration: 3000 })
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

async function copy(text) {
  await copyToClipboard(text, 'IP kopiran')
}

async function exportXlsx() {
  try {
    const params = new URLSearchParams()
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
})
</script>
