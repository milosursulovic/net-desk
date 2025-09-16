<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <h1 class="text-2xl font-semibold text-slate-800">🖨️ Štampači</h1>
      <div class="flex flex-wrap items-center gap-2">
        <button @click="openCreate"
          class="bg-green-600 text-white px-4 py-2 rounded-lg shadow hover:bg-green-700 inline-flex items-center gap-2">
          <span>➕</span><span>Dodaj štampač</span>
        </button>
        <RouterLink to="/"
          class="bg-slate-700 text-white px-4 py-2 rounded-lg shadow hover:bg-slate-800 inline-flex items-center gap-2">
          <span>🖥️</span><span>IP adrese</span>
        </RouterLink>
      </div>
    </div>

    <!-- Filters / pagination -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div class="relative w-full sm:w-[480px]">
        <input v-model="searchInput" @input="onSearchInput" type="text"
          placeholder="🔎 Pretraga po nazivu, modelu, IP, serijskom..."
          class="w-full border border-gray-300 px-10 py-2 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          aria-label="Pretraga štampača" />
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔎</span>
        <button v-if="searchInput" @click="clearSearch"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
          aria-label="Obriši pretragu">
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
          <button @click="prevPage" :disabled="page === 1 || loading"
            class="px-2 py-1 bg-gray-200 rounded disabled:opacity-50" aria-label="Prethodna strana">
            ⬅️
          </button>
          <span class="text-sm">📄 Strana {{ totalPages === 0 ? '0' : page }} / {{ totalPages }}</span>
          <button @click="nextPage" :disabled="page * limit >= total || loading"
            class="px-2 py-1 bg-gray-200 rounded disabled:opacity-50" aria-label="Sledeća strana">
            ➡️
          </button>
        </div>
        <p class="text-sm text-gray-600">Prikazano {{ items.length }} od {{ total }} štampača</p>
      </div>
    </div>

    <!-- Table -->
    <div class="rounded-xl shadow ring-1 ring-black/5 overflow-hidden bg-white">
      <div class="overflow-x-auto">
        <table class="min-w-full text-left">
          <thead class="bg-slate-50 text-xs sm:text-sm sticky top-0">
            <tr class="text-slate-600">
              <th class="p-3 font-medium">Naziv</th>
              <th class="p-3 font-medium">Proizvođač</th>
              <th class="p-3 font-medium">Model</th>
              <th class="p-3 font-medium">Serijski</th>
              <th class="p-3 font-medium">Odeljenje</th>
              <th class="p-3 font-medium">Veza</th>
              <th class="p-3 font-medium">IP</th>
              <th class="p-3 font-medium">Deljen</th>
              <th class="p-3 font-medium">Host računar</th>
              <th class="p-3 font-medium">Povezani PC</th>
              <th class="p-3 font-medium">Akcije</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="11" class="p-4 text-center text-slate-500">Učitavanje…</td>
            </tr>
            <tr v-else-if="!items.length">
              <td colspan="11" class="p-6 text-center text-slate-500">
                Nema rezultata za zadate filtere.
              </td>
            </tr>

            <template v-else>
              <tr v-for="p in items" :key="p._id" class="border-t text-sm sm:text-base hover:bg-slate-50">
                <td class="p-3">
                  <div class="font-medium text-slate-800">{{ p.name || '—' }}</div>
                </td>
                <td class="p-3">{{ p.manufacturer || '—' }}</td>
                <td class="p-3">{{ p.model || '—' }}</td>
                <td class="p-3">{{ p.serial || '—' }}</td>
                <td class="p-3">{{ p.department || '—' }}</td>
                <td class="p-3">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-100 border">
                    {{ p.connectionType || '—' }}
                  </span>
                </td>
                <td class="p-3">
                  <div class="inline-flex items-center gap-2">
                    <span>{{ p.ip || '—' }}</span>
                    <button v-if="p.ip" @click="copy(p.ip)" class="text-xs text-indigo-700 hover:underline">
                      kopiraj
                    </button>
                  </div>
                </td>
                <td class="p-3">{{ p.shared ? 'DA' : 'NE' }}</td>

                <!-- ✅ Host iz LIST rute (polje `host`) -->
                <td class="p-3">
                  <span v-if="p.host">
                    {{ p.host.computerName || p.host.ip }}
                  </span>
                  <span v-else>—</span>
                </td>

                <!-- ✅ Broj povezanih iz LIST rute (polje `connectedCount`) -->
                <td class="p-3">
                  <button class="text-indigo-700 hover:underline" @click="toggleRow(p._id)"
                    :title="expanded[p._id] ? 'Sakrij detalje' : 'Prikaži detalje'">
                    {{ typeof p.connectedCount === 'number' ? p.connectedCount : 0 }}
                  </button>
                </td>

                <td class="p-3 whitespace-nowrap space-x-2">
                  <button @click="openEdit(p)" class="text-indigo-700 hover:underline">
                    ✏️ Izmeni
                  </button>
                  <button @click="confirmDelete(p)" class="text-rose-700 hover:underline">
                    🗑️ Obriši
                  </button>
                  <button @click="toggleRow(p._id)" class="text-amber-700 hover:underline">
                    {{ expanded[p._id] ? 'Sakrij' : 'Poveži/otkači' }}
                  </button>
                </td>
              </tr>

              <!-- Expanded row -->
              <tr v-for="p in items" :key="p._id + '-exp'" v-show="expanded[p._id]" class="bg-slate-50 border-t">
                <td colspan="11" class="p-4">
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <!-- Connect -->
                    <div class="border rounded-lg p-3 bg-white">
                      <div class="font-medium mb-2">🔗 Poveži računar</div>
                      <div class="text-xs text-gray-600 mb-1">
                        Unesi IP ili _id računara (IpEntry)
                      </div>
                      <div class="flex gap-2">
                        <input v-model.trim="rowState[p._id].connectInput" placeholder="npr. 10.230.62.15"
                          class="border px-2 py-1 rounded text-sm w-full" @keyup.enter="connectComputer(p)" />
                        <button @click="connectComputer(p)"
                          class="bg-emerald-600 text-white px-3 py-1 rounded text-sm hover:bg-emerald-700">
                          Poveži
                        </button>
                      </div>
                    </div>

                    <!-- Host -->
                    <div class="border rounded-lg p-3 bg-white">
                      <div class="font-medium mb-2">🧷 Postavi host</div>
                      <div class="text-xs text-gray-600 mb-1">
                        Računar koji "šeruje" ovaj štampač
                      </div>
                      <div class="flex gap-2">
                        <input v-model.trim="rowState[p._id].hostInput" placeholder="IP ili _id"
                          class="border px-2 py-1 rounded text-sm w-full" @keyup.enter="setHost(p)" />
                        <button @click="setHost(p)"
                          class="bg-indigo-600 text-white px-3 py-1 rounded text-sm hover:bg-indigo-700">
                          Postavi
                        </button>
                        <button @click="unsetHost(p)"
                          class="bg-gray-700 text-white px-3 py-1 rounded text-sm hover:bg-gray-800">
                          Skini
                        </button>
                      </div>
                    </div>

                    <!-- Disconnect -->
                    <div class="border rounded-lg p-3 bg-white">
                      <div class="font-medium mb-2">🧹 Otkači računar</div>
                      <div class="text-xs text-gray-600 mb-1">
                        Skini jedan računar sa ovog štampača
                      </div>
                      <div class="flex gap-2">
                        <input v-model.trim="rowState[p._id].disconnectInput" placeholder="IP ili _id"
                          class="border px-2 py-1 rounded text-sm w-full" @keyup.enter="disconnectComputer(p)" />
                        <button @click="disconnectComputer(p)"
                          class="bg-amber-700 text-white px-3 py-1 rounded text-sm hover:bg-amber-800">
                          Otkači
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- ✅ Detalji: Host i povezani računari iz /:id -->
                  <div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div class="font-medium mb-1">🧷 Host računar</div>
                      <div v-if="rowState[p._id].loadingDetails" class="text-sm text-slate-500">
                        Učitavanje…
                      </div>
                      <div v-else class="text-sm">
                        <span v-if="p._details?.hostComputer">
                          {{ p._details.hostComputer.computerName || p._details.hostComputer.ip || '—' }}
                        </span>
                        <span v-else>—</span>
                      </div>
                    </div>

                    <div>
                      <div class="font-medium mb-1">🖥️ Povezani računari</div>
                      <div v-if="rowState[p._id].loadingDetails" class="text-sm text-slate-500">
                        Učitavanje detalja…
                      </div>
                      <template v-else>
                        <ul v-if="p._details?.connectedComputers?.length"
                          class="list-disc list-inside space-y-1 text-sm">
                          <li v-for="c in p._details.connectedComputers" :key="c._id">
                            {{ c.computerName || '—' }} — {{ c.ip || '—' }}
                          </li>
                        </ul>
                        <div v-else class="text-sm text-slate-500">Nema povezanih računara</div>
                      </template>
                    </div>
                  </div>

                  <div class="mt-3 text-xs text-gray-600 flex flex-wrap gap-x-4">
                    <span>Ažurirano: {{ fmtDate(p.updatedAt) }}</span>
                    <span>Kreirano: {{ fmtDate(p.createdAt) }}</span>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal -->
    <transition name="fade">
      <div v-if="showModal" class="fixed inset-0 z-[60] flex" @click.self="closeModal">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="relative ml-auto h-full w-full sm:w-[640px] bg-white shadow-xl overflow-y-auto">
          <div class="sticky top-0 z-10 bg-white/90 backdrop-blur border-b p-4 flex items-center justify-between">
            <h3 class="text-lg font-semibold">
              {{ editId ? '✏️ Izmena štampača' : '➕ Novi štampač' }}
            </h3>
            <button @click="closeModal" class="text-gray-500 hover:text-red-600 text-2xl leading-none"
              aria-label="Zatvori modal">
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
                <input id="shared" type="checkbox" v-model="form.shared" class="accent-indigo-600 scale-110" />
                <label for="shared" class="text-sm">Deljen</label>
              </div>
            </div>

            <div class="flex gap-2 justify-end">
              <button @click="closeModal" class="px-4 py-2 rounded border">Otkaži</button>
              <button @click="save" class="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700"
                :disabled="saving">
                {{ saving ? 'Čuvam…' : '💾 Sačuvaj' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="toast" class="fixed top-6 right-6 bg-gray-900 text-white px-4 py-2 rounded shadow-lg text-sm z-[999]"
        role="status" aria-live="polite">
        {{ toast }}
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, defineComponent, h, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'

/* --------------------------- Small input component -------------------------- */
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

/* --------------------------------- State ---------------------------------- */
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

const expanded = ref({})
const rowState = ref({})
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

/* --------------------------------- Helpers -------------------------------- */
const showToast = (msg) => {
  toast.value = `✅ ${msg}`
  setTimeout(() => (toast.value = ''), 2000)
}
const fmtDate = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt) ? '—' : dt.toLocaleString()
}
const getItem = (id) => items.value.find((x) => x._id === id)

