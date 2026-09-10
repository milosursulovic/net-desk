<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { downloadFromResponse } from '@/utils/download.js'
import { useCurrentSite } from '@/composables/useCurrentSite.js'
import { useToast } from '@/composables/useToast.js'
import { usePdsuFormatters } from '@/composables/usePdsuFormatters.js'
import AppButton from '@/components/AppButton.vue'

const { t } = useI18n()

const props = defineProps({
  printers: {
    type: Object,
    default: () => ({}),
  },
})

const { formatNumber, formatDate: formatDateBase, splitValues } = usePdsuFormatters()
const site = useCurrentSite()
const { showToast } = useToast()

function formatDate(value) {
  return formatDateBase(value, true)
}

const stats = computed(() => props.printers?.stats ?? {})
const tables = computed(() => props.printers?.tables ?? {})

const topNames = computed(() => tables.value?.topNames ?? [])
const topDrivers = computed(() => tables.value?.topDrivers ?? [])
const problemStatus = computed(() => tables.value?.problemStatus ?? [])
const rarePrinters = computed(() => tables.value?.rarePrinters ?? [])
const computersWithMostPrinters = computed(() => tables.value?.computersWithMostPrinters ?? [])
const activePerComputer = computed(() => tables.value?.activePerComputer ?? [])
const groupedByManufacturer = computed(() => tables.value?.groupedByManufacturer ?? [])

const totalPrinters = computed(() => Number(stats.value?.totalPrinters) || 0)

function statusBadgeClass(status) {
  const s = String(status || '').trim().toLowerCase()
  if (['ok', 'idle', 'unknown', ''].includes(s)) {
    return 'bg-good text-white'
  }
  return 'bg-bad text-white'
}

