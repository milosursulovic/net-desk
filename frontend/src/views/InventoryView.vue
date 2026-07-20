<template>
  <main class="glass-container relative">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <h1 class="text-xl sm:text-2xl font-semibold text-slate-700">Inventar hardvera</h1>

      <div class="flex flex-wrap items-center gap-2">
        <AppButton variant="success" @click="openAddModal">Dodaj stavku</AppButton>

        <AppButton variant="secondary" @click="exportToXlsx">Izvezi XLSX</AppButton>
      </div>
    </div>

    <div class="mb-4 space-y-3">
      <!-- Pretraga -->
      <input v-model="search" type="text" placeholder="Pretraga (model, serijski, proizvođač, lokacija…) "
        class="app-input w-full" />

      <!-- Filteri, sortiranje, paginacija -->
      <div class="flex flex-wrap items-center gap-2">
        <select v-model="filterType" class="app-input w-auto py-2 text-sm" :title="'Filter po tipu opreme'">
          <option value="all">Sve vrste</option>
          <option v-for="t in typeOptions" :key="t.value" :value="t.value">
            {{ t.label }}
          </option>
        </select>

        <select v-model="sortBy" class="app-input w-auto py-2 text-sm">
          <option value="type">Tip</option>
          <option value="manufacturer">Proizvođač</option>
          <option value="model">Model</option>
          <option value="location">Lokacija</option>
          <option value="createdAt">Datum unosa</option>
        </select>

        <button @click="sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'"
          class="px-2.5 py-2 border rounded-lg text-sm hover:bg-slate-50"
          :title="sortOrder === 'asc' ? 'Rastuće — klikni za opadajuće' : 'Opadajuće — klikni za rastuće'"
          aria-label="Promeni redosled sortiranja">
          {{ sortOrder === 'asc' ? '↑' : '↓' }}
        </button>

        <select v-model.number="limit" class="app-input w-auto py-2 text-sm">
          <option :value="12">12 / strana</option>
          <option :value="24">24 / strana</option>
          <option :value="48">48 / strana</option>
        </select>

        <span class="mx-1 hidden h-5 w-px bg-slate-200 sm:inline-block"></span>

        <button @click="prevPage" :disabled="page === 1"
          class="px-2 py-1 bg-white border rounded-lg disabled:opacity-50 hover:bg-slate-100">
          ⬅️
        </button>
        <span class="text-sm text-slate-600">Strana {{ currentPageDisplay }} / {{ totalPages }}</span>
        <button @click="nextPage({ totalPages })" :disabled="page >= totalPages"
          class="px-2 py-1 bg-white border rounded-lg disabled:opacity-50 hover:bg-slate-100">
          ➡️
        </button>
      </div>

      <p class="text-sm text-slate-500">
        Prikazano {{ entries.length }} od {{ total }} stavki
      </p>
    </div>

    <div class="mt-2 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      <article v-for="item in entries" :key="item.id"
        class="rounded-xl border bg-white/90 shadow-sm hover:shadow-md transition p-4 flex flex-col">
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
            <button v-if="item.serialNumber" @click="copyToClipboard(item.serialNumber, 'Serijski broj kopiran!')"
              class="text-[11px] text-blue-600 hover:underline mt-1" title="Kopiraj serijski broj">
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

      <div v-if="!entries.length && total === 0" class="col-span-full text-center text-slate-500 text-sm py-8">
        Nema stavki u inventaru. Dodaj prvu stavku klikom na
        <span class="font-semibold">"Dodaj stavku"</span>.
      </div>

      <div v-else-if="!entries.length && total > 0" class="col-span-full text-center text-slate-500 text-sm py-8">
        Nema rezultata za zadate filtere/pretragu.
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

    <SlideOverPanel :open="showForm" :title="formMode === 'create' ? 'Dodaj stavku u inventar' : 'Izmeni stavku'"
      @close="closeForm">
      <div class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-slate-500 mb-1">Tip opreme</label>
            <select v-model="form.type" class="app-input w-full text-sm">
              <option disabled value="">Odaberi tip</option>
              <option v-for="t in typeOptions" :key="t.value" :value="t.value">
                {{ t.label }}
              </option>
            </select>
          </div>

          <div>
            <label class="block text-xs text-slate-500 mb-1">Proizvođač</label>
            <input v-model="form.manufacturer" class="app-input w-full text-sm"
              placeholder="npr. Dell, HP, Seagate…" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">Model</label>
            <input v-model="form.model" class="app-input w-full text-sm"
              placeholder="npr. ProLiant DL380 G9…" />
          </div>

          <div>
            <label class="block text-xs text-slate-500 mb-1">Serijski broj</label>
            <input v-model="form.serialNumber" class="app-input w-full text-sm font-mono"
              placeholder="Serijski broj" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">Količina</label>
            <input v-model.number="form.quantity" type="number" min="1" class="app-input w-full text-sm" />
          </div>

          <div>
            <label class="block text-xs text-slate-500 mb-1">
              Kapacitet (HDD/SSD/RAM) / veličina
            </label>
            <input v-model="form.capacity" class="app-input w-full text-sm"
              placeholder="npr. 500 GB, 16 GB…" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">Brzina</label>
            <input v-model="form.speed" class="app-input w-full text-sm"
              placeholder="npr. 7200 rpm, 3200 MHz, 3.4 GHz…" />
          </div>

          <div>
            <label class="block text-xs text-slate-500 mb-1">Socket / Form factor</label>
            <input v-model="form.socket" class="app-input w-full text-sm"
              placeholder="npr. LGA1151, SODIMM, ATX…" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">Lokacija</label>
            <input v-model="form.location" class="app-input w-full text-sm"
              placeholder="npr. Magacin 2, Orman 3, IT kancelarija…" />
          </div>
        </div>

        <div>
          <label class="block text-xs text-slate-500 mb-1">Napomena</label>
          <textarea v-model="form.notes" rows="3" class="app-input w-full text-sm"
            placeholder="Dodatne informacije, stanje, istorija, kompatibilnost…"></textarea>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t">
          <AppButton type="button" variant="neutral" @click="closeForm">Odustani</AppButton>
          <AppButton type="button" variant="success" @click="saveItem">
            {{ formMode === 'create' ? 'Sačuvaj' : 'Sačuvaj izmene' }}
          </AppButton>
        </div>
      </div>
    </SlideOverPanel>
  </main>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { fmtDateOnly, shortSerial } from '@/utils/format.js'
