<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">{{ t('inventory.title') }}</h1>

      <div class="flex flex-wrap items-center gap-2">
        <AppButton variant="success" @click="openAddModal">{{ t('inventory.addItem') }}</AppButton>

        <AppButton variant="secondary" @click="exportToXlsx">{{ t('home.exportXlsx') }}</AppButton>
      </div>
    </div>

    <div class="space-y-3">
      <!-- Pretraga -->
      <input v-model="search" type="text" :placeholder="t('inventory.searchPlaceholder')"
        class="app-input w-full" />

      <!-- Filteri -->
      <div class="flex items-center gap-2">
        <button type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-sunken sm:hidden"
          @click="filtersOpen = !filtersOpen">
          {{ t('home.filters') }}
          <span v-if="activeFilterCount"
            class="rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold text-white">{{ activeFilterCount }}</span>
          <NavIcon :name="filtersOpen ? 'chevron-up' : 'chevron-down'" class="text-xs" />
        </button>
      </div>

      <div class="flex-wrap items-center gap-2" :class="filtersOpen ? 'flex' : 'hidden sm:flex'">
        <select v-model="filterType" class="app-input w-auto py-2 text-sm" :title="t('inventory.typeFilterTitle')">
          <option value="all">{{ t('inventory.allTypes') }}</option>
          <option v-for="t2 in typeOptions" :key="t2.value" :value="t2.value">
            {{ t2.label }}
          </option>
        </select>

        <select v-model="sortBy" class="app-input w-auto py-2 text-sm">
          <option value="type">{{ t('inventory.colType') }}</option>
          <option value="manufacturer">{{ t('inventory.manufacturer') }}</option>
          <option value="model">Model</option>
          <option value="location">{{ t('inventory.location') }}</option>
          <option value="createdAt">{{ t('inventory.dateAdded') }}</option>
        </select>

        <button @click="sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'"
          class="px-2.5 py-2 border border-line rounded-lg text-sm hover:bg-surface-sunken"
          :title="sortOrder === 'asc' ? t('home.sortAsc') : t('home.sortDesc')"
          :aria-label="t('home.changeSortOrder')">
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
        {{ t('inventory.shown', { shown: entries.length, total }) }}
      </p>
    </div>

    <div v-if="!entries.length && total === 0" class="table-shell p-8 text-center text-ink-muted text-sm">
      <i18n-t keypath="inventory.emptyState" tag="span">
        <template #button><span class="font-semibold text-ink">"{{ t('inventory.addItem') }}"</span></template>
      </i18n-t>
    </div>

    <div v-else-if="!entries.length && total > 0" class="table-shell p-8 text-center text-ink-muted text-sm">
      {{ t('inventory.noResults') }}
    </div>

    <div v-else class="table-shell">
      <div class="overflow-x-auto">
        <table class="w-full min-w-250 border-collapse text-sm">
          <thead>
            <tr class="table-head-row">
              <th class="px-3 py-2 text-left">{{ t('inventory.colType') }}</th>
              <th class="px-3 py-2 text-left">{{ t('inventory.colManufacturerModel') }}</th>
              <th class="px-3 py-2 text-left">{{ t('inventory.colSerial') }}</th>
              <th class="px-3 py-2 text-right">{{ t('inventory.colQuantity') }}</th>
              <th class="px-3 py-2 text-left">{{ t('inventory.colSpec') }}</th>
              <th class="px-3 py-2 text-left">{{ t('inventory.location') }}</th>
              <th class="px-3 py-2 text-left">{{ t('inventory.colNote') }}</th>
              <th class="px-3 py-2 text-left">{{ t('inventory.colAdded') }}</th>
              <th class="px-3 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in entries" :key="item.id" class="group border-b border-line last:border-0 hover:bg-surface-sunken">
              <td class="px-3 py-2.5 align-top text-xs uppercase tracking-wide text-ink-muted">
                {{ labelForType(item.type) }}
              </td>
              <td class="px-3 py-2.5 align-top">
                <div class="font-semibold text-ink">{{ item.model || t('inventory.unknownModel') }}</div>
                <div class="text-xs text-ink-muted">{{ item.manufacturer || t('inventory.unknownManufacturer') }}</div>
              </td>
              <td class="px-3 py-2.5 align-top">
                <button v-if="item.serialNumber" @click="copyToClipboard(item.serialNumber, t('inventory.serialCopied'))"
                  class="font-mono text-xs text-accent hover:underline" :title="t('inventory.copySerialTitle')">
                  <NavIcon name="copy" class="inline-block align-text-bottom" /> {{ shortSerial(item.serialNumber) }}
                </button>
                <span v-else class="text-ink-muted">—</span>
              </td>
              <td class="px-3 py-2.5 align-top text-right font-mono font-semibold text-ink">{{ item.quantity }}</td>
              <td class="px-3 py-2.5 align-top text-xs text-ink-secondary">
                <div v-if="item.capacity">{{ t('inventory.capacity') }}: {{ item.capacity }}</div>
                <div v-if="item.speed">{{ t('inventory.speed') }}: {{ item.speed }}</div>
                <div v-if="item.socket">{{ t('inventory.socket') }}: {{ item.socket }}</div>
                <span v-if="!item.capacity && !item.speed && !item.socket" class="text-ink-muted">—</span>
              </td>
              <td class="px-3 py-2.5 align-top text-ink-secondary">
                <div>{{ labelForSite(item.site) }}</div>
                <div class="text-xs text-ink-muted">{{ item.location || t('inventory.warehouse') }}</div>
              </td>
              <td class="px-3 py-2.5 align-top max-w-40 truncate text-ink-secondary" :title="item.notes">
                {{ item.notes || '—' }}
              </td>
              <td class="px-3 py-2.5 align-top text-xs text-ink-muted font-mono">
                {{ fmtDate(item.createdAt) }}
                <span v-if="item.updatedAt" class="block">{{ t('inventory.updatedShort') }}: {{ fmtDate(item.updatedAt) }}</span>
              </td>
              <td class="px-3 py-2.5 align-top text-right">
                <div class="table-row-actions">
                  <button @click="openEditModal(item)" class="rounded p-1 text-accent hover:bg-surface-sunken" :title="t('common.edit')">
                    <NavIcon name="edit" />
                  </button>
                  <button v-if="isAdmin" @click="confirmDelete(item)" class="rounded p-1 text-bad hover:bg-surface-sunken" :title="t('common.delete')">
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

    <SlideOverPanel :open="showForm" :title="formMode === 'create' ? t('inventory.addToInventory') : t('inventory.editItem')"
      @close="closeForm">
      <div class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-ink-muted mb-1">{{ t('inventory.equipmentType') }}</label>
            <select v-model="form.type" class="app-input w-full text-sm">
              <option disabled value="">{{ t('inventory.chooseType') }}</option>
              <option v-for="t2 in typeOptions" :key="t2.value" :value="t2.value">
                {{ t2.label }}
              </option>
            </select>
          </div>

          <div>
            <label class="block text-xs text-ink-muted mb-1">{{ t('inventory.manufacturer') }}</label>
            <input v-model="form.manufacturer" class="app-input w-full text-sm"
              :placeholder="t('inventory.manufacturerPlaceholder')" />
          </div>
          <div>
            <label class="block text-xs text-ink-muted mb-1">Model</label>
            <input v-model="form.model" class="app-input w-full text-sm"
              :placeholder="t('inventory.modelPlaceholder')" />
          </div>

          <div>
            <label class="block text-xs text-ink-muted mb-1">{{ t('inventory.serialNumber') }}</label>
            <input v-model="form.serialNumber" class="app-input w-full text-sm font-mono"
              :placeholder="t('inventory.serialNumber')" />
          </div>
          <div>
            <label class="block text-xs text-ink-muted mb-1">{{ t('inventory.colQuantity') }}</label>
            <input v-model.number="form.quantity" type="number" min="1" class="app-input w-full text-sm" />
          </div>

          <div>
            <label class="block text-xs text-ink-muted mb-1">
              {{ t('inventory.capacityLabel') }}
            </label>
            <input v-model="form.capacity" class="app-input w-full text-sm"
              :placeholder="t('inventory.capacityPlaceholder')" />
          </div>
          <div>
            <label class="block text-xs text-ink-muted mb-1">{{ t('inventory.speed') }}</label>
            <input v-model="form.speed" class="app-input w-full text-sm"
              :placeholder="t('inventory.speedPlaceholder')" />
          </div>

          <div>
            <label class="block text-xs text-ink-muted mb-1">{{ t('inventory.socketLabel') }}</label>
            <input v-model="form.socket" class="app-input w-full text-sm"
              :placeholder="t('inventory.socketPlaceholder')" />
          </div>
          <div>
            <label class="block text-xs text-ink-muted mb-1">{{ t('inventory.location') }}</label>
            <input v-model="form.location" class="app-input w-full text-sm"
              :placeholder="t('inventory.locationPlaceholder')" />
          </div>
          <div>
            <label class="block text-xs text-ink-muted mb-1">{{ t('inventory.site') }}</label>
            <select v-model="form.site" class="app-input w-full text-sm">
              <option v-for="o in SITE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block text-xs text-ink-muted mb-1">{{ t('inventory.colNote') }}</label>
          <textarea v-model="form.notes" rows="3" class="app-input w-full text-sm"
            :placeholder="t('inventory.notesPlaceholder')"></textarea>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-line">
          <AppButton type="button" variant="neutral" @click="closeForm">{{ t('inventory.discard') }}</AppButton>
          <AppButton type="button" variant="success" @click="saveItem">
            {{ formMode === 'create' ? t('common.save') : t('editIp.save') }}
          </AppButton>
        </div>
      </div>
    </SlideOverPanel>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
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

const { t } = useI18n()
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
    showToast(t('inventory.errorRequired'), { kind: 'error', duration: 3000 })
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
    showToast(t('inventory.errorSave'), { kind: 'error', duration: 3000 })
  }
}

const confirmDelete = async (item) => {
  const ok = await askConfirm(t('inventory.confirmDeleteMessage', { name: item.model || t('inventory.thisItem') }), {
    title: t('inventory.confirmDeleteTitle'),
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
    showToast(t('inventory.errorDelete'), { kind: 'error', duration: 3000 })
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
