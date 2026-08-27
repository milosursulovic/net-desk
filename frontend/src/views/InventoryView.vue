<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">Inventar hardvera</h1>

      <div class="flex flex-wrap items-center gap-2">
        <AppButton variant="success" @click="openAddModal">Dodaj stavku</AppButton>

        <AppButton variant="secondary" @click="exportToXlsx">Izvezi XLSX</AppButton>
      </div>
    </div>

    <div class="space-y-3">
      <!-- Pretraga -->
      <input v-model="search" type="text" placeholder="Pretraga (model, serijski, proizvođač, lokacija…) "
        class="app-input w-full" />

      <!-- Filteri -->
      <div class="flex items-center gap-2">
        <button type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-sunken sm:hidden"
          @click="filtersOpen = !filtersOpen">
          Filteri
          <span v-if="activeFilterCount"
            class="rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold text-white">{{ activeFilterCount }}</span>
          <NavIcon :name="filtersOpen ? 'chevron-up' : 'chevron-down'" class="text-xs" />
        </button>
      </div>

      <div class="flex-wrap items-center gap-2" :class="filtersOpen ? 'flex' : 'hidden sm:flex'">
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
          class="px-2.5 py-2 border border-line rounded-lg text-sm hover:bg-surface-sunken"
          :title="sortOrder === 'asc' ? 'Rastuće — klikni za opadajuće' : 'Opadajuće — klikni za rastuće'"
          aria-label="Promeni redosled sortiranja">
          <NavIcon :name="sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'" />
        </button>
      </div>

      <PaginationBar
        :page="page"
        :limit="limit"
        :total="total"
        :total-pages="totalPages"
        :limit-options="[12, 24, 48]"
        @prev="prevPage"
        @next="nextPage({ totalPages })"
        @update:limit="(v) => (limit = v)"
      />

      <p class="text-sm text-ink-muted">
        Prikazano {{ entries.length }} od {{ total }} stavki
      </p>
    </div>

    <div v-if="!entries.length && total === 0" class="table-shell p-8 text-center text-ink-muted text-sm">
      Nema stavki u inventaru. Dodaj prvu stavku klikom na
      <span class="font-semibold text-ink">"Dodaj stavku"</span>.
    </div>

    <div v-else-if="!entries.length && total > 0" class="table-shell p-8 text-center text-ink-muted text-sm">
      Nema rezultata za zadate filtere/pretragu.
    </div>

    <div v-else class="table-shell">
      <div class="overflow-x-auto">
        <table class="w-full min-w-250 border-collapse text-sm">
          <thead>
            <tr class="table-head-row">
              <th class="px-3 py-2 text-left">Tip</th>
              <th class="px-3 py-2 text-left">Proizvođač / Model</th>
              <th class="px-3 py-2 text-left">Serijski</th>
              <th class="px-3 py-2 text-right">Količina</th>
              <th class="px-3 py-2 text-left">Specifikacija</th>
              <th class="px-3 py-2 text-left">Lokacija</th>
              <th class="px-3 py-2 text-left">Napomena</th>
              <th class="px-3 py-2 text-left">Uneto</th>
              <th class="px-3 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in entries" :key="item.id" class="group border-b border-line last:border-0 hover:bg-surface-sunken">
              <td class="px-3 py-2.5 align-top text-xs uppercase tracking-wide text-ink-muted">
                {{ labelForType(item.type) }}
              </td>
              <td class="px-3 py-2.5 align-top">
                <div class="font-semibold text-ink">{{ item.model || 'Nepoznat model' }}</div>
                <div class="text-xs text-ink-muted">{{ item.manufacturer || 'Nepoznat proizvođač' }}</div>
              </td>
              <td class="px-3 py-2.5 align-top">
                <button v-if="item.serialNumber" @click="copyToClipboard(item.serialNumber, 'Serijski broj kopiran!')"
                  class="font-mono text-xs text-accent hover:underline" title="Kopiraj serijski broj">
                  <NavIcon name="copy" class="inline-block align-text-bottom" /> {{ shortSerial(item.serialNumber) }}
                </button>
                <span v-else class="text-ink-muted">—</span>
              </td>
              <td class="px-3 py-2.5 align-top text-right font-mono font-semibold text-ink">{{ item.quantity }}</td>
              <td class="px-3 py-2.5 align-top text-xs text-ink-secondary">
                <div v-if="item.capacity">Kapacitet: {{ item.capacity }}</div>
                <div v-if="item.speed">Brzina: {{ item.speed }}</div>
                <div v-if="item.socket">Socket/FF: {{ item.socket }}</div>
                <span v-if="!item.capacity && !item.speed && !item.socket" class="text-ink-muted">—</span>
              </td>
              <td class="px-3 py-2.5 align-top text-ink-secondary">
                <div>{{ labelForSite(item.site) }}</div>
                <div class="text-xs text-ink-muted">{{ item.location || 'Magacin' }}</div>
              </td>
              <td class="px-3 py-2.5 align-top max-w-40 truncate text-ink-secondary" :title="item.notes">
                {{ item.notes || '—' }}
              </td>
              <td class="px-3 py-2.5 align-top text-xs text-ink-muted font-mono">
                {{ fmtDate(item.createdAt) }}
                <span v-if="item.updatedAt" class="block">Izm: {{ fmtDate(item.updatedAt) }}</span>
              </td>
              <td class="px-3 py-2.5 align-top text-right">
                <div class="table-row-actions">
                  <button @click="openEditModal(item)" class="rounded p-1 text-accent hover:bg-surface-sunken" title="Izmeni">
                    <NavIcon name="edit" />
                  </button>
                  <button v-if="isAdmin" @click="confirmDelete(item)" class="rounded p-1 text-bad hover:bg-surface-sunken" title="Obriši">
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

    <SlideOverPanel :open="showForm" :title="formMode === 'create' ? 'Dodaj stavku u inventar' : 'Izmeni stavku'"
      @close="closeForm">
      <div class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-ink-muted mb-1">Tip opreme</label>
            <select v-model="form.type" class="app-input w-full text-sm">
              <option disabled value="">Odaberi tip</option>
              <option v-for="t in typeOptions" :key="t.value" :value="t.value">
                {{ t.label }}
              </option>
            </select>
          </div>

          <div>
            <label class="block text-xs text-ink-muted mb-1">Proizvođač</label>
            <input v-model="form.manufacturer" class="app-input w-full text-sm"
              placeholder="npr. Dell, HP, Seagate…" />
          </div>
          <div>
            <label class="block text-xs text-ink-muted mb-1">Model</label>
            <input v-model="form.model" class="app-input w-full text-sm"
              placeholder="npr. ProLiant DL380 G9…" />
          </div>

          <div>
            <label class="block text-xs text-ink-muted mb-1">Serijski broj</label>
            <input v-model="form.serialNumber" class="app-input w-full text-sm font-mono"
              placeholder="Serijski broj" />
          </div>
          <div>
            <label class="block text-xs text-ink-muted mb-1">Količina</label>
            <input v-model.number="form.quantity" type="number" min="1" class="app-input w-full text-sm" />
          </div>

          <div>
            <label class="block text-xs text-ink-muted mb-1">
              Kapacitet (HDD/SSD/RAM) / veličina
            </label>
            <input v-model="form.capacity" class="app-input w-full text-sm"
              placeholder="npr. 500 GB, 16 GB…" />
          </div>
          <div>
            <label class="block text-xs text-ink-muted mb-1">Brzina</label>
            <input v-model="form.speed" class="app-input w-full text-sm"
              placeholder="npr. 7200 rpm, 3200 MHz, 3.4 GHz…" />
          </div>

          <div>
            <label class="block text-xs text-ink-muted mb-1">Socket / Form factor</label>
            <input v-model="form.socket" class="app-input w-full text-sm"
              placeholder="npr. LGA1151, SODIMM, ATX…" />
          </div>
          <div>
            <label class="block text-xs text-ink-muted mb-1">Lokacija</label>
            <input v-model="form.location" class="app-input w-full text-sm"
              placeholder="npr. Magacin 2, Orman 3, IT kancelarija…" />
          </div>
          <div>
            <label class="block text-xs text-ink-muted mb-1">Objekat</label>
            <select v-model="form.site" class="app-input w-full text-sm">
              <option v-for="o in SITE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block text-xs text-ink-muted mb-1">Napomena</label>
          <textarea v-model="form.notes" rows="3" class="app-input w-full text-sm"
            placeholder="Dodatne informacije, stanje, istorija, kompatibilnost…"></textarea>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-line">
          <AppButton type="button" variant="neutral" @click="closeForm">Odustani</AppButton>
          <AppButton type="button" variant="success" @click="saveItem">
            {{ formMode === 'create' ? 'Sačuvaj' : 'Sačuvaj izmene' }}
          </AppButton>
        </div>
      </div>
    </SlideOverPanel>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { fmtDateOnly, shortSerial } from '@/utils/format.js'
