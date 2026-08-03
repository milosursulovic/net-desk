<template>
  <div class="glass-container w-full max-w-3xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-slate-800">
        Inventar — {{ entry?.computer_name || entry?.ip || 'Nepoznato' }}
      </h1>
      <div class="flex items-center gap-2">
        <AppButton
          v-if="hasAnyPdsuData"
          variant="secondary"
          :disabled="exportingPdf"
          @click="exportPdf"
        >
          {{ exportingPdf ? 'Izvoz…' : 'Izvezi PDF' }}
        </AppButton>
        <AppButton
          v-if="hasAnyPdsuData"
          variant="danger"
          @click="clearPdsu"
        >
          Očisti PDSU podatke
        </AppButton>
        <AppButton variant="neutral" @click="goBack">Nazad</AppButton>
      </div>
    </div>

    <div v-if="entryLoading" class="text-slate-600">Učitavanje…</div>
    <div v-else-if="entryError" class="text-red-600">{{ entryError }}</div>

    <div v-else class="space-y-4">
      <div class="flex flex-nowrap gap-2 overflow-x-auto border-b pb-3 no-scrollbar sm:flex-wrap sm:overflow-visible">
        <button
          type="button"
          @click="selectTab('software')"
          class="shrink-0 px-3 py-2 rounded-md text-sm font-medium transition"
          :class="
            tab === 'software'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          "
        >
          Softver
          <span v-if="loaded.software" class="ml-1"> ({{ software.length }}) </span>
        </button>

        <button
          type="button"
          @click="selectTab('drivers')"
          class="shrink-0 px-3 py-2 rounded-md text-sm font-medium transition"
          :class="
            tab === 'drivers'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          "
        >
          Drajveri
          <span v-if="loaded.drivers" class="ml-1"> ({{ drivers.length }}) </span>
        </button>

        <button
          type="button"
          @click="selectTab('services')"
          class="shrink-0 px-3 py-2 rounded-md text-sm font-medium transition"
          :class="
            tab === 'services'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          "
        >
          Servisi
          <span v-if="loaded.services" class="ml-1"> ({{ services.length }}) </span>
        </button>

        <button
          type="button"
          @click="selectTab('updates')"
          class="shrink-0 px-3 py-2 rounded-md text-sm font-medium transition"
          :class="
            tab === 'updates'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          "
        >
          Ažuriranja
          <span v-if="loaded.updates" class="ml-1"> ({{ updates.length }}) </span>
        </button>

        <button
          type="button"
          @click="selectTab('printers')"
          class="shrink-0 px-3 py-2 rounded-md text-sm font-medium transition"
          :class="
            tab === 'printers'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          "
        >
          Štampači
          <span v-if="loaded.printers" class="ml-1"> ({{ printers.length }}) </span>
        </button>
      </div>

      <div class="relative">
        <input
          v-model="search"
          type="text"
          :placeholder="
            tab === 'software'
              ? 'Pretraži softver, verziju ili izdavača...'
              : tab === 'drivers'
              ? 'Pretraži uređaj, drajver ili proizvođača...'
              : tab === 'services'
              ? 'Pretraži servis, status ili putanju...'
              : tab === 'updates'
              ? 'Pretraži KB, opis ili korisnika...'
              : 'Pretraži štampač, drajver ili port...'
          "
          class="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
        />

        <button
          v-if="search"
          type="button"
          @click="search = ''"
          class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
          title="Obriši pretragu"
        >
          ✕
        </button>
      </div>

      <div v-if="search" class="text-xs text-slate-500">
        Pronađeno:
        <template v-if="tab === 'software'">
          {{ filteredSoftware.length }} od {{ software.length }}
        </template>

        <template v-else-if="tab === 'drivers'">
          {{ filteredDrivers.length }} od {{ drivers.length }}
        </template>

        <template v-else-if="tab === 'services'">
          {{ filteredServices.length }} od {{ services.length }}
        </template>

        <template v-else-if="tab === 'updates'">
          {{ filteredUpdates.length }} od {{ updates.length }}
        </template>

        <template v-else> {{ filteredPrinters.length }} od {{ printers.length }} </template>
      </div>

      <div v-if="tabLoading[tab]" class="text-slate-600">Učitavanje inventara…</div>

      <div
        v-else-if="tabError[tab]"
        class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700"
      >
        {{ tabError[tab] }}
      </div>

      <div v-else>
        <div v-if="tab === 'software'">
          <div v-if="filteredSoftware.length === 0" class="text-slate-500">
            Nema podataka o instaliranom softveru.
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="item in filteredSoftware"
              :key="item.id"
              class="rounded-lg border bg-white p-3"
              :class="item.is_flagged ? 'border-red-200 bg-red-50/40' : ''"
            >
              <div class="flex items-center gap-2">
                <div class="font-medium text-slate-800">
                  {{ item.display_name || 'Nepoznat program' }}
                </div>
                <span
                  v-if="item.is_flagged"
                  class="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700"
                >
                  ⚠ Neželjen
                </span>
              </div>

              <div class="mt-1 text-sm text-slate-600">Verzija: {{ item.display_version || '—' }}</div>

              <div class="text-sm text-slate-600">Izdavač: {{ item.publisher || '—' }}</div>

              <div class="text-sm text-slate-600">Instalirano: {{ fmtDate(item.install_date) }}</div>

              <div class="mt-1 text-xs text-slate-400">Inventar: {{ fmtDate(item.inventory_date) }}</div>
            </div>
          </div>
        </div>

        <div v-else-if="tab === 'drivers'">
          <div v-if="filteredDrivers.length === 0" class="text-slate-500">
            Nema podataka o drajverima.
          </div>

          <div v-else class="space-y-2">
            <div v-for="item in filteredDrivers" :key="item.id" class="rounded-lg border bg-white p-3">
              <div class="font-medium text-slate-800">{{ item.device_name || 'Nepoznat uređaj' }}</div>

              <div class="mt-1 text-sm text-slate-600">Verzija: {{ item.driver_version || '—' }}</div>

              <div class="text-sm text-slate-600">Datum drajvera: {{ fmtDate(item.driver_date) }}</div>

              <div class="text-sm text-slate-600">Proizvođač: {{ item.manufacturer || '—' }}</div>

              <div class="text-sm text-slate-600">Provider: {{ item.driver_provider_name || '—' }}</div>

              <div class="mt-1 text-xs text-slate-400">Inventar: {{ fmtDate(item.inventory_date) }}</div>
            </div>
          </div>
        </div>

        <div v-else-if="tab === 'services'">
          <div v-if="filteredServices.length === 0" class="text-slate-500">
            Nema podataka o servisima.
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="item in filteredServices"
              :key="item.id"
              class="rounded-lg border bg-white p-3"
              :class="item.is_flagged ? 'border-red-200 bg-red-50/40' : ''"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="flex items-center gap-2">
                    <div class="font-medium text-slate-800">
                      {{ item.display_name || item.name || 'Nepoznat servis' }}
                    </div>
                    <span
                      v-if="item.is_flagged"
                      class="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700"
                    >
                      ⚠ Neželjen
                    </span>
                  </div>

                  <div class="text-xs text-slate-500">{{ item.name || '—' }}</div>
                </div>

                <span
                  class="rounded-full border px-2 py-0.5 text-xs"
                  :class="
                    item.state === 'Running'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-50 text-slate-600'
                  "
                >
                  {{ item.state || 'Nepoznato' }}
                </span>
              </div>

              <div class="mt-2 text-sm text-slate-600">Start mode: {{ item.start_mode || '—' }}</div>

              <div class="text-sm text-slate-600">Korisnik: {{ item.start_name || '—' }}</div>

              <div class="mt-1 break-all text-xs text-slate-500">{{ item.path_name || '—' }}</div>

              <div class="mt-1 text-xs text-slate-400">Inventar: {{ fmtDate(item.inventory_date) }}</div>
            </div>
          </div>
        </div>

        <div v-else-if="tab === 'updates'">
          <div v-if="filteredUpdates.length === 0" class="text-slate-500">
            Nema podataka o Windows ažuriranjima.
          </div>

          <div v-else class="space-y-2">
            <div v-for="item in filteredUpdates" :key="item.id" class="rounded-lg border bg-white p-3">
              <div class="flex items-start justify-between gap-3">
                <div class="font-medium text-slate-800">{{ item.hotfix_id || 'Nepoznat KB' }}</div>

                <div class="text-xs text-slate-500">{{ fmtDate(item.installed_on) }}</div>
              </div>

              <div class="mt-1 text-sm text-slate-600">{{ item.description || '—' }}</div>

              <div class="mt-1 text-sm text-slate-600">Instalirao: {{ item.installed_by || '—' }}</div>

              <div class="mt-1 text-xs text-slate-400">Inventar: {{ fmtDate(item.inventory_date) }}</div>
            </div>
          </div>
        </div>

        <div v-else-if="tab === 'printers'">
          <div v-if="filteredPrinters.length === 0" class="text-slate-500">
            Nema podataka o štampačima.
          </div>

          <div v-else class="space-y-2">
            <div v-for="item in filteredPrinters" :key="item.id" class="rounded-lg border bg-white p-3">
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-2">
                  <div class="font-medium text-slate-800">{{ item.name || 'Nepoznat štampač' }}</div>
                  <span
                    v-if="item.is_default"
                    class="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                  >
                    Podrazumevani
                  </span>
                </div>

                <span
                  class="rounded-full border px-2 py-0.5 text-xs"
                  :class="
                    item.status === 'OK' || item.status === 'Idle' || item.status === 'Unknown'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  "
                >
                  {{ item.status || 'Nepoznato' }}
                </span>
              </div>

              <div class="mt-1 text-sm text-slate-600">Drajver: {{ item.driver_name || '—' }}</div>

              <div class="text-sm text-slate-600">Port: {{ item.port_name || '—' }}</div>

              <div class="mt-1 text-xs text-slate-400">Inventar: {{ fmtDate(item.inventory_date) }}</div>
            </div>
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
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { downloadFromResponse } from '@/utils/download.js'
import { fmtDate } from '@/utils/format.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import { useToast } from '@/composables/useToast.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const route = useRoute()
const router = useRouter()
const { toast, showToast } = useToast()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()