/* ---------------------------------- Fetch --------------------------------- */
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
    total.value = data.total || 0
    totalPages.value = data.totalPages || 0

    // reset per-row ui state (ali sačuvaj expand)
    const st = {}
    const ex = {}
    for (const p of items.value) {
      st[p._id] = { connectInput: '', hostInput: '', disconnectInput: '', loadingDetails: false }
      ex[p._id] = !!expanded.value[p._id]
    }
    rowState.value = st
    expanded.value = ex

    // za već otvorene redove, lenjo povuci detalje
    const openIds = Object.keys(ex).filter((k) => ex[k])
    await Promise.all(openIds.map((id) => {
      const p = getItem(id)
      return p ? ensureDetails(p) : Promise.resolve()
    }))
  } catch (e) {
    console.error('Neuspešno dohvatanje štampača', e)
  } finally {
    loading.value = false
  }
}

async function ensureDetails(p) {
  if (p._detailsLoaded) return
  rowState.value[p._id].loadingDetails = true
  try {
    const res = await fetchWithAuth(`/api/protected/printers/${p._id}`)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const det = await res.json()
    p._details = det
    p._detailsLoaded = true
  } catch (e) {
    console.error('Neuspešno dohvatanje detalja', e)
  } finally {
    rowState.value[p._id].loadingDetails = false
  }
}

