<template>
  <div class="w-full max-w-3xl mx-auto">
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
      <h1 class="text-2xl font-bold text-ink wrap-break-word" style="font-family: var(--font-display)">
        {{ t('ipPdsu.title', { name: entry?.computer_name || entry?.ip || t('ipPdsu.unknown') }) }}
      </h1>
      <div class="flex flex-wrap items-center gap-2">
        <RouterLink
          v-if="entry?.ip && entry?.site"
          :to="{ path: '/', query: { search: entry.ip, site: entry.site } }"
          class="text-sm text-accent hover:underline"
        >
          {{ t('ipPdsu.goHome') }}
        </RouterLink>
        <AppButton
          v-if="exceptionsTotal"
          variant="secondary"
          @click="exceptionsOpen = !exceptionsOpen"
        >
          {{ t('ipPdsu.exceptionsCount', { count: exceptionsTotal }) }}
        </AppButton>
        <AppButton
          v-if="hasAnyPdsuData"
          variant="secondary"
          :disabled="exportingPdf"
          @click="exportPdf"
        >
          {{ exportingPdf ? t('ipPdsu.exporting') : t('ipPdsu.exportPdf') }}
        </AppButton>
        <AppButton
          v-if="hasAnyPdsuData && isAdmin"
          variant="danger"
          @click="clearPdsu"
        >
          {{ t('ipPdsu.clearPdsu') }}
        </AppButton>
        <AppButton variant="neutral" @click="goBack">{{ t('ipPdsu.back') }}</AppButton>
      </div>
    </div>

    <div v-if="entryLoading" class="text-ink-secondary">{{ t('ipPdsu.loading') }}</div>
    <div v-else-if="entryError" class="text-bad">{{ entryError }}</div>

    <div v-else class="space-y-4">
      <div v-if="exceptionsOpen && exceptionsTotal" class="rounded-lg border border-info/30 bg-info-subtle p-3 space-y-2">
        <div class="text-sm font-medium text-ink">
          {{ t('ipPdsu.exceptionsTitle') }}
        </div>
        <p class="text-xs text-ink-muted">
          {{ t('ipPdsu.exceptionsHint') }}
        </p>
        <div class="space-y-1">
          <div
            v-for="item in exceptions.software"
            :key="`software-${item.id}`"
            class="flex items-center justify-between gap-2 text-sm bg-surface rounded px-2 py-1"
          >
            <span>{{ t('ipPdsu.softwareLabel') }} {{ item.displayName }}</span>
            <button type="button" class="text-xs text-bad hover:underline" @click="removeException('software', item.id)">
              {{ t('ipPdsu.removeException') }}
            </button>
          </div>
          <div
            v-for="item in exceptions.services"
            :key="`services-${item.id}`"
            class="flex items-center justify-between gap-2 text-sm bg-surface rounded px-2 py-1"
          >
            <span>{{ t('ipPdsu.servicesLabel') }} {{ item.displayName || item.name }}</span>
            <button type="button" class="text-xs text-bad hover:underline" @click="removeException('services', item.id)">
              {{ t('ipPdsu.removeException') }}
            </button>
          </div>
          <div
            v-for="item in exceptions.drivers"
            :key="`drivers-${item.id}`"
            class="flex items-center justify-between gap-2 text-sm bg-surface rounded px-2 py-1"
          >
            <span>{{ t('ipPdsu.driversLabel') }} {{ item.deviceName }}</span>
            <button type="button" class="text-xs text-bad hover:underline" @click="removeException('drivers', item.id)">
              {{ t('ipPdsu.removeException') }}
            </button>
          </div>
        </div>
      </div>

      <div class="flex flex-nowrap gap-2 overflow-x-auto border-b border-line pb-3 no-scrollbar sm:flex-wrap sm:overflow-visible">
        <button
          type="button"
          @click="selectTab('software')"
          class="shrink-0 px-3 py-2 rounded-md text-sm font-medium transition"
          :class="
            tab === 'software'
              ? 'bg-accent text-white'
              : 'bg-surface-sunken text-ink-secondary hover:bg-line'
          "
        >
          {{ t('ipPdsu.tabSoftware') }}
          <span v-if="loaded.software" class="ml-1"> ({{ software.length }}) </span>
        </button>

        <button
          type="button"
          @click="selectTab('drivers')"
          class="shrink-0 px-3 py-2 rounded-md text-sm font-medium transition"
          :class="
            tab === 'drivers'
              ? 'bg-accent text-white'
              : 'bg-surface-sunken text-ink-secondary hover:bg-line'
          "
        >
          {{ t('ipPdsu.tabDrivers') }}
          <span v-if="loaded.drivers" class="ml-1"> ({{ drivers.length }}) </span>
        </button>

        <button
          type="button"
          @click="selectTab('services')"
          class="shrink-0 px-3 py-2 rounded-md text-sm font-medium transition"
          :class="
            tab === 'services'
              ? 'bg-accent text-white'
              : 'bg-surface-sunken text-ink-secondary hover:bg-line'
          "
        >
          {{ t('ipPdsu.tabServices') }}
          <span v-if="loaded.services" class="ml-1"> ({{ services.length }}) </span>
        </button>

        <button
          type="button"
          @click="selectTab('updates')"
          class="shrink-0 px-3 py-2 rounded-md text-sm font-medium transition"
          :class="
            tab === 'updates'
              ? 'bg-accent text-white'
              : 'bg-surface-sunken text-ink-secondary hover:bg-line'
          "
        >
          {{ t('ipPdsu.tabUpdates') }}
          <span v-if="loaded.updates" class="ml-1"> ({{ updates.length }}) </span>
        </button>

        <button
          type="button"
          @click="selectTab('printers')"
          class="shrink-0 px-3 py-2 rounded-md text-sm font-medium transition"
          :class="
            tab === 'printers'
              ? 'bg-accent text-white'
              : 'bg-surface-sunken text-ink-secondary hover:bg-line'
          "
        >
          {{ t('ipPdsu.tabPrinters') }}
          <span v-if="loaded.printers" class="ml-1"> ({{ printers.length }}) </span>
        </button>
      </div>

      <div class="relative">
        <input
          v-model="search"
          type="text"
          :placeholder="
            tab === 'software'
              ? t('ipPdsu.searchSoftwarePlaceholder')
              : tab === 'drivers'
              ? t('ipPdsu.searchDriversPlaceholder')
              : tab === 'services'
              ? t('ipPdsu.searchServicesPlaceholder')
              : tab === 'updates'
              ? t('ipPdsu.searchUpdatesPlaceholder')
              : t('ipPdsu.searchPrintersPlaceholder')
          "
          class="app-input w-full pr-10"
        />

        <button
          v-if="search"
          type="button"
          @click="search = ''"
          class="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
          :title="t('ipPdsu.clearSearch')"
        >
          <NavIcon name="x" />
        </button>
      </div>

      <label
        v-if="tab === 'software' || tab === 'drivers' || tab === 'services'"
        class="inline-flex items-center gap-1.5 text-sm text-ink-secondary"
      >
        <input type="checkbox" :checked="onlyFlagged === 'true'" @change="onlyFlagged = onlyFlagged === 'true' ? '' : 'true'" />
        {{ t('ipPdsu.onlyFlagged') }}
      </label>

      <div v-if="search" class="text-xs text-ink-muted">
        {{ t('ipPdsu.foundLabel') }}
        <template v-if="tab === 'software'">
          {{ filteredSoftware.length }} {{ t('ipPdsu.ofCount', { total: software.length }) }}
        </template>

        <template v-else-if="tab === 'drivers'">
          {{ filteredDrivers.length }} {{ t('ipPdsu.ofCount', { total: drivers.length }) }}
        </template>

        <template v-else-if="tab === 'services'">
          {{ filteredServices.length }} {{ t('ipPdsu.ofCount', { total: services.length }) }}
        </template>

        <template v-else-if="tab === 'updates'">
          {{ filteredUpdates.length }} {{ t('ipPdsu.ofCount', { total: updates.length }) }}
        </template>

        <template v-else> {{ filteredPrinters.length }} {{ t('ipPdsu.ofCount', { total: printers.length }) }} </template>
      </div>

      <div v-if="tabLoading[tab]" class="text-ink-secondary">{{ t('ipPdsu.loadingInventory') }}</div>

      <div
        v-else-if="tabError[tab]"
        class="rounded-lg border border-bad/40 bg-bad-subtle px-4 py-3 text-bad"
      >
        {{ tabError[tab] }}
      </div>

      <div v-else>
        <div v-if="tab === 'software'">
          <div v-if="filteredSoftware.length === 0" class="text-ink-muted">
            {{ t('ipPdsu.noSoftwareData') }}
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="item in filteredSoftware"
              :key="item.id"
              class="rounded-lg border border-line bg-surface p-3"
              :class="item.is_flagged ? 'border-bad/30 bg-bad-subtle' : ''"
            >
              <div class="flex items-center gap-2">
                <div class="font-medium text-ink">
                  {{ item.display_name || t('ipPdsu.unknownProgram') }}
                </div>
                <span
                  v-if="item.is_flagged"
                  class="inline-flex items-center gap-1 rounded-full border border-bad/40 bg-bad-subtle px-2 py-0.5 text-xs text-bad"
                >
                  <NavIcon name="alert-triangle" /> {{ t('ipPdsu.flagged') }}
                </span>
                <button
                  v-if="item.is_flagged"
                  type="button"
                  @click="addException('software', item.matchedFlaggedId)"
                  class="text-xs text-accent hover:underline"
                >
                  {{ t('ipPdsu.notFlaggedHere') }}
                </button>
              </div>

              <div class="mt-1 text-sm text-ink-secondary">{{ t('ipPdsu.versionLabel') }} {{ item.display_version || '—' }}</div>

              <div class="text-sm text-ink-secondary">{{ t('ipPdsu.publisherLabel') }} {{ item.publisher || '—' }}</div>

              <div class="text-sm text-ink-secondary">{{ t('ipPdsu.installedLabel') }} {{ fmtDateLoc(item.install_date) }}</div>

              <div class="mt-1 text-xs text-ink-muted font-mono">{{ t('ipPdsu.inventoryLabel') }} {{ fmtDateLoc(item.inventory_date) }}</div>
            </div>
          </div>
        </div>

        <div v-else-if="tab === 'drivers'">
          <div v-if="filteredDrivers.length === 0" class="text-ink-muted">
            {{ t('ipPdsu.noDriversData') }}
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="item in filteredDrivers"
              :key="item.id"
              class="rounded-lg border border-line bg-surface p-3"
              :class="item.is_flagged ? 'border-bad/30 bg-bad-subtle' : ''"
            >
              <div class="flex items-center gap-2">
                <div class="font-medium text-ink">{{ item.device_name || t('ipPdsu.unknownDevice') }}</div>
                <span
                  v-if="item.is_flagged"
                  class="inline-flex items-center gap-1 rounded-full border border-bad/40 bg-bad-subtle px-2 py-0.5 text-xs text-bad"
                >
                  <NavIcon name="alert-triangle" /> {{ t('ipPdsu.flagged') }}
                </span>
                <button
                  v-if="item.is_flagged"
                  type="button"
                  @click="addException('drivers', item.matchedFlaggedId)"
                  class="text-xs text-accent hover:underline"
                >
                  {{ t('ipPdsu.notFlaggedHere') }}
                </button>
              </div>

              <div class="mt-1 text-sm text-ink-secondary">{{ t('ipPdsu.versionLabel') }} {{ item.driver_version || '—' }}</div>

              <div class="text-sm text-ink-secondary">{{ t('ipPdsu.driverDateLabel') }} {{ fmtDateLoc(item.driver_date) }}</div>

              <div class="text-sm text-ink-secondary">{{ t('ipPdsu.manufacturerLabel') }} {{ item.manufacturer || '—' }}</div>

              <div class="text-sm text-ink-secondary">{{ t('ipPdsu.providerLabel') }} {{ item.driver_provider_name || '—' }}</div>

              <div class="mt-1 text-xs text-ink-muted font-mono">{{ t('ipPdsu.inventoryLabel') }} {{ fmtDateLoc(item.inventory_date) }}</div>
            </div>
          </div>
        </div>

        <div v-else-if="tab === 'services'">
          <div v-if="filteredServices.length === 0" class="text-ink-muted">
            {{ t('ipPdsu.noServicesData') }}
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="item in filteredServices"
              :key="item.id"
              class="rounded-lg border border-line bg-surface p-3"
              :class="item.is_flagged ? 'border-bad/30 bg-bad-subtle' : ''"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="flex items-center gap-2">
                    <div class="font-medium text-ink">
                      {{ item.display_name || item.name || t('ipPdsu.unknownService') }}
                    </div>
                    <span
                      v-if="item.is_flagged"
                      class="inline-flex items-center gap-1 rounded-full border border-bad/40 bg-bad-subtle px-2 py-0.5 text-xs text-bad"
                    >
                      <NavIcon name="alert-triangle" /> {{ t('ipPdsu.flagged') }}
                    </span>
                    <button
                      v-if="item.is_flagged"
                      type="button"
                      @click="addException('services', item.matchedFlaggedId)"
                      class="text-xs text-accent hover:underline"
                    >
                      {{ t('ipPdsu.notFlaggedHere') }}
                    </button>
                  </div>

                  <div class="text-xs text-ink-muted">{{ item.name || '—' }}</div>
                </div>

                <span
                  class="rounded-full border px-2 py-0.5 text-xs"
                  :class="
                    item.state === 'Running'
                      ? 'border-good/40 bg-good-subtle text-good'
                      : 'border-line bg-surface-sunken text-ink-secondary'
                  "
                >
                  {{ item.state || t('pdsu.stateUnknown') }}
                </span>
              </div>

              <div class="mt-2 text-sm text-ink-secondary">{{ t('ipPdsu.startModeLabel') }} {{ item.start_mode || '—' }}</div>

              <div class="text-sm text-ink-secondary">{{ t('ipPdsu.userLabel') }} {{ item.start_name || '—' }}</div>

              <div class="mt-1 break-all text-xs text-ink-muted font-mono">{{ item.path_name || '—' }}</div>

              <div class="mt-1 text-xs text-ink-muted font-mono">{{ t('ipPdsu.inventoryLabel') }} {{ fmtDateLoc(item.inventory_date) }}</div>
            </div>
          </div>
        </div>

        <div v-else-if="tab === 'updates'">
          <div v-if="filteredUpdates.length === 0" class="text-ink-muted">
            {{ t('ipPdsu.noUpdatesData') }}
          </div>

          <div v-else class="space-y-2">
            <div v-for="item in filteredUpdates" :key="item.id" class="rounded-lg border border-line bg-surface p-3">
              <div class="flex items-start justify-between gap-3">
                <div class="font-medium text-ink">{{ item.hotfix_id || t('ipPdsu.unknownKb') }}</div>

                <div class="text-xs text-ink-muted">{{ fmtDateLoc(item.installed_on) }}</div>
              </div>

              <div class="mt-1 text-sm text-ink-secondary">{{ item.description || '—' }}</div>

              <div class="mt-1 text-sm text-ink-secondary">{{ t('ipPdsu.installedByLabel') }} {{ item.installed_by || '—' }}</div>

              <div class="mt-1 text-xs text-ink-muted font-mono">{{ t('ipPdsu.inventoryLabel') }} {{ fmtDateLoc(item.inventory_date) }}</div>
            </div>
          </div>
        </div>

        <div v-else-if="tab === 'printers'">
          <div v-if="filteredPrinters.length === 0" class="text-ink-muted">
            {{ t('ipPdsu.noPrintersData') }}
          </div>

          <div v-else class="space-y-2">
            <div v-for="item in filteredPrinters" :key="item.id" class="rounded-lg border border-line bg-surface p-3">
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-2">
                  <div class="font-medium text-ink">{{ item.name || t('ipPdsu.unknownPrinter') }}</div>
                  <span
                    v-if="item.is_default"
                    class="rounded-full border border-info/40 bg-info-subtle px-2 py-0.5 text-xs text-info"
                  >
                    {{ t('ipPdsu.defaultLabel') }}
                  </span>
                </div>

                <span
                  class="rounded-full border px-2 py-0.5 text-xs"
                  :class="
                    item.status === 'OK' || item.status === 'Idle' || item.status === 'Unknown'
                      ? 'border-good/40 bg-good-subtle text-good'
                      : 'border-bad/40 bg-bad-subtle text-bad'
                  "
                >
                  {{ item.status || t('pdsu.stateUnknown') }}
                </span>
              </div>

              <div class="mt-1 text-sm text-ink-secondary">{{ t('ipPdsu.driverLabel') }} {{ item.driver_name || '—' }}</div>

              <div class="text-sm text-ink-secondary">{{ t('ipPdsu.portLabel') }} {{ item.port_name || '—' }}</div>

              <div class="mt-1 text-xs text-ink-muted font-mono">{{ t('ipPdsu.inventoryLabel') }} {{ fmtDateLoc(item.inventory_date) }}</div>
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
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { downloadFromResponse } from '@/utils/download.js'
import { fmtDate } from '@/utils/format.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import { useToast } from '@/composables/useToast.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import NavIcon from '@/components/NavIcon.vue'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const { toast, showToast } = useToast()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()
const { isAdmin } = useCurrentUser()

