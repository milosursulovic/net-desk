<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <h1 class="text-2xl font-semibold text-slate-800">Štampači</h1>
      <div class="flex flex-wrap items-center gap-2">
        <button
          @click="openCreate"
          class="bg-green-600 text-white px-4 py-2 rounded-lg shadow hover:bg-green-700 inline-flex items-center gap-2"
        >
          <span>Dodaj štampač</span>
        </button>
        <button
          @click="exportXlsx"
          class="bg-emerald-600 text-white px-4 py-2 rounded-lg shadow hover:bg-emerald-700 inline-flex items-center gap-2"
        >
          <span>Izvezi XLSX</span>
        </button>
      </div>
    </div>

    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div class="relative w-full sm:w-[480px]">
        <input
          v-model="searchInput"
          @input="onSearchInput"
          type="text"
          placeholder="Pretraga po nazivu, modelu, IP, serijskom..."
          class="w-full border border-gray-300 px-10 py-2 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          aria-label="Pretraga štampača"
        />
        <button
          v-if="searchInput"
          @click="clearSearch"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
          aria-label="Obriši pretragu"
        >
          ✖️
        </button>
      </div>

      <div class="flex flex-col items-start sm:items-end gap-1">
        <div class="flex items-center gap-2">
          <label class="text-sm text-gray-600" for="pp">Po strani</label>
          <select id="pp" v-model.number="limit" class="border rounded px-2 py-1">
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
          <button
            @click="prevPage"
            :disabled="page === 1 || loading"
            class="px-2 py-1 bg-gray-200 rounded disabled:opacity-50"
            aria-label="Prethodna strana"
          >
            ⬅️
          </button>
          <span class="text-sm">
            Strana {{ totalPages === 0 ? '0' : page }} / {{ totalPages }}
          </span>
          <button
            @click="nextPage"
            :disabled="page * limit >= total || loading"
            class="px-2 py-1 bg-gray-200 rounded disabled:opacity-50"
            aria-label="Sledeća strana"
          >
            ➡️
          </button>
        </div>
        <p class="text-sm text-gray-600">Prikazano {{ items.length }} od {{ total }} štampača</p>
      </div>
    </div>

    <div class="min-h-[200px]">
      <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="n in 6"
          :key="n"
          class="animate-pulse bg-white rounded-2xl shadow ring-1 ring-black/5 p-4"
        >
          <div class="h-5 w-2/3 bg-slate-200 rounded mb-3"></div>
          <div class="h-4 w-1/2 bg-slate-200 rounded mb-2"></div>
          <div class="h-4 w-1/3 bg-slate-200 rounded mb-4"></div>
          <div class="h-24 bg-slate-100 rounded"></div>
        </div>
      </div>

      <div
        v-else-if="!items.length"
        class="bg-white rounded-2xl shadow ring-1 ring-black/5 p-8 text-center text-slate-500"
      >
        Nema rezultata za zadate filtere.
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="p in items"
          :key="p._id"
          class="bg-white rounded-2xl shadow ring-1 ring-black/5 p-4 flex flex-col"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-lg font-semibold text-slate-800">{{ p.name || '—' }}</div>
              <div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span
                  v-if="p.manufacturer"
                  class="inline-flex items-center px-2 py-0.5 rounded-full border bg-slate-50"
                  >{{ p.manufacturer }}</span
                >
                <span
                  v-if="p.model"
                  class="inline-flex items-center px-2 py-0.5 rounded-full border bg-slate-50"
                  >{{ p.model }}</span
                >
                <span
                  v-if="p.serial"
                  class="inline-flex items-center px-2 py-0.5 rounded-full border bg-slate-50"
                  >SN: {{ p.serial }}</span
                >
                <span
                  v-if="p.department"
                  class="inline-flex items-center px-2 py-0.5 rounded-full border bg-slate-50"
                  >{{ p.department }}</span
                >
              </div>
            </div>
            <div class="shrink-0 flex gap-2">
              <button @click="openEdit(p)" class="text-indigo-700 hover:underline text-sm">
                Izmeni
              </button>
              <button @click="confirmDelete(p)" class="text-rose-700 hover:underline text-sm">
                Obriši
              </button>
            </div>
          </div>

          <div class="mt-3 space-y-2 text-sm">
            <div class="flex items-center gap-2">
              <span
                class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-100 border"
                >{{ p.connectionType || '—' }}</span
              >
              <span
                v-if="p.shared"
                class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-200"
                >Deljen</span
              >
            </div>
            <div class="flex items-center gap-2">
              <span class="font-medium">IP:</span>
              <span>{{ p.ip || '—' }}</span>
              <button
                v-if="p.ip"
                @click="copy(p.ip)"
                class="text-xs text-indigo-700 hover:underline"
              >
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
            <button @click="openTools(p)" class="text-amber-700 hover:underline text-sm">
              Poveži/otkači
            </button>
          </div>
        </div>
      </div>
    </div>

    <transition name="fade">
      <div v-if="showModal" class="fixed inset-0 z-[60] flex" @click.self="closeModal">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="relative ml-auto h-full w-full sm:w-[640px] bg-white shadow-xl overflow-y-auto">
          <div
            class="sticky top-0 z-10 bg-white/90 backdrop-blur border-b p-4 flex items-center justify-between"
          >
            <h3 class="text-lg font-semibold">
              {{ editId ? 'Izmena štampača' : 'Novi štampač' }}
            </h3>
            <button
              @click="closeModal"
              class="text-gray-500 hover:text-red-600 text-2xl leading-none"
              aria-label="Zatvori modal"
            >
              &times;
            </button>
          </div>

          <div class="p-4 space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormInput v-model.trim="form.name" label="Naziv" placeholder="HP LaserJet 400" />
              <FormInput v-model.trim="form.manufacturer" label="Proizvođač" placeholder="HP" />
              <FormInput v-model.trim="form.model" label="Model" placeholder="M401dne" />
              <FormInput v-model.trim="form.serial" label="Serijski" />
              <FormInput v-model.trim="form.department" label="Odeljenje" />
              <div>
                <label class="text-sm text-gray-600">Tip konekcije</label>
                <select v-model="form.connectionType" class="w-full border px-3 py-2 rounded">
                  <option value="Network">Network</option>
                  <option value="USB">USB</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <FormInput v-model.trim="form.ip" label="IP" placeholder="10.230.62.200" />
              <div class="flex items-center gap-2 mt-6">
                <input
                  id="shared"
                  type="checkbox"
                  v-model="form.shared"
                  class="accent-indigo-600 scale-110"
                />
                <label for="shared" class="text-sm">Deljen</label>
              </div>
            </div>

            <div class="flex gap-2 justify-end">
              <button @click="closeModal" class="px-4 py-2 rounded border">Otkaži</button>
              <button
                @click="save"
                class="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700"
                :disabled="saving"
              >
                {{ saving ? 'Čuvam…' : 'Sačuvaj' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="toolsOpen" class="fixed inset-0 z-[70] flex" @click.self="closeTools">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="relative ml-auto h-full w-full sm:w-[720px] bg-white shadow-xl overflow-y-auto">
          <div
            class="sticky top-0 z-10 bg-white/90 backdrop-blur border-b p-4 flex items-center justify-between"
          >
            <h3 class="text-lg font-semibold">
              Povezivanje — {{ toolsPrinter?.name || '—' }}
              <span v-if="toolsPrinter?.ip" class="ml-2 text-sm text-slate-500"
                >({{ toolsPrinter.ip }})</span
              >
            </h3>
            <button
              @click="closeTools"
              class="text-gray-500 hover:text-red-600 text-2xl leading-none"
              aria-label="Zatvori panel"
            >
              &times;
            </button>
          </div>

          <div class="p-4 space-y-4">
            <div class="grid grid-cols-1 gap-3">
              <div class="border rounded-lg p-3 bg-slate-50">
                <div class="font-medium mb-2">Poveži računar</div>
                <div class="text-xs text-gray-600 mb-1">Unesi IP ili _id računara (IpEntry)</div>
                <div class="flex gap-2">
                  <input
                    v-model.trim="toolsForm.connectInput"
                    placeholder="npr. 10.230.62.15"
                    class="border px-2 py-1 rounded text-sm w-full"
                    @keyup.enter="connectComputerFromTools"
                  />
                  <button
                    @click="connectComputerFromTools"
                    class="bg-emerald-600 text-white px-3 py-1 rounded text-sm hover:bg-emerald-700"
                  >
                    Poveži
                  </button>
                </div>
              </div>

              <div class="border rounded-lg p-3 bg-slate-50">
                <div class="font-medium mb-2">Postavi host</div>
                <div class="text-xs text-gray-600 mb-1">Računar koji "šeruje" ovaj štampač</div>
                <div class="flex gap-2">
                  <input
                    v-model.trim="toolsForm.hostInput"
                    placeholder="IP ili _id"
                    class="border px-2 py-1 rounded text-sm w-full"
                    @keyup.enter="setHostFromTools"
                  />
                  <button
                    @click="setHostFromTools"
                    class="bg-indigo-600 text-white px-3 py-1 rounded text-sm hover:bg-indigo-700"
                  >
                    Postavi
                  </button>
                  <button
                    @click="unsetHostFromTools"
                    class="bg-gray-700 text-white px-3 py-1 rounded text-sm hover:bg-gray-800"
                  >
                    Skini
                  </button>
                </div>
              </div>

              <div class="border rounded-lg p-3 bg-slate-50">
                <div class="font-medium mb-2">Otkači računar</div>
                <div class="text-xs text-gray-600 mb-1">Skini jedan računar sa ovog štampača</div>
                <div class="flex gap-2">
                  <input
                    v-model.trim="toolsForm.disconnectInput"
                    placeholder="IP ili _id"
                    class="border px-2 py-1 rounded text-sm w-full"
                    @keyup.enter="disconnectComputerFromTools"
                  />
                  <button
                    @click="disconnectComputerFromTools"
                    class="bg-amber-700 text-white px-3 py-1 rounded text-sm hover:bg-amber-800"
                  >
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
                  <ul
                    v-if="toolsDetails?.connectedComputers?.length"
                    class="list-disc list-inside space-y-1 text-sm"
                  >
                    <li v-for="c in toolsDetails.connectedComputers" :key="c._id">
                      {{ c.computerName || '—' }} — {{ c.ip || '—' }}
                    </li>
                  </ul>
                  <div v-else class="text-sm text-slate-500">Nema povezanih računara</div>
                </template>
              </div>
            </div>

            <div class="text-xs text-gray-600 flex flex-wrap gap-x-4">
              <span>Ažurirano: {{ fmtDate(toolsPrinter?.updatedAt) }}</span>
              <span>Kreirano: {{ fmtDate(toolsPrinter?.createdAt) }}</span>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div
        v-if="toast"
        class="fixed top-6 right-6 bg-gray-900 text-white px-4 py-2 rounded shadow-lg text-sm z-[999]"
        role="status"
        aria-live="polite"
      >
        {{ toast }}
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, defineComponent, h } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'

const FormInput = defineComponent({
  name: 'FormInput',
  props: { modelValue: String, label: String, placeholder: String },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('div', [
        h('label', { class: 'text-sm text-gray-600' }, props.label),
        h('input', {
          value: props.modelValue,
          placeholder: props.placeholder,
          class: 'w-full border px-3 py-2 rounded',
          onInput: (e) => emit('update:modelValue', e.target.value),
        }),
      ])
  },
})

