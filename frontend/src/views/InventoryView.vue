<template>
  <main class="glass-container relative">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <h1 class="text-xl sm:text-2xl font-semibold text-slate-700">Inventar hardvera</h1>

      <div class="flex flex-wrap items-center gap-2">
        <button
          @click="openAddModal"
          class="bg-emerald-600 text-white px-4 py-2 rounded-md shadow hover:bg-emerald-700 font-semibold transition"
        >
          Dodaj stavku
        </button>

        <button
          @click="exportToXlsx"
          class="bg-blue-600 text-white px-4 py-2 rounded-md shadow hover:bg-blue-700 font-semibold transition"
        >
          Izvezi XLSX
        </button>
      </div>
    </div>

    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
      <input
        v-model="search"
        @input="page = 1"
        type="text"
        placeholder="Pretraga (model, serijski, proizvođač, lokacija…) "
        class="border border-gray-300 px-3 py-2 rounded w-full sm:w-1/2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />

      <div class="w-full sm:w-auto flex flex-wrap items-center gap-2">
        <select
          v-model="filterType"
          class="border px-2 py-2 rounded text-sm"
          :title="'Filter po tipu opreme'"
        >
          <option value="all">Sve vrste</option>
          <option v-for="t in typeOptions" :key="t.value" :value="t.value">
            {{ t.label }}
          </option>
        </select>

        <select v-model="sortBy" class="border px-2 py-2 rounded text-sm">
          <option value="type">Tip</option>
          <option value="manufacturer">Proizvođač</option>
          <option value="model">Model</option>
          <option value="location">Lokacija</option>
          <option value="createdAt">Datum unosa</option>
        </select>

        <button
          @click="sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'"
          class="px-3 py-2 border rounded text-sm"
          :title="sortOrder === 'asc' ? 'Rastuće' : 'Opadajuće'"
        >
          {{ sortOrder === 'asc' ? '↑' : '↓' }}
        </button>

        <select v-model.number="limit" class="border px-2 py-2 rounded text-sm">
          <option :value="10">10 / strana</option>
          <option :value="20">20 / strana</option>
          <option :value="50">50 / strana</option>
        </select>
      </div>

      <div class="flex flex-col items-start sm:items-end gap-1">
        <div class="flex items-center gap-2 text-sm">
          <button
            @click="prevPage"
            :disabled="page === 1"
            class="px-2 py-1 bg-gray-300 rounded disabled:opacity-50"
          >
            ⬅️
          </button>
          <span>Strana {{ currentPageDisplay }} / {{ totalPages }}</span>
          <button
            @click="nextPage"
            :disabled="page >= totalPages"
            class="px-2 py-1 bg-gray-300 rounded disabled:opacity-50"
          >
            ➡️
          </button>
        </div>
        <p class="text-xs sm:text-sm text-gray-600">
          Prikazano {{ entries.length }} od {{ total }} stavki
        </p>
      </div>
    </div>

    <div class="mt-2 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      <article
        v-for="item in entries"
        :key="item.id"
        class="rounded-xl border bg-white/90 shadow-sm hover:shadow-md transition p-4 flex flex-col"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-xs uppercase tracking-wide text-slate-400">
              {{ labelForType(item.type) }}
            </div>
            <div class="text-lg font-semibold tracking-tight">
              {{ item.model || 'Nepoznat model' }}
            </div>
            <div class="mt-1 text-xs text-slate-500">
              {{ item.manufacturer || 'Nepoznat proizvođač' }}
            </div>
          </div>

          <div class="flex flex-col items-end gap-1">
            <span class="text-xs text-slate-500">
              Količina: <span class="font-semibold">{{ item.quantity }}</span>
            </span>
            <button
              v-if="item.serialNumber"
              @click="copyToClipboard(item.serialNumber, 'Serijski broj kopiran!')"
              class="text-[11px] text-blue-600 hover:underline mt-1"
              title="Kopiraj serijski broj"
            >
              📋 {{ shortSerial(item.serialNumber) }}
            </button>
          </div>
        </div>

        <div class="mt-3 space-y-1.5 text-sm">
          <div class="flex justify-between gap-3">
            <span class="text-slate-500">Lokacija</span>
            <span class="font-medium truncate">{{ item.location || 'Magacin' }}</span>
          </div>
          <div class="flex justify-between gap-3" v-if="item.capacity">
            <span class="text-slate-500">Kapacitet</span>
            <span class="font-medium truncate">{{ item.capacity }}</span>
          </div>
          <div class="flex justify-between gap-3" v-if="item.speed">
            <span class="text-slate-500">Brzina</span>
            <span class="font-medium truncate">{{ item.speed }}</span>
          </div>
          <div class="flex justify-between gap-3" v-if="item.socket">
            <span class="text-slate-500">Socket / FF</span>
            <span class="font-medium truncate">{{ item.socket }}</span>
          </div>
        </div>

        <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div class="rounded-lg bg-slate-50 px-2 py-1.5">
            <div class="text-[11px] text-slate-500">Serijski</div>
            <div class="font-mono break-all text-[11px]">
              {{ item.serialNumber || '—' }}
            </div>
          </div>
          <div class="rounded-lg bg-slate-50 px-2 py-1.5">
            <div class="text-[11px] text-slate-500">Napomena</div>
            <div class="truncate" :title="item.notes">
              {{ item.notes || '—' }}
            </div>
          </div>
        </div>

        <div class="mt-2 text-[11px] text-slate-500">
          Uneto: {{ fmtDate(item.createdAt) }}
          <span v-if="item.updatedAt"> • Izmenjeno: {{ fmtDate(item.updatedAt) }}</span>
        </div>

        <div class="mt-4 pt-3 border-t flex flex-wrap items-center gap-3">
          <button @click="openEditModal(item)" class="text-blue-600 hover:underline text-sm">
            Izmeni
          </button>
          <button @click="confirmDelete(item)" class="text-red-600 hover:underline text-sm">
            Obriši
          </button>
        </div>
      </article>

      <div
        v-if="!entries.length && total === 0"
        class="col-span-full text-center text-slate-500 text-sm py-8"
      >
        Nema stavki u inventaru. Dodaj prvu stavku klikom na
        <span class="font-semibold">"Dodaj stavku"</span>.
      </div>

      <div
        v-else-if="!entries.length && total > 0"
        class="col-span-full text-center text-slate-500 text-sm py-8"
      >
        Nema rezultata za zadate filtere/pretragu.
      </div>
    </div>

    <teleport to="body">
      <transition name="fade">
        <div
          v-if="copiedText"
          class="fixed top-6 right-6 bg-gray-800 text-white px-4 py-2 rounded shadow-lg text-sm z-[9999]"
        >
          {{ copiedText }}
        </div>
      </transition>
    </teleport>

    <teleport to="body">
      <transition name="fade">
        <div
          v-if="showForm"
          class="fixed inset-0 z-[9997] flex"
          @click.self="closeForm"
          role="dialog"
          aria-modal="true"
        >
          <div class="absolute inset-0 bg-black/40"></div>

          <div
            class="relative ml-auto h-full w-full sm:w-[640px] bg-white shadow-xl overflow-y-auto"
          >
            <div
              class="sticky top-0 z-10 bg-white/90 backdrop-blur border-b p-4 flex items-center justify-between"
            >
              <h3 class="text-lg font-semibold">
                {{ formMode === 'create' ? 'Dodaj stavku u inventar' : 'Izmeni stavku' }}
              </h3>
              <button
                @click="closeForm"
                class="text-gray-500 hover:text-red-600 text-2xl leading-none"
                aria-label="Zatvori"
              >
                &times;
              </button>
            </div>

            <div class="p-4 space-y-4">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs text-slate-500 mb-1">Tip opreme</label>
                  <select
                    v-model="form.type"
                    class="w-full border px-3 py-2 rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                  >
                    <option disabled value="">Odaberi tip</option>
                    <option v-for="t in typeOptions" :key="t.value" :value="t.value">
                      {{ t.label }}
                    </option>
                  </select>
                </div>

                <div>
                  <label class="block text-xs text-slate-500 mb-1">Proizvođač</label>
                  <input
                    v-model="form.manufacturer"
                    class="w-full border px-3 py-2 rounded shadow-sm text-sm"
                    placeholder="npr. Dell, HP, Seagate…"
                  />
                </div>
                <div>
                  <label class="block text-xs text-slate-500 mb-1">Model</label>
                  <input
                    v-model="form.model"
                    class="w-full border px-3 py-2 rounded shadow-sm text-sm"
                    placeholder="npr. ProLiant DL380 G9…"
                  />
                </div>

                <div>
                  <label class="block text-xs text-slate-500 mb-1">Serijski broj</label>
                  <input
                    v-model="form.serialNumber"
                    class="w-full border px-3 py-2 rounded shadow-sm text-sm font-mono"
                    placeholder="Serijski broj"
                  />
                </div>
                <div>
                  <label class="block text-xs text-slate-500 mb-1">Količina</label>
                  <input
                    v-model.number="form.quantity"
                    type="number"
                    min="1"
                    class="w-full border px-3 py-2 rounded shadow-sm text-sm"
                  />
                </div>

                <div>
                  <label class="block text-xs text-slate-500 mb-1">
                    Kapacitet (HDD/SSD/RAM) / veličina
                  </label>
                  <input
                    v-model="form.capacity"
                    class="w-full border px-3 py-2 rounded shadow-sm text-sm"
                    placeholder="npr. 500 GB, 16 GB…"
                  />
                </div>
                <div>
                  <label class="block text-xs text-slate-500 mb-1">Brzina</label>
                  <input
                    v-model="form.speed"
                    class="w-full border px-3 py-2 rounded shadow-sm text-sm"
                    placeholder="npr. 7200 rpm, 3200 MHz, 3.4 GHz…"
                  />
                </div>

                <div>
                  <label class="block text-xs text-slate-500 mb-1">Socket / Form factor</label>
                  <input
                    v-model="form.socket"
                    class="w-full border px-3 py-2 rounded shadow-sm text-sm"
                    placeholder="npr. LGA1151, SODIMM, ATX…"
                  />
                </div>
                <div>
                  <label class="block text-xs text-slate-500 mb-1">Lokacija</label>
                  <input
                    v-model="form.location"
                    class="w-full border px-3 py-2 rounded shadow-sm text-sm"
                    placeholder="npr. Magacin 2, Orman 3, IT kancelarija…"
                  />
                </div>
              </div>

              <div>
                <label class="block text-xs text-slate-500 mb-1">Napomena</label>
                <textarea
                  v-model="form.notes"
                  rows="3"
                  class="w-full border px-3 py-2 rounded shadow-sm text-sm"
                  placeholder="Dodatne informacije, stanje, istorija, kompatibilnost…"
                ></textarea>
              </div>

              <div class="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  @click="closeForm"
                  class="px-4 py-2 rounded border text-sm text-slate-700 hover:bg-slate-50"
                >
                  Odustani
                </button>
                <button
                  type="button"
                  @click="saveItem"
                  class="px-4 py-2 rounded bg-emerald-600 text-white text-sm hover:bg-emerald-700"
                >
                  {{ formMode === 'create' ? 'Sačuvaj' : 'Sačuvaj izmene' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </teleport>
  </main>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'

const router = useRouter()
const route = useRoute()

const page = ref(parseInt(route.query.page) || 1)
const limit = ref(parseInt(route.query.limit) || 12)
const search = ref(route.query.search || '')
const filterType = ref(route.query.type || 'all')
const sortBy = ref(route.query.sortBy || 'createdAt')
const sortOrder = ref(route.query.sortOrder || 'desc')

const entries = ref([])
const total = ref(0)
const totalPages = ref(0)

const currentPageDisplay = computed(() => (totalPages.value === 0 ? '0' : page.value))

const typeOptions = [
  { value: 'motherboard', label: 'Matična ploča' },
  { value: 'cpu', label: 'Procesor' },
  { value: 'ram', label: 'RAM memorija' },
  { value: 'hdd', label: 'HDD' },
  { value: 'ssd', label: 'SSD' },
  { value: 'psu', label: 'Napajanje' },
  { value: 'gpu', label: 'Grafička karta' },
  { value: 'nic', label: 'Mrežna kartica' },
  { value: 'case', label: 'Kućište' },
  { value: 'router', label: 'Ruter' },
  { value: 'switch', label: 'Svič' },
  { value: 'access-point', label: 'Access point' },
  { value: 'cable-network', label: 'LAN kabl' },
  { value: 'cable-power', label: 'Kabl za napajanje' },
  { value: 'cable-hdmi', label: 'HDMI kabl' },
  { value: 'connector-rj45', label: 'RJ45 konektor' },
  { value: 'tester-network', label: 'Mrežni tester' },
  { value: 'keyboard', label: 'Tastatura' },
  { value: 'mouse', label: 'Miš' },
  { value: 'other', label: 'Ostalo' },
]

const copiedText = ref(null)

async function fetchData() {
  const params = new URLSearchParams({
    page: String(page.value),
    limit: String(limit.value),
    search: search.value || '',
    type: filterType.value || 'all',
    sortBy: sortBy.value || 'createdAt',
    sortOrder: sortOrder.value || 'desc',
  })

  try {
    const res = await fetchWithAuth(`/api/protected/inventory?${params.toString()}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()

    entries.value = data.entries || []
    total.value = data.total ?? 0
    totalPages.value = data.totalPages ?? 0

    // ✅ prihvati safePage sa backend-a
    const safePage = parseInt(data.page) || 1
    if (safePage !== page.value) page.value = safePage

    const appliedLimit = parseInt(data.limit) || limit.value
    if (appliedLimit !== limit.value) limit.value = appliedLimit
  } catch (e) {
    console.error('Neuspešno dohvatanje inventara:', e)
    entries.value = []
    total.value = 0
    totalPages.value = 0
  }
}

const nextPage = () => {
  if (page.value < totalPages.value) page.value++
}
const prevPage = () => {
  if (page.value > 1) page.value--
}

const fmtDate = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt) ? '—' : dt.toLocaleDateString()
}

const labelForType = (t) => {
  const found = typeOptions.find((x) => x.value === t)
  return found ? found.label : 'Oprema'
}

const shortSerial = (s) => {
  if (!s) return ''
  if (s.length <= 10) return s
  return `${s.slice(0, 4)}…${s.slice(-4)}`
}

const copyToClipboard = async (text, label = 'Kopirano!') => {
  try {
    await navigator.clipboard.writeText(text)
    copiedText.value = `✅ ${label}`
  } catch {
    copiedText.value = '❌ Neuspešno kopiranje'
  }
  setTimeout(() => (copiedText.value = null), 2000)
}

const showForm = ref(false)
const formMode = ref('create')
const form = ref({
  id: null,
  type: '',
  manufacturer: '',
  model: '',
  serialNumber: '',
  quantity: 1,
  capacity: '',
  speed: '',
  socket: '',
  location: '',
  notes: '',
})

const resetForm = () => {
  form.value = {
    id: null,
    type: '',
    manufacturer: '',
    model: '',
    serialNumber: '',
    quantity: 1,
    capacity: '',
    speed: '',
    socket: '',
    location: '',
    notes: '',
  }
}

const openAddModal = () => {
  formMode.value = 'create'
  resetForm()
  showForm.value = true
}

const openEditModal = (item) => {
  formMode.value = 'edit'
  form.value = {
    id: item.id,
    type: item.type || '',
    manufacturer: item.manufacturer || '',
    model: item.model || '',
    serialNumber: item.serialNumber || '',
    quantity: item.quantity || 1,
    capacity: item.capacity || '',
    speed: item.speed || '',
    socket: item.socket || '',
    location: item.location || '',
    notes: item.notes || '',
  }
  showForm.value = true
}

const closeForm = () => {
  showForm.value = false
}

const saveItem = async () => {
  if (!form.value.type || !form.value.model) {
    alert('Bar tip opreme i model su obavezni.')
    return
  }

  const payload = {
    type: form.value.type,
    manufacturer: form.value.manufacturer,
    model: form.value.model,
    serialNumber: form.value.serialNumber,
    quantity: form.value.quantity || 1,
    capacity: form.value.capacity,
    speed: form.value.speed,
    socket: form.value.socket,
    location: form.value.location,
    notes: form.value.notes,
  }

  try {
    let res
    if (formMode.value === 'create') {
      res = await fetchWithAuth('/api/protected/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } else {
      res = await fetchWithAuth(`/api/protected/inventory/${form.value.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `HTTP ${res.status}`)
    }

    showForm.value = false
    await fetchData()
  } catch (e) {
    console.error('Greška pri čuvanju stavke:', e)
    alert('Greška pri čuvanju stavke inventara.')
  }
}

const confirmDelete = async (item) => {
  if (!confirm(`Da li želiš da obrišeš ${item.model || 'ovu stavku'} iz inventara?`)) return
  try {
    const res = await fetchWithAuth(`/api/protected/inventory/${item.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `HTTP ${res.status}`)
    }
    await fetchData()
  } catch (e) {
    console.error('Greška pri brisanju stavke:', e)
    alert('Greška pri brisanju stavke.')
  }
}

const exportToXlsx = async () => {
  try {
    const res = await fetchWithAuth(`/api/protected/inventory/export`)
    if (!res.ok) throw new Error()
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'inventar.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    console.error('Greška pri eksportu:', e)
  }
}

watch([limit, search, filterType, sortBy, sortOrder], () => {
  page.value = 1
})

watch(
  () => route.query,
  (q) => {
    const qp = parseInt(q.page) || 1
    const ql = parseInt(q.limit) || 12
    const qs = q.search || ''
    const qt = q.type || 'all'
    const qsb = q.sortBy || 'createdAt'
    const qso = q.sortOrder || 'desc'

    if (page.value !== qp) page.value = qp
    if (limit.value !== ql) limit.value = ql
    if (search.value !== qs) search.value = qs
    if (filterType.value !== qt) filterType.value = qt
    if (sortBy.value !== qsb) sortBy.value = qsb
    if (sortOrder.value !== qso) sortOrder.value = qso

    fetchData()
  },
  { immediate: true }
)

watch([page, limit, search, filterType, sortBy, sortOrder], () => {
  const nextQuery = {
    page: String(page.value),
    limit: String(limit.value),
    search: search.value ? String(search.value) : undefined,
    type: filterType.value || 'all',
    sortBy: sortBy.value || 'createdAt',
    sortOrder: sortOrder.value || 'desc',
  }

  if (
    (route.query.page || '1') === nextQuery.page &&
    (route.query.limit || '12') === nextQuery.limit &&
    (route.query.search || '') === (nextQuery.search || '') &&
    (route.query.type || 'all') === nextQuery.type &&
    (route.query.sortBy || 'createdAt') === nextQuery.sortBy &&
    (route.query.sortOrder || 'desc') === nextQuery.sortOrder
  ) {
    return
  }

  router.replace({ query: nextQuery })
})
</script>