const entry = ref(null)
const entryLoading = ref(false)
const entryError = ref('')

const TAB_NAMES = ['software', 'drivers', 'services', 'updates', 'printers']

const software = ref([])
const drivers = ref([])
const services = ref([])
const updates = ref([])
const printers = ref([])
const exportingPdf = ref(false)

const loaded = ref({ software: false, drivers: false, services: false, updates: false, printers: false })
const tabLoading = ref({ software: false, drivers: false, services: false, updates: false, printers: false })
const tabError = ref({ software: '', drivers: '', services: '', updates: '', printers: '' })

const { search, tab } = usePaginatedRoute({
  fields: {
    search: { type: 'string', default: '', omitIfEmpty: true },
    tab: { type: 'string', default: 'software', oneOf: TAB_NAMES },
  },
  useReplace: true,
})

function goBack() {
  router.push('/')
}

const hasAnyPdsuData = computed(() =>
  software.value.length > 0 ||
  drivers.value.length > 0 ||
  services.value.length > 0 ||
  updates.value.length > 0 ||
  printers.value.length > 0
)

async function exportPdf() {
  exportingPdf.value = true
  try {
    const filenameSafe = (entry.value?.computer_name || entry.value?.ip || route.params.id).replace(/[^\w-]+/g, '_')
    await downloadFromResponse(
      await fetchWithAuth(`/api/protected/pdsu/${route.params.id}/export-pdf`),
      `NetDesk_PDSU_${filenameSafe}.pdf`,
    )
  } catch (err) {
    console.error('Greška pri izvozu PDF-a:', err)
    showToast('Greška pri izvozu PDF-a.', { prefix: '❌ ', duration: 3000 })
  } finally {
    exportingPdf.value = false
  }
}