const fmtDateLoc = (d) => fmtDate(d, locale.value === 'en' ? 'en-US' : 'sr-RS')

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

const { search, tab, onlyFlagged } = usePaginatedRoute({
  fields: {
    search: { type: 'string', default: '', omitIfEmpty: true },
    tab: { type: 'string', default: 'software', oneOf: TAB_NAMES },
    onlyFlagged: { type: 'string', default: '', omitIfEmpty: true, oneOf: ['', 'true'] },
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
    showToast(t('ipPdsu.errorExportPdf'), { kind: 'error', duration: 3000 })
  } finally {
    exportingPdf.value = false
  }
}

async function clearPdsu() {
  const ok = await askConfirm(
    t('ipPdsu.confirmClearPdsuMessage'),
    { title: t('ipPdsu.confirmClearPdsuTitle') },
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
    showToast(t('ipPdsu.pdsuCleared'))
  } catch (err) {
    console.error('Greška pri brisanju PDSU podataka:', err)
    showToast(t('ipPdsu.errorClearPdsu'), { kind: 'error', duration: 3000 })
  }
}

// "Nije neželjen na ovom računaru" - dodaje izuzetak za TAČNO pravilo koje
// trenutno pogađa (item.matchedFlaggedId), ne briše globalni flag. Lokalno
// ažurira dati red umesto ponovnog fetch-a cele liste - ako neko DRUGO
// pravilo i dalje pogađa isti red, backend bi ionako vratio is_flagged=true
// opet (vidi pdsu.service.js's mapFlaggableRow), pa je ipak najjednostavnije
// i najtačnije samo ponovo učitati taj tab.
async function addException(kind, flaggedId) {
  if (!flaggedId) return
  try {
    const res = await fetchWithAuth(
      `/api/protected/pdsu/${route.params.id}/flagged-exceptions/${kind}/${flaggedId}`,
      { method: 'POST' },
    )
    if (!res.ok) throw new Error(await parseError(res, t('ipPdsu.errorAddException')))
    showToast(t('ipPdsu.exceptionAdded'))
    loaded.value[kind] = false
    await loadTabData(kind)
    await loadExceptions()
  } catch (err) {
    console.error('Greška pri dodavanju izuzetka:', err)
    showToast(err?.message || t('ipPdsu.errorAddException'), { kind: 'error', duration: 3000 })
  }
}

const exceptions = ref({ software: [], services: [], drivers: [] })
const exceptionsOpen = ref(false)

async function loadExceptions() {
  try {
    const res = await fetchWithAuth(`/api/protected/pdsu/${route.params.id}/flagged-exceptions`)
    if (!res.ok) throw new Error()
    exceptions.value = await res.json()
  } catch (err) {
    console.error('Greška pri učitavanju izuzetaka:', err)
  }
}

async function removeException(kind, flaggedId) {
  try {
    const res = await fetchWithAuth(
      `/api/protected/pdsu/${route.params.id}/flagged-exceptions/${kind}/${flaggedId}`,
      { method: 'DELETE' },
    )
    if (!res.ok) throw new Error(await parseError(res, t('ipPdsu.errorRemoveException')))
    showToast(t('ipPdsu.exceptionRemoved'))
    await loadExceptions()
    loaded.value[kind] = false
    if (tab.value === kind) await loadTabData(kind)
  } catch (err) {
    console.error('Greška pri uklanjanju izuzetka:', err)
    showToast(err?.message || t('ipPdsu.errorRemoveException'), { kind: 'error', duration: 3000 })
  }
}

const exceptionsTotal = computed(
  () => exceptions.value.software.length + exceptions.value.services.length + exceptions.value.drivers.length,
)

async function loadTabData(name) {
  if (loaded.value[name]) return

  tabLoading.value[name] = true
  tabError.value[name] = ''

  try {
    const res = await fetchWithAuth(`/api/protected/pdsu/${route.params.id}/${name}`)

    if (!res.ok) {
      throw new Error(await parseError(res, t('ipPdsu.errorLoadInventory', { status: res.status })))
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
    tabError.value[name] = err?.message || t('ipPdsu.errorLoadInventoryFallback')
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
  let list = onlyFlagged.value ? software.value.filter((item) => item.is_flagged) : software.value
  const q = search.value.trim().toLowerCase()
  if (!q) return list
  return list.filter((item) =>
    [item.display_name, item.display_version, item.publisher, item.install_date].some((value) =>
      String(value ?? '').toLowerCase().includes(q)
    )
  )
})

const filteredDrivers = computed(() => {
  let list = onlyFlagged.value ? drivers.value.filter((item) => item.is_flagged) : drivers.value
  const q = search.value.trim().toLowerCase()
  if (!q) return list
  return list.filter((item) =>
    [item.device_name, item.driver_version, item.driver_date, item.manufacturer, item.driver_provider_name].some(
      (value) => String(value ?? '').toLowerCase().includes(q)
    )
  )
})

const filteredServices = computed(() => {
  let list = onlyFlagged.value ? services.value.filter((item) => item.is_flagged) : services.value
  const q = search.value.trim().toLowerCase()
  if (!q) return list
  return list.filter((item) =>
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
      entryError.value = t('ipPdsu.computerNotFound')
      return
    }
    entry.value = await res.json()
  } catch (err) {
    console.error(err)
    entryError.value = t('ipPdsu.errorLoadComputer')
  } finally {
    entryLoading.value = false
  }
}

onMounted(async () => {
  await loadEntry()
  if (!entryError.value) {
    TAB_NAMES.forEach(loadTabData)
    loadExceptions()
  }
})
</script>