const router = useRouter()
const route = useRoute()

const items = ref([])
const total = ref(0)
const totalPages = ref(0)
const page = ref(parseInt(route.query.page) || 1)
const limit = ref(parseInt(route.query.limit) || 20)
const search = ref(route.query.search || '')
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

const toast = ref('')
let searchT = null
let inFlight = new AbortController()

const showToast = (msg) => {
  toast.value = `✅ ${msg}`
  setTimeout(() => (toast.value = ''), 2000)
}
const fmtDate = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt) ? '—' : dt.toLocaleString('sr-RS')
}
const getItem = (id) => items.value.find((x) => x._id === id)

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

    inFlight.abort()
    inFlight = new AbortController()

    const res = await fetchWithAuth(`/api/protected/printers?${params.toString()}`, {
      signal: inFlight.signal,
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()

    items.value = data.items || []
    total.value = data.total ?? 0
    totalPages.value = data.totalPages ?? 0

    const appliedPage = parseInt(data.page) || 1
    const appliedLimit = parseInt(data.limit) || limit.value
    let changed = false
    if (appliedPage !== page.value) {
      page.value = appliedPage
      changed = true
    }
    if (appliedLimit !== limit.value) {
      limit.value = appliedLimit
      changed = true
    }

    if (
      changed ||
      route.query.page !== String(page.value) ||
      route.query.limit !== String(limit.value) ||
      (route.query.search || '') !== (search.value || '')
    ) {
      router.replace({
        query: { page: page.value, limit: limit.value, search: search.value || undefined },
      })
    }

    if (toolsOpen.value && toolsPrinter.value) {
      const np = getItem(toolsPrinter.value._id)
      if (np) toolsPrinter.value = np
    }
  } catch (e) {
    console.error('Neuspešno dohvatanje štampača', e)
  } finally {
    loading.value = false
  }
}