import { downloadFromResponse } from '@/utils/download.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import { useCurrentSite } from '@/composables/useCurrentSite.js'
import { useToast } from '@/composables/useToast.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import { SITE_OPTIONS, labelForSite } from '@/constants/sites.js'
import {
  INVENTORY_TYPE_OPTIONS,
  labelForInventoryType,
} from '@/constants/inventoryTypes.js'
import SlideOverPanel from '@/components/SlideOverPanel.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AppButton from '@/components/AppButton.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import NavIcon from '@/components/NavIcon.vue'

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

const site = useCurrentSite()

watch(
  [page, limit, search, filterType, sortBy, sortOrder, site],
  fetchData
)

const entries = ref([])
const total = ref(0)
const totalPages = ref(0)
const typeOptions = INVENTORY_TYPE_OPTIONS
const { toast, showToast, copyToClipboard } = useToast()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()
const { isAdmin } = useCurrentUser()


// Filter panel je na mobilnom skupljen po difoltu (ispod sm).
const filtersOpen = ref(false)
const activeFilterCount = computed(() => (filterType.value !== 'all' ? 1 : 0))
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
    site: site.value,
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
  site: site.value,
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
    site: site.value,
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
    site: item.site || site.value,
    notes: item.notes || '',
  }
  showForm.value = true
}

const closeForm = () => {
  showForm.value = false
}

const saveItem = async () => {
  if (!form.value.type || !form.value.model) {
    showToast('Bar tip opreme i model su obavezni.', { kind: 'error', duration: 3000 })
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
    site: form.value.site,
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
    showToast('Greška pri čuvanju stavke inventara.', { kind: 'error', duration: 3000 })
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
    showToast('Greška pri brisanju stavke.', { kind: 'error', duration: 3000 })
  }
}

const exportToXlsx = async () => {
  try {
    await downloadFromResponse(
      await fetchWithAuth(`/api/protected/inventory/export?site=${site.value}`),
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