import { downloadFromResponse } from '@/utils/download.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import { useToast } from '@/composables/useToast.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import {
  INVENTORY_TYPE_OPTIONS,
  labelForInventoryType,
} from '@/constants/inventoryTypes.js'
import SlideOverPanel from '@/components/SlideOverPanel.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AppButton from '@/components/AppButton.vue'

const {
  page,
  limit,
  search,
  filterType,
  sortBy,
  sortOrder,
  nextPage,
  prevPage,
  applyServerPagination,
} = usePaginatedRoute({
  fields: {
    page: { type: 'int', default: 1 },
    limit: { type: 'int', default: 12 },
    search: { type: 'string', default: '', omitIfEmpty: true },
    filterType: { type: 'string', default: 'all', queryKey: 'type' },
    sortBy: { type: 'string', default: 'createdAt' },
    sortOrder: { type: 'string', default: 'desc' },
  },
  resetPageOn: ['limit', 'search', 'filterType', 'sortBy', 'sortOrder'],
  useReplace: true,
})

watch(
  [page, limit, search, filterType, sortBy, sortOrder],
  fetchData
)

const entries = ref([])
const total = ref(0)
const totalPages = ref(0)
const typeOptions = INVENTORY_TYPE_OPTIONS
const { toast, showToast, copyToClipboard } = useToast()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()

const currentPageDisplay = computed(() => (totalPages.value === 0 ? '0' : page.value))
const fmtDate = fmtDateOnly
const labelForType = labelForInventoryType

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
    applyServerPagination(data)
  } catch (e) {
    console.error('Neuspešno dohvatanje inventara:', e)
    entries.value = []
    total.value = 0
    totalPages.value = 0
  }
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
    showToast('Bar tip opreme i model su obavezni.', { prefix: '❌ ', duration: 3000 })
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
      throw new Error(await parseError(res, `HTTP ${res.status}`))
    }

    showForm.value = false
    await fetchData()
  } catch (e) {
    console.error('Greška pri čuvanju stavke:', e)
    showToast('Greška pri čuvanju stavke inventara.', { prefix: '❌ ', duration: 3000 })
  }
}

const confirmDelete = async (item) => {
  const ok = await askConfirm(`Da li želiš da obrišeš ${item.model || 'ovu stavku'} iz inventara?`, {
    title: 'Brisanje stavke',
  })
  if (!ok) return

  try {
    const res = await fetchWithAuth(`/api/protected/inventory/${item.id}`, { method: 'DELETE' })
    if (!res.ok) {
      throw new Error(await parseError(res, `HTTP ${res.status}`))
    }
    await fetchData()
  } catch (e) {
    console.error('Greška pri brisanju stavke:', e)
    showToast('Greška pri brisanju stavke.', { prefix: '❌ ', duration: 3000 })
  }
}

const exportToXlsx = async () => {
  try {
    await downloadFromResponse(
      await fetchWithAuth('/api/protected/inventory/export'),
      'inventar.xlsx'
    )
  } catch (e) {
    console.error('Greška pri eksportu:', e)
  }
}

onMounted(() => {
  fetchData()
})

</script>