async function loadToolsDetails(p) {
  toolsLoadingDetails.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/printers/${p._id}`)
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

function nextPage() {
  if (page.value * limit.value < total.value) page.value++
}
function prevPage() {
  if (page.value > 1) page.value--
}

watch([page, limit, search], () => {
  router.push({
    query: { page: page.value, limit: limit.value, search: search.value || undefined },
  })
})

watch(
  () => route.query,
  (q) => {
    page.value = parseInt(q.page) || 1
    limit.value = parseInt(q.limit) || 20
    search.value = q.search || ''
    searchInput.value = search.value
    fetchData()
  },
  { immediate: true }
)

const onSearchInput = () => {
  clearTimeout(searchT)
  searchT = setTimeout(() => {
    page.value = 1
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
  editId.value = p._id
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
  if (!confirm(`Obrisati "${p.name || 'štampač'}"?`)) return
  try {
    const res = await fetchWithAuth(`/api/protected/printers/${p._id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    await fetchData()
    showToast('Obrisano')
  } catch (e) {
    console.error(e)
  }
}

async function connectComputerFromTools() {
  const p = toolsPrinter.value
  const v = toolsForm.value.connectInput.trim()
  if (!p || !v) return
  try {
    await fetchWithAuth(`/api/protected/printers/${p._id}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ computer: v }),
    })
    toolsForm.value.connectInput = ''
    await fetchData()
    const np = getItem(p._id)
    if (np) toolsPrinter.value = np
    await loadToolsDetails(np || p)
    showToast('Računar povezan')
  } catch (e) {
    console.error(e)
  }
}

async function disconnectComputerFromTools() {
  const p = toolsPrinter.value
  const v = toolsForm.value.disconnectInput.trim()
  if (!p || !v) return
  try {
    await fetchWithAuth(`/api/protected/printers/${p._id}/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ computer: v }),
    })
    toolsForm.value.disconnectInput = ''
    await fetchData()
    const np = getItem(p._id)
    if (np) toolsPrinter.value = np
    await loadToolsDetails(np || p)
    showToast('Računar otkačen')
  } catch (e) {
    console.error(e)
  }
}