// Grupisanje po proizvođaču sad broji SVAKI štampač (ne jedan po računaru),
// pa isti računar može da se pojavi više puta u group.computers ako ima
// više štampača istog brenda - značke ovde treba da budu po računaru, ne po štampaču.
function uniqueComputers(computers) {
  const seen = new Set()
  return (computers || []).filter((c) => {
    const key = c.ipEntryId ?? c.ip
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const exportingActivePrintersPdf = ref(false)

async function exportActivePrintersPdf() {
  exportingActivePrintersPdf.value = true
  try {
    const dateStamp = new Date().toISOString().slice(0, 10)
    await downloadFromResponse(
      await fetchWithAuth(`/api/protected/pdsu-analytics/printers/active/export-pdf?site=${site.value}`),
      `NetDesk_Aktivni_stampaci_${dateStamp}.pdf`,
    )
  } catch (err) {
    console.error('Export aktivnih štampača greška:', err)
    showToast(t('pdsu.exportPdfError'), { kind: 'error', duration: 3000 })
  } finally {
    exportingActivePrintersPdf.value = false
  }
}
</script>

<template>
  <section class="pdsu-printers">
    <!-- KPI kartice -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5 mb-4">
      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.totalPrinters') }}</div>
          <div class="text-2xl font-bold tracking-tight text-ink">
            {{ formatNumber(stats.totalPrinters) }}
          </div>
          <div class="text-xs text-ink-muted mt-2">
            {{ t('pdsu.onComputersCount', { count: formatNumber(stats.computersWithPrinters) }) }}
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.uniquePrintersTitle') }}</div>
          <div class="text-2xl font-bold tracking-tight text-ink">
            {{ formatNumber(stats.uniquePrinters) }}
          </div>
          <div class="text-xs text-ink-muted mt-2">{{ t('pdsu.distinctPrinterNames') }}</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.avgPerComputer') }}</div>
          <div class="text-2xl font-bold tracking-tight text-ink">
            {{ formatNumber(stats.avgPerComputer) }}
          </div>
          <div class="text-xs text-ink-muted mt-2">{{ t('pdsu.printersPerComputerWithPrinter') }}</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.defaultLabel') }}</div>
          <div class="text-2xl font-bold tracking-tight text-ink">
            {{ formatNumber(stats.defaultCount) }}
          </div>
          <div class="text-xs text-ink-muted mt-2">{{ t('pdsu.markedAsDefault') }}</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.problemStatusTitle') }}</div>
          <div
            class="text-2xl font-bold tracking-tight"
            :class="Number(stats.problemStatus) > 0 ? 'text-bad' : 'text-good'"
          >
            {{ formatNumber(stats.problemStatus) }}
          </div>
          <div class="text-xs text-ink-muted mt-2">{{ t('pdsu.statusDifferentFromOkIdle') }}</div>
        </div>
      </div>
    </div>

    <!-- Period inventara -->
    <div class="pdsu-card mb-4">
      <div class="p-4">
        <div class="flex flex-col justify-between gap-3 md:flex-row">
          <div>
            <div class="text-xs text-ink-muted">{{ t('pdsu.oldestPrinterRecord') }}</div>
            <div class="font-semibold text-ink">{{ formatDate(stats.oldestInventoryDate) }}</div>
          </div>
          <div class="md:text-right">
            <div class="text-xs text-ink-muted">{{ t('pdsu.newestPrinterRecord') }}</div>
            <div class="font-semibold text-ink">{{ formatDate(stats.newestInventoryDate) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Aktivni štampač po računaru (svi sinhronizovani štampači, ne samo podrazumevani) -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">{{ t('pdsu.activePrinterPerComputerTitle') }}</h5>
          <div class="text-xs text-ink-muted">
            {{ t('pdsu.activePrinterPerComputerHint') }}
          </div>
        </div>
        <div class="flex items-center gap-2">
          <AppButton
            variant="secondary"
            :disabled="exportingActivePrintersPdf || activePerComputer.length === 0"
            @click="exportActivePrintersPdf"
          >
            {{ exportingActivePrintersPdf ? t('pdsu.exporting') : t('pdsu.exportPdfLabel') }}
          </AppButton>
          <span class="pdsu-badge bg-accent text-white">{{ formatNumber(activePerComputer.length) }}</span>
        </div>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>{{ t('metadata.colComputer') }}</th>
              <th>IP</th>
              <th>{{ t('common.department') }}</th>
              <th>{{ t('pdsu.colPrinter') }}</th>
              <th>{{ t('printers.manufacturer') }}</th>
              <th>{{ t('pdsu.colDriver') }}</th>
              <th class="text-center">{{ t('pdsu.colStatus') }}</th>
              <th>{{ t('pdsu.colInventoryDate') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in activePerComputer" :key="item.ipEntryId ? `${item.ipEntryId}-${item.name}` : `${item.ip}-${index}`">
              <td class="font-semibold text-ink">{{ item.computerName || t('pdsu.unknownComputer') }}</td>
              <td><code class="pdsu-code">{{ item.ip || '—' }}</code></td>
              <td>{{ item.department || '—' }}</td>
              <td>
                <div>{{ item.name || '—' }}</div>
                <span v-if="item.isDefault" class="text-xs text-accent">{{ t('pdsu.defaultLabel') }}</span>
              </td>
              <td>{{ item.manufacturer || t('pdsu.stateUnknown') }}</td>
              <td>{{ item.driverName || '—' }}</td>
              <td class="text-center">
                <span class="pdsu-badge" :class="statusBadgeClass(item.status)">
                  {{ item.status || t('pdsu.stateUnknown') }}
                </span>
              </td>
              <td>{{ formatDate(item.inventoryDate) }}</td>
            </tr>
            <tr v-if="activePerComputer.length === 0">
              <td colspan="8" class="text-center text-ink-muted py-4">
                {{ t('pdsu.noSyncedPrinters') }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Grupisanje aktivnih štampača po proizvođaču -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">{{ t('pdsu.activePrintersByManufacturerTitle') }}</h5>
          <div class="text-xs text-ink-muted">
            {{ t('pdsu.activePrintersByManufacturerHint') }}
          </div>
        </div>
        <span class="pdsu-badge bg-ink text-white">{{ formatNumber(groupedByManufacturer.length) }}</span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>{{ t('printers.manufacturer') }}</th>
              <th class="text-center">{{ t('pdsu.colPrinterCount') }}</th>
              <th>{{ t('pdsu.colComputers') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="group in groupedByManufacturer" :key="group.manufacturer">
              <td class="font-semibold text-ink">{{ group.manufacturer }}</td>
              <td class="text-center">
                <span class="pdsu-badge bg-ink-muted text-white">{{ formatNumber(group.count) }}</span>
              </td>
              <td>
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="computer in uniqueComputers(group.computers)"
                    :key="computer.ipEntryId"
                    class="pdsu-badge bg-surface-sunken text-ink-secondary border border-line"
                  >
                    {{ computer.computerName || computer.ip }}
                  </span>
                </div>
              </td>
            </tr>
            <tr v-if="groupedByManufacturer.length === 0">
              <td colspan="3" class="text-center text-ink-muted py-4">{{ t('pdsu.noResults') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Štampači sa problematičnim statusom -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">{{ t('pdsu.printersWithProblemStatusTitle') }}</h5>
          <div class="text-xs text-ink-muted">{{ t('pdsu.printersWithProblemStatusHint') }}</div>
        </div>
        <span class="pdsu-badge" :class="problemStatus.length > 0 ? 'bg-bad text-white' : 'bg-good text-white'">
          {{ formatNumber(problemStatus.length) }}
        </span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>{{ t('pdsu.colPrinter') }}</th>
              <th>{{ t('metadata.colComputer') }}</th>
              <th>{{ t('pdsu.colDriver') }}</th>
              <th>{{ t('pdsu.colPort') }}</th>
              <th class="text-center">{{ t('pdsu.colStatus') }}</th>
              <th>{{ t('pdsu.colInventoryDate') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(item, index) in problemStatus"
              :key="item.id ?? `${item.ipEntryId}-${item.name}-${index}`"
            >
              <td>
                <div class="font-semibold text-ink">{{ item.name || t('pdsu.unknownPrinter') }}</div>
                <span v-if="item.isDefault" class="text-xs text-accent">{{ t('pdsu.defaultLabel') }}</span>
              </td>
              <td>
                <div class="font-semibold text-ink">{{ item.computerName || t('pdsu.unknownComputer') }}</div>
                <div><code class="pdsu-code">{{ item.ip || '—' }}</code></div>
                <div class="text-xs text-ink-muted">{{ item.department || '—' }}</div>
              </td>
              <td>{{ item.driverName || '—' }}</td>
              <td>{{ item.portName || '—' }}</td>
              <td class="text-center">
                <span class="pdsu-badge" :class="statusBadgeClass(item.status)">
                  {{ item.status || t('pdsu.stateUnknown') }}
                </span>
              </td>
              <td>{{ formatDate(item.inventoryDate) }}</td>
            </tr>
            <tr v-if="problemStatus.length === 0">
              <td colspan="6" class="text-center text-ink-muted py-4">{{ t('pdsu.noPrintersWithProblemStatus') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Najčešći štampači -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">{{ t('pdsu.mostCommonPrintersTitle') }}</h5>
          <div class="text-xs text-ink-muted">{{ t('pdsu.rankedByComputersConfigured') }}</div>
        </div>
        <span class="pdsu-badge bg-ink text-white">Top {{ formatNumber(topNames.length) }}</span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{{ t('pdsu.colPrinter') }}</th>
              <th class="text-center">{{ t('pdsu.colComputers') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in topNames" :key="`${item.name}-${index}`">
              <td class="text-ink-muted">{{ index + 1 }}</td>
              <td class="font-semibold text-ink">{{ item.name }}</td>
              <td class="text-center">
                <span class="pdsu-badge bg-ink-muted text-white">{{ formatNumber(item.computers) }}</span>
              </td>
            </tr>
            <tr v-if="topNames.length === 0">
              <td colspan="3" class="text-center text-ink-muted py-4">{{ t('pdsu.noResults') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Najčešći drajveri -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">{{ t('pdsu.mostCommonPrinterDriversTitle') }}</h5>
          <div class="text-xs text-ink-muted">{{ t('pdsu.usefulForDriverUpdates') }}</div>
        </div>
        <span class="pdsu-badge bg-ink text-white">Top {{ formatNumber(topDrivers.length) }}</span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{{ t('pdsu.colDriver') }}</th>
              <th class="text-center">{{ t('pdsu.colPrinters') }}</th>
              <th class="text-center">{{ t('pdsu.colComputers') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in topDrivers" :key="`${item.driverName}-${index}`">
              <td class="text-ink-muted">{{ index + 1 }}</td>
              <td class="font-semibold text-ink">{{ item.driverName }}</td>
              <td class="text-center">{{ formatNumber(item.printers) }}</td>
              <td class="text-center">
                <span class="pdsu-badge bg-ink-muted text-white">{{ formatNumber(item.computers) }}</span>
              </td>
            </tr>
            <tr v-if="topDrivers.length === 0">
              <td colspan="4" class="text-center text-ink-muted py-4">{{ t('pdsu.noResults') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Retki štampači -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">{{ t('pdsu.rarePrintersTitle') }}</h5>
          <div class="text-xs text-ink-muted">{{ t('pdsu.printersFoundOnSmallSet') }}</div>
        </div>
        <span class="pdsu-badge bg-ink-muted text-white">{{ formatNumber(rarePrinters.length) }}</span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>{{ t('pdsu.colPrinter') }}</th>
              <th class="text-center">{{ t('pdsu.colComputers') }}</th>
              <th>{{ t('pdsu.foundOnShort') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in rarePrinters" :key="`${item.name}-${index}`">
              <td class="font-semibold text-ink">{{ item.name }}</td>
              <td class="text-center">
                <span class="pdsu-badge bg-ink-muted text-white">{{ formatNumber(item.computers) }}</span>
              </td>
              <td>
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="computer in splitValues(item.computerNames)"
                    :key="computer"
                    class="pdsu-badge bg-surface-sunken text-ink-secondary border border-line"
                  >
                    {{ computer }}
                  </span>
                  <span v-if="splitValues(item.computerNames).length === 0" class="text-ink-muted">{{ t('pdsu.noData') }}</span>
                </div>
              </td>
            </tr>
            <tr v-if="rarePrinters.length === 0">
              <td colspan="3" class="text-center text-ink-muted py-4">{{ t('pdsu.noResults') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Računari sa najviše štampača -->
    <div class="pdsu-card">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">{{ t('pdsu.computersWithMostPrintersTitle') }}</h5>
          <div class="text-xs text-ink-muted">{{ t('pdsu.rankedByTotalPrintersConfigured') }}</div>
        </div>
        <span class="pdsu-badge bg-ink text-white">Top {{ formatNumber(computersWithMostPrinters.length) }}</span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{{ t('metadata.colComputer') }}</th>
              <th>{{ t('pdsu.colIpAddress') }}</th>
              <th>{{ t('common.department') }}</th>
              <th class="text-center">{{ t('pdsu.colPrinterCountFull') }}</th>
              <th>{{ t('pdsu.colInventoryDate') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(item, index) in computersWithMostPrinters"
              :key="item.ipEntryId ?? `${item.ip}-${index}`"
            >
              <td class="text-ink-muted">{{ index + 1 }}</td>
              <td class="font-semibold text-ink">{{ item.computerName || t('pdsu.unknownComputer') }}</td>
              <td><code class="pdsu-code">{{ item.ip || '—' }}</code></td>
              <td>{{ item.department || '—' }}</td>
              <td class="text-center">
                <span class="pdsu-badge bg-good text-white">{{ formatNumber(item.printerCount) }}</span>
              </td>
              <td>{{ formatDate(item.inventoryDate) }}</td>
            </tr>
            <tr v-if="computersWithMostPrinters.length === 0">
              <td colspan="6" class="text-center text-ink-muted py-4">{{ t('pdsu.noResults') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