async function clearPdsu() {
  const ok = await askConfirm(
    'Da li želiš da obrišeš SVE PDSU podatke (softver, drajveri, servisi, ažuriranja, štampači) za ovaj računar? Ova akcija se ne može poništiti.',
    { title: 'Brisanje PDSU podataka' },
  )
  if (!ok) return

  try {
    const res = await fetchWithAuth(`/api/protected/pdsu/${route.params.id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await parseError(res, `HTTP ${res.status}`))
    software.value = []
    drivers.value = []
    services.value = []
    updates.value = []
    printers.value = []
    showToast('PDSU podaci obrisani.')
  } catch (err) {
    console.error('Greška pri brisanju PDSU podataka:', err)
    showToast('Greška pri brisanju PDSU podataka.', { prefix: '❌ ', duration: 3000 })
  }
}

async function loadTabData(name) {
  if (loaded.value[name]) return

  tabLoading.value[name] = true
  tabError.value[name] = ''

  try {
    const res = await fetchWithAuth(`/api/protected/pdsu/${route.params.id}/${name}`)

    if (!res.ok) {
      throw new Error(await parseError(res, `Greška pri učitavanju inventara. HTTP ${res.status}`))
    }

    const data = await res.json()
    const rows = Array.isArray(data) ? data : []

    if (name === 'software') software.value = rows
    else if (name === 'drivers') drivers.value = rows
    else if (name === 'services') services.value = rows
    else if (name === 'updates') updates.value = rows
    else if (name === 'printers') printers.value = rows

    loaded.value[name] = true
  } catch (err) {
    console.error('Greška pri učitavanju inventara:', err)
    tabError.value[name] = err?.message || 'Neuspešno učitavanje inventara.'
  } finally {
    tabLoading.value[name] = false
  }
}

function selectTab(name) {
  tab.value = name
  search.value = ''
  loadTabData(name)
}

const filteredSoftware = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return software.value
  return software.value.filter((item) =>
    [item.display_name, item.display_version, item.publisher, item.install_date].some((value) =>
      String(value ?? '').toLowerCase().includes(q)
    )
  )
})

const filteredDrivers = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return drivers.value
  return drivers.value.filter((item) =>
    [item.device_name, item.driver_version, item.driver_date, item.manufacturer, item.driver_provider_name].some(
      (value) => String(value ?? '').toLowerCase().includes(q)
    )
  )
})

const filteredServices = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return services.value
  return services.value.filter((item) =>
    [item.name, item.display_name, item.state, item.start_mode, item.start_name, item.path_name].some(
      (value) => String(value ?? '').toLowerCase().includes(q)
    )
  )
})

const filteredUpdates = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return updates.value
  return updates.value.filter((item) =>
    [item.description, item.hotfix_id, item.installed_on, item.installed_by].some((value) =>
      String(value ?? '').toLowerCase().includes(q)
    )
  )
})

const filteredPrinters = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return printers.value
  return printers.value.filter((item) =>
    [item.name, item.driver_name, item.port_name, item.status].some((value) =>
      String(value ?? '').toLowerCase().includes(q)
    )
  )
})

async function loadEntry() {
  entryLoading.value = true
  entryError.value = ''
  try {
    const res = await fetchWithAuth(`/api/protected/pdsu/${route.params.id}`)
    if (!res.ok) {
      entryError.value = 'Računar nije pronađen'
      return
    }
    entry.value = await res.json()
  } catch (err) {
    console.error(err)
    entryError.value = 'Neuspešno učitan računar'
  } finally {
    entryLoading.value = false
  }
}

onMounted(async () => {
  await loadEntry()
  if (!entryError.value) {
    TAB_NAMES.forEach(loadTabData)
  }
})
</script>