async function setHostFromTools() {
  const p = toolsPrinter.value
  const v = toolsForm.value.hostInput.trim()
  if (!p || !v) return
  try {
    await fetchWithAuth(`/api/protected/printers/${p._id}/set-host`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ computer: v }),
    })
    toolsForm.value.hostInput = ''
    await fetchData()
    const np = getItem(p._id)
    if (np) toolsPrinter.value = np
    await loadToolsDetails(np || p)
    showToast('Host postavljen')
  } catch (e) {
    console.error(e)
  }
}

async function unsetHostFromTools() {
  const p = toolsPrinter.value
  if (!p) return
  try {
    await fetchWithAuth(`/api/protected/printers/${p._id}/unset-host`, { method: 'POST' })
    await fetchData()
    const np = getItem(p._id)
    if (np) toolsPrinter.value = np
    await loadToolsDetails(np || p)
    showToast('Host uklonjen')
  } catch (e) {
    console.error(e)
  }
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    showToast('IP kopiran')
  } catch {}
}

async function exportXlsx() {
  try {
    const params = new URLSearchParams()
    if (search.value) params.set('search', search.value)

    const res = await fetchWithAuth(`/api/protected/printers/export-xlsx?${params.toString()}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const date = new Date().toISOString().slice(0, 10)
    a.download = `NetDesk_Printers_${date}.xlsx`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    showToast('Export spreman')
  } catch (e) {
    console.error('Export greška', e)
    showToast('Greška pri exportu')
  }
}

onMounted(() => {
  document.title = 'Štampači - NetDesk'
})

onBeforeUnmount(() => {
  inFlight.abort()
  clearTimeout(searchT)
})
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