function nextPage() {
  if (page.value * limit.value < total.value) page.value++
}
function prevPage() {
  if (page.value > 1) page.value--
}

/* --------------------------------- Watchers ------------------------------- */
watch([page, limit, search], () => {
  router.push({ query: { page: page.value, limit: limit.value, search: search.value } })
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

/* --------------------------------- Search -------------------------------- */
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

/* --------------------------------- CRUD ---------------------------------- */
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

async function toggleRow(id) {
  expanded.value[id] = !expanded.value[id]
  if (expanded.value[id]) {
    const p = getItem(id)
    if (p) await ensureDetails(p)
  }
}

/* --------- Akcije povezivanja: osveži detalje samo za taj red --------- */
async function connectComputer(p) {
  const v = rowState.value[p._id].connectInput.trim()
  if (!v) return
  try {
    await fetchWithAuth(`/api/protected/printers/${p._id}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ computer: v }),
    })
    rowState.value[p._id].connectInput = ''
    // Refreš liste (zbog connectedCount) i detalja
    await fetchData()
    const np = getItem(p._id)
    if (np && expanded.value[p._id]) {
      np._detailsLoaded = false
      await ensureDetails(np)
    }
    showToast('Računar povezan')
  } catch (e) {
    console.error(e)
  }
}

async function disconnectComputer(p) {
  const v = rowState.value[p._id].disconnectInput.trim()
  if (!v) return
  try {
    await fetchWithAuth(`/api/protected/printers/${p._id}/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ computer: v }),
    })
    rowState.value[p._id].disconnectInput = ''
    await fetchData()
    const np = getItem(p._id)
    if (np && expanded.value[p._id]) {
      np._detailsLoaded = false
      await ensureDetails(np)
    }
    showToast('Računar otkačen')
  } catch (e) {
    console.error(e)
  }
}

async function setHost(p) {
  const v = rowState.value[p._id].hostInput.trim()
  if (!v) return
  try {
    await fetchWithAuth(`/api/protected/printers/${p._id}/set-host`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ computer: v }),
    })
    await fetchData()
    const np = getItem(p._id)
    if (np && expanded.value[p._id]) {
      np._detailsLoaded = false
      await ensureDetails(np)
    }
    showToast('Host postavljen')
  } catch (e) {
    console.error(e)
  }
}

async function unsetHost(p) {
  try {
    await fetchWithAuth(`/api/protected/printers/${p._id}/unset-host`, { method: 'POST' })
    await fetchData()
    const np = getItem(p._id)
    if (np && expanded.value[p._id]) {
      np._detailsLoaded = false
      await ensureDetails(np)
    }
    showToast('Host uklonjen')
  } catch (e) {
    console.error(e)
  }
}

/* --------------------------------- Misc ---------------------------------- */
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    showToast('IP kopiran')
  } catch { }
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
