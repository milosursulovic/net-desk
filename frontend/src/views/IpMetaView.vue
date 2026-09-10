<template>
  <div class="w-full max-w-3xl mx-auto">
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
      <h1 class="text-2xl font-bold text-ink wrap-break-word" style="font-family: var(--font-display)">
        {{ t('ipMeta.title', { name: entry?.computerName || entry?.ip || t('ipMeta.unknown') }) }}
      </h1>
      <div class="flex flex-wrap items-center gap-2">
        <AppButton v-if="meta" variant="secondary" :disabled="exportingPdf" @click="exportPdf">
          {{ exportingPdf ? t('ipMeta.exporting') : t('ipMeta.exportPdf') }}
        </AppButton>
        <AppButton variant="secondary" :disabled="waking" @click="wakeComputer">
          {{ waking ? t('ipMeta.waking') : t('ipMeta.wakeComputer') }}
        </AppButton>
        <AppButton v-if="meta && isAdmin" variant="danger" @click="clearMetadata">
          {{ t('ipMeta.clearMetadata') }}
        </AppButton>
        <AppButton
          v-if="entry"
          variant="secondary"
          :to="{ path: '/', query: { search: entry.ip, site: entry.site } }"
        >
          {{ t('ipMeta.goHome') }}
        </AppButton>
        <AppButton variant="neutral" @click="goBack">{{ t('ipMeta.back') }}</AppButton>
      </div>
    </div>

    <div v-if="entryLoading" class="text-ink-secondary">{{ t('ipMeta.loading') }}</div>
    <div v-else-if="entryError" class="text-bad">{{ entryError }}</div>

    <template v-else>
      <section class="rounded-lg border border-line bg-surface p-4 mb-6">
        <h2 class="font-semibold text-ink mb-2">{{ t('ipMeta.uptimeHistoryTitle') }}</h2>

        <div v-if="uptimeLoading" class="text-sm text-ink-secondary">{{ t('ipMeta.loading') }}</div>
        <div v-else-if="uptimeError" class="text-sm text-bad">{{ uptimeError }}</div>
        <div v-else-if="!uptimePeriods.length" class="text-sm text-ink-muted">
          {{ t('ipMeta.noUptimeHistory') }}
        </div>

        <template v-else>
          <UptimeTimeline :periods="uptimePeriods" class="mb-4" />

          <details class="group">
            <summary class="cursor-pointer text-xs text-ink-muted hover:text-ink select-none">
              {{ t('ipMeta.detailedPeriodsList', { count: uptimePeriods.length }) }}
            </summary>
            <div class="mt-2 space-y-2">
          <div
            v-for="(period, idx) in uptimePeriods"
            :key="idx"
            class="flex items-center justify-between gap-3 border border-line rounded-lg p-3 bg-surface text-sm"
          >
            <div class="flex items-center gap-2">
              <span
                class="inline-block w-2 h-2 rounded-full"
                :class="period.status === 'online' ? 'bg-good' : 'bg-bad'"
              />
              <span class="font-medium text-ink">{{ period.status === 'online' ? t('common.online') : t('common.offline') }}</span>
            </div>

            <div class="text-ink-muted text-right font-mono">
              <div>{{ formatDuration(period.from, period.to) }}</div>
              <div class="text-xs">
                {{ fmtDateLoc(period.from) }} — {{ period.to ? fmtDateLoc(period.to) : t('ipMeta.inProgress') }}
              </div>
            </div>
          </div>
            </div>
          </details>
        </template>
      </section>

      <div v-if="metaLoading" class="text-ink-secondary">{{ t('ipMeta.loadingMetadata') }}</div>
      <div v-else-if="metaError" class="text-bad">{{ metaError }}</div>
      <div v-else-if="!meta" class="text-ink-secondary">{{ t('ipMeta.noMetadataForIp') }}</div>

      <div v-else class="space-y-6">
        <div class="rounded-lg border border-line bg-surface-sunken p-4">
          <div class="flex flex-col gap-1">
            <div class="text-ink"><span class="font-semibold">{{ t('ipMeta.computerLabel') }}</span> {{ safe(meta.ComputerName) }}</div>
            <div class="text-ink"><span class="font-semibold">{{ t('ipMeta.userLabel') }}</span> {{ safe(meta.UserName) }}</div>
            <div class="text-ink">
              <span class="font-semibold">{{ t('ipMeta.collectedLabel') }}</span>
              {{ fmtDateLoc(meta.CollectedAt) }}
            </div>
            <div class="text-xs text-ink-muted mt-1 font-mono">
              {{ t('ipMeta.lastUpdateLabel', { date: fmtDateLoc(meta.updatedAt), created: fmtDateLoc(meta.createdAt) }) }}
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <section class="rounded-lg border border-line bg-surface p-4">
            <h4 class="font-semibold text-ink mb-2">{{ t('ipMeta.osSection') }}</h4>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div class="text-ink-muted">{{ t('ipMeta.caption') }}</div>
              <div>{{ safe(meta.OS?.Caption) }}</div>
              <div class="text-ink-muted">{{ t('ipMeta.version') }}</div>
              <div>{{ safe(meta.OS?.Version) }}</div>
              <div class="text-ink-muted">{{ t('ipMeta.build') }}</div>
              <div>{{ safe(meta.OS?.Build) }}</div>
              <div class="text-ink-muted">{{ t('ipMeta.installDate') }}</div>
              <div>{{ fmtDateLoc(meta.OS?.InstallDate) }}</div>
            </div>
          </section>

          <section class="rounded-lg border border-line bg-surface p-4">
            <h4 class="font-semibold text-ink mb-2">{{ t('ipMeta.systemSection') }}</h4>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div class="text-ink-muted">{{ t('ipMeta.manufacturer') }}</div>
              <div>{{ safe(meta.System?.Manufacturer) }}</div>
              <div class="text-ink-muted">{{ t('ipMeta.model') }}</div>
              <div>{{ safe(meta.System?.Model) }}</div>
              <div class="text-ink-muted">{{ t('ipMeta.totalRam') }}</div>
              <div>{{ fmtGb(meta.System?.TotalRAM_GB) }}</div>
            </div>
          </section>

          <section class="rounded-lg border border-line bg-surface p-4">
            <h4 class="font-semibold text-ink mb-2">{{ t('ipMeta.cpuSection') }}</h4>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div class="text-ink-muted">{{ t('ipMeta.cpuName') }}</div>
              <div>{{ safe(meta.CPU?.Name) }}</div>
              <div class="text-ink-muted">{{ t('ipMeta.cores') }}</div>
              <div>{{ safe(meta.CPU?.Cores) }}</div>
              <div class="text-ink-muted">{{ t('ipMeta.logical') }}</div>
              <div>{{ safe(meta.CPU?.LogicalCPUs) }}</div>
              <div class="text-ink-muted">{{ t('ipMeta.maxMhz') }}</div>
              <div>{{ safe(meta.CPU?.MaxClockMHz) }}</div>
              <div class="text-ink-muted">{{ t('ipMeta.socket') }}</div>
              <div>{{ safe(meta.CPU?.Socket) }}</div>
            </div>
          </section>

          <section class="rounded-lg border border-line bg-surface p-4">
            <h4 class="font-semibold text-ink mb-2">{{ t('ipMeta.biosMbSection') }}</h4>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div class="text-ink-muted">{{ t('ipMeta.biosVendor') }}</div>
              <div>{{ safe(meta.BIOS?.Vendor) }}</div>
              <div class="text-ink-muted">{{ t('ipMeta.biosVersion') }}</div>
              <div>{{ safe(meta.BIOS?.Version) }}</div>
              <div class="text-ink-muted">{{ t('ipMeta.biosRelease') }}</div>
              <div>{{ fmtDateLoc(meta.BIOS?.ReleaseDate) }}</div>
              <div class="text-ink-muted">{{ t('ipMeta.mbManufacturer') }}</div>
              <div>{{ safe(meta.Motherboard?.Manufacturer) }}</div>
              <div class="text-ink-muted">{{ t('ipMeta.mbModel') }}</div>
              <div>{{ safe(meta.Motherboard?.Product) }}</div>
              <div class="text-ink-muted">{{ t('ipMeta.mbSerial') }}</div>
              <div>{{ safe(meta.Motherboard?.Serial) }}</div>
            </div>
          </section>
        </div>

        <div class="space-y-4">
          <section>
            <h4 class="font-semibold text-ink mb-2">{{ t('ipMeta.ramModulesTitle', { count: meta.RAMModules?.length || 0 }) }}</h4>
            <div v-if="meta.RAMModules?.length" class="table-shell">
              <div class="overflow-x-auto">
                <table class="w-full min-w-150 border-collapse text-sm">
                  <thead>
                    <tr class="table-head-row">
                      <th class="px-3 py-2 text-left">{{ t('ipMeta.colSlot') }}</th>
                      <th class="px-3 py-2 text-left">{{ t('ipMeta.colMfrPn') }}</th>
                      <th class="px-3 py-2 text-left">{{ t('ipMeta.colSerial') }}</th>
                      <th class="px-3 py-2 text-left">{{ t('ipMeta.colCapacity') }}</th>
                      <th class="px-3 py-2 text-left">{{ t('ipMeta.colSpeed') }}</th>
                      <th class="px-3 py-2 text-left">{{ t('ipMeta.colFormFactor') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(r, idx) in meta.RAMModules" :key="idx" class="border-b border-line last:border-0">
                      <td class="px-3 py-2 align-top">{{ safe(r.Slot) }}</td>
                      <td class="px-3 py-2 align-top">{{ [r.Manufacturer, r.PartNumber].filter(Boolean).join(' · ') || '—' }}</td>
                      <td class="px-3 py-2 align-top font-mono text-xs">{{ safe(r.Serial) }}</td>
                      <td class="px-3 py-2 align-top">{{ fmtGb(r.CapacityGB) }}</td>
                      <td class="px-3 py-2 align-top">{{ safe(r.SpeedMTps) }}</td>
                      <td class="px-3 py-2 align-top">{{ safe(r.FormFactor) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div v-else class="text-sm text-ink-muted">{{ t('ipMeta.noData') }}</div>
          </section>

          <section>
            <h4 class="font-semibold text-ink mb-2">{{ t('ipMeta.disksTitle', { count: meta.Storage?.length || 0 }) }}</h4>
            <div v-if="meta.Storage?.length" class="table-shell">
              <div class="overflow-x-auto">
                <table class="w-full min-w-150 border-collapse text-sm">
                  <thead>
                    <tr class="table-head-row">
                      <th class="px-3 py-2 text-left">{{ t('ipMeta.colModel') }}</th>
                      <th class="px-3 py-2 text-left">{{ t('ipMeta.colSerialFw') }}</th>
                      <th class="px-3 py-2 text-left">{{ t('ipMeta.colSize') }}</th>
                      <th class="px-3 py-2 text-left">{{ t('ipMeta.colTypeBus') }}</th>
                      <th class="px-3 py-2 text-left">{{ t('ipMeta.colDeviceId') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(s, idx) in meta.Storage" :key="idx" class="border-b border-line last:border-0">
                      <td class="px-3 py-2 align-top">{{ safe(s.Model) }}</td>
                      <td class="px-3 py-2 align-top font-mono text-xs">{{ [s.Serial, s.Firmware].filter(Boolean).join(' · ') || '—' }}</td>
                      <td class="px-3 py-2 align-top">{{ s.SizeGB ? `${s.SizeGB} GB` : '—' }}</td>
                      <td class="px-3 py-2 align-top">{{ [s.MediaType, s.BusType].filter(Boolean).join(' · ') || '—' }}</td>
                      <td class="px-3 py-2 align-top font-mono text-xs">{{ safe(s.DeviceID) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div v-else class="text-sm text-ink-muted">{{ t('ipMeta.noData') }}</div>
          </section>

          <section>
            <h4 class="font-semibold text-ink mb-2">{{ t('ipMeta.gpuTitle', { count: meta.GPUs?.length || 0 }) }}</h4>
            <div v-if="meta.GPUs?.length" class="table-shell">
              <div class="overflow-x-auto">
                <table class="w-full min-w-100 border-collapse text-sm">
                  <thead>
                    <tr class="table-head-row">
                      <th class="px-3 py-2 text-left">{{ t('ipMeta.colName') }}</th>
                      <th class="px-3 py-2 text-left">{{ t('ipMeta.colDriver') }}</th>
                      <th class="px-3 py-2 text-left">{{ t('ipMeta.colVram') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(g, idx) in meta.GPUs" :key="idx" class="border-b border-line last:border-0">
                      <td class="px-3 py-2 align-top">{{ safe(g.Name) }}</td>
                      <td class="px-3 py-2 align-top">{{ safe(g.DriverVers) }}</td>
                      <td class="px-3 py-2 align-top">{{ g.VRAM_GB ? `${g.VRAM_GB} GB` : '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div v-else class="text-sm text-ink-muted">{{ t('ipMeta.noData') }}</div>
          </section>

          <section>
            <h4 class="font-semibold text-ink mb-2">{{ t('ipMeta.networkTitle', { count: meta.NICs?.length || 0 }) }}</h4>
            <div v-if="meta.NICs?.length" class="table-shell">
              <div class="overflow-x-auto">
                <table class="w-full min-w-100 border-collapse text-sm">
                  <thead>
                    <tr class="table-head-row">
                      <th class="px-3 py-2 text-left">{{ t('ipMeta.colName') }}</th>
                      <th class="px-3 py-2 text-left">{{ t('ipMeta.colMac') }}</th>
                      <th class="px-3 py-2 text-left">{{ t('ipMeta.colSpeed') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(n, idx) in meta.NICs" :key="idx" class="border-b border-line last:border-0">
                      <td class="px-3 py-2 align-top">{{ safe(n.Name) }}</td>
                      <td class="px-3 py-2 align-top font-mono text-xs">{{ safe(n.MAC) }}</td>
                      <td class="px-3 py-2 align-top">{{ fmtMbps(n.SpeedMbps) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div v-else class="text-sm text-ink-muted">{{ t('ipMeta.noData') }}</div>
          </section>
        </div>
      </div>
    </template>

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
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { downloadFromResponse } from '@/utils/download.js'
import { fmtDate, fmtGb, fmtMbps, safe } from '@/utils/format.js'
import { useToast } from '@/composables/useToast.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import AppButton from '@/components/AppButton.vue'
import UptimeTimeline from '@/components/UptimeTimeline.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const { t, locale } = useI18n()
const { toast, showToast } = useToast()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()
const { isAdmin } = useCurrentUser()

const route = useRoute()
const router = useRouter()

const fmtDateLoc = (d) => fmtDate(d, locale.value === 'en' ? 'en-US' : 'sr-RS')

const entry = ref(null)
const entryLoading = ref(false)
const entryError = ref('')

const meta = ref(null)
const metaLoading = ref(false)
const metaError = ref('')
const exportingPdf = ref(false)
const waking = ref(false)

const uptimePeriods = ref([])
const uptimeLoading = ref(false)
const uptimeError = ref('')

function goBack() {
  router.push('/')
}

async function exportPdf() {
  exportingPdf.value = true
  try {
    const filenameSafe = (entry.value?.computerName || entry.value?.ip || route.params.id).replace(/[^\w-]+/g, '_')
    await downloadFromResponse(
      await fetchWithAuth(`/api/protected/metadata/${route.params.id}/export-pdf`),
      `NetDesk_metapodaci_${filenameSafe}.pdf`,
    )
  } catch (err) {
    console.error('Greška pri izvozu PDF-a:', err)
    showToast(t('ipMeta.errorExportPdf'), { kind: 'error', duration: 3000 })
  } finally {
    exportingPdf.value = false
  }
}

async function wakeComputer() {
  waking.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses/${route.params.id}/wake`, { method: 'POST' })
    if (!res.ok) throw new Error(await parseError(res, `HTTP ${res.status}`))
    showToast(t('ipMeta.wakeSent'))
  } catch (err) {
    console.error('Greška pri buđenju računara:', err)
    showToast(err.message || t('ipMeta.errorWake'), { kind: 'error', duration: 3000 })
  } finally {
    waking.value = false
  }
}

async function clearMetadata() {
  const ok = await askConfirm(
    t('ipMeta.confirmClearMetadataMessage'),
    { title: t('ipMeta.confirmClearMetadataTitle') },
  )
  if (!ok) return

  try {
    const res = await fetchWithAuth(`/api/protected/metadata/${route.params.id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await parseError(res, `HTTP ${res.status}`))
    meta.value = null
    showToast(t('ipMeta.metadataCleared'))
  } catch (err) {
    console.error('Greška pri brisanju metapodataka:', err)
    showToast(t('ipMeta.errorClearMetadata'), { kind: 'error', duration: 3000 })
  }
}

function formatDuration(fromValue, toValue) {
  const from = new Date(fromValue).getTime()
  const to = toValue ? new Date(toValue).getTime() : Date.now()
  if (Number.isNaN(from) || Number.isNaN(to)) return '—'

  const totalMinutes = Math.max(0, Math.floor((to - from) / 60000))
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) return t('ipMeta.daysHours', { days, hours })
  if (hours > 0) return t('ipMeta.hoursMinutes', { hours, minutes })
  return t('ipMeta.minutes', { minutes })
}

async function loadMeta(ip) {
  metaLoading.value = true
  metaError.value = ''
  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses/${encodeURIComponent(ip)}/metadata`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    meta.value = data?.metadata ?? data
  } catch (err) {
    console.error(err)
    metaError.value = t('ipMeta.errorLoadMetadata')
  } finally {
    metaLoading.value = false
  }
}

async function loadUptime(id) {
  uptimeLoading.value = true
  uptimeError.value = ''
  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses/${id}/uptime`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    uptimePeriods.value = Array.isArray(data?.periods) ? data.periods : []
  } catch (err) {
    console.error(err)
    uptimeError.value = t('ipMeta.errorLoadUptime')
  } finally {
    uptimeLoading.value = false
  }
}

async function loadEntry() {
  entryLoading.value = true
  entryError.value = ''
  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses/${route.params.id}`)
    if (!res.ok) {
      entryError.value = t('ipMeta.entryNotFound')
      return
    }
    entry.value = await res.json()
    await Promise.all([loadMeta(entry.value.ip), loadUptime(route.params.id)])
  } catch (err) {
    console.error(err)
    entryError.value = t('ipMeta.errorLoadEntry')
  } finally {
    entryLoading.value = false
  }
}

onMounted(loadEntry)
</script>
