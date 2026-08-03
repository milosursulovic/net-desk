<script setup>
import { ref, computed } from 'vue'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { downloadFromResponse } from '@/utils/download.js'
import { useCurrentSite } from '@/composables/useCurrentSite.js'
import { useToast } from '@/composables/useToast.js'
import { usePdsuFormatters } from '@/composables/usePdsuFormatters.js'
import AppButton from '@/components/AppButton.vue'

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
    return 'bg-green-600 text-white'
  }
  return 'bg-red-600 text-white'
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
    showToast('Greška pri izvozu PDF-a', { prefix: '❌ ', duration: 3000 })
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
          <div class="text-xs text-slate-500 mb-1">Ukupno štampača</div>
          <div class="text-2xl font-bold tracking-tight text-slate-900">
            {{ formatNumber(stats.totalPrinters) }}
          </div>
          <div class="text-xs text-slate-500 mt-2">
            Na {{ formatNumber(stats.computersWithPrinters) }} računara
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Jedinstveni štampači</div>
          <div class="text-2xl font-bold tracking-tight text-slate-900">
            {{ formatNumber(stats.uniquePrinters) }}
          </div>
          <div class="text-xs text-slate-500 mt-2">Različitih naziva štampača</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Prosek po računaru</div>
          <div class="text-2xl font-bold tracking-tight text-slate-900">
            {{ formatNumber(stats.avgPerComputer) }}
          </div>
          <div class="text-xs text-slate-500 mt-2">Štampača po računaru sa štampačem</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Podrazumevani</div>
          <div class="text-2xl font-bold tracking-tight text-slate-900">
            {{ formatNumber(stats.defaultCount) }}
          </div>
          <div class="text-xs text-slate-500 mt-2">Označeni kao podrazumevani</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Problematičan status</div>
          <div
            class="text-2xl font-bold tracking-tight"
            :class="Number(stats.problemStatus) > 0 ? 'text-red-600' : 'text-green-600'"
          >
            {{ formatNumber(stats.problemStatus) }}
          </div>
          <div class="text-xs text-slate-500 mt-2">Status različit od OK/Idle</div>
        </div>
      </div>
    </div>

    <!-- Period inventara -->
    <div class="pdsu-card mb-4">
      <div class="p-4">
        <div class="flex flex-col justify-between gap-3 md:flex-row">
          <div>
            <div class="text-xs text-slate-500">Najstariji PDSU zapis štampača</div>
            <div class="font-semibold text-slate-900">{{ formatDate(stats.oldestInventoryDate) }}</div>
          </div>
          <div class="md:text-right">
            <div class="text-xs text-slate-500">Najnoviji PDSU zapis štampača</div>
            <div class="font-semibold text-slate-900">{{ formatDate(stats.newestInventoryDate) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Aktivni štampač po računaru (svi sinhronizovani štampači, ne samo podrazumevani) -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">Aktivni štampač po računaru</h5>
          <div class="text-xs text-slate-500">
            Svi sinhronizovani štampači po računaru - dosta mašina nema nijedan štampač
            markiran kao podrazumevani, pa se ovde prikazuju svi da nijedan računar ne bude
            izostavljen. "Podrazumevani" označava Windows-ov Default štampač, ako postoji.
            Ovo je isto što se izvozi u "Aktivni štampači" list pri XLSX izvozu.
          </div>
        </div>
        <div class="flex items-center gap-2">
          <AppButton
            variant="secondary"
            :disabled="exportingActivePrintersPdf || activePerComputer.length === 0"
            @click="exportActivePrintersPdf"
          >
            {{ exportingActivePrintersPdf ? 'Izvoz…' : 'Izvezi PDF' }}
          </AppButton>
          <span class="pdsu-badge bg-blue-600 text-white">{{ formatNumber(activePerComputer.length) }}</span>
        </div>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>Računar</th>
              <th>IP</th>
              <th>Odeljenje</th>
              <th>Štampač</th>
              <th>Proizvođač</th>
              <th>Drajver</th>
              <th class="text-center">Status</th>
              <th>Datum inventara</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in activePerComputer" :key="item.ipEntryId ? `${item.ipEntryId}-${item.name}` : `${item.ip}-${index}`">
              <td class="font-semibold text-slate-900">{{ item.computerName || 'Nepoznat računar' }}</td>
              <td><code class="pdsu-code">{{ item.ip || '—' }}</code></td>
              <td>{{ item.department || '—' }}</td>
              <td>
                <div>{{ item.name || '—' }}</div>
                <span v-if="item.isDefault" class="text-xs text-blue-600">Podrazumevani</span>
              </td>
              <td>{{ item.manufacturer || 'Nepoznato' }}</td>
              <td>{{ item.driverName || '—' }}</td>
              <td class="text-center">
                <span class="pdsu-badge" :class="statusBadgeClass(item.status)">
                  {{ item.status || 'Nepoznato' }}
                </span>
              </td>
              <td>{{ formatDate(item.inventoryDate) }}</td>
            </tr>
            <tr v-if="activePerComputer.length === 0">
              <td colspan="8" class="text-center text-slate-500 py-4">
                Nema sinhronizovanih štampača.
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
          <h5 class="pdsu-card-title">Aktivni štampači po proizvođaču</h5>
          <div class="text-xs text-slate-500">
            Grupisano po brendu (izvedeno iz naziva drajvera/štampača - Win32_Printer nema strukturiran
            proizvođač podatak). Broji sve sinhronizovane štampače, ne samo podrazumevane.
          </div>
        </div>
        <span class="pdsu-badge bg-slate-900 text-white">{{ formatNumber(groupedByManufacturer.length) }}</span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>Proizvođač</th>
              <th class="text-center">Štampača</th>
              <th>Računari</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="group in groupedByManufacturer" :key="group.manufacturer">
              <td class="font-semibold text-slate-900">{{ group.manufacturer }}</td>
              <td class="text-center">
                <span class="pdsu-badge bg-slate-500 text-white">{{ formatNumber(group.count) }}</span>
              </td>
              <td>
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="computer in uniqueComputers(group.computers)"
                    :key="computer.ipEntryId"
                    class="pdsu-badge bg-slate-100 text-slate-700 border border-slate-200"
                  >
                    {{ computer.computerName || computer.ip }}
                  </span>
                </div>
              </td>
            </tr>
            <tr v-if="groupedByManufacturer.length === 0">
              <td colspan="3" class="text-center text-slate-500 py-4">Nema rezultata.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Štampači sa problematičnim statusom -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">Štampači sa problematičnim statusom</h5>
          <div class="text-xs text-slate-500">Status različit od OK/Idle/Unknown - potencijalno zahtevaju proveru</div>
        </div>
        <span class="pdsu-badge" :class="problemStatus.length > 0 ? 'bg-red-600 text-white' : 'bg-green-600 text-white'">
          {{ formatNumber(problemStatus.length) }}
        </span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>Štampač</th>
              <th>Računar</th>
              <th>Drajver</th>
              <th>Port</th>
              <th class="text-center">Status</th>
              <th>Datum inventara</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(item, index) in problemStatus"
              :key="item.id ?? `${item.ipEntryId}-${item.name}-${index}`"
            >
              <td>
                <div class="font-semibold text-slate-900">{{ item.name || 'Nepoznat štampač' }}</div>
                <span v-if="item.isDefault" class="text-xs text-blue-600">Podrazumevani</span>
              </td>
              <td>
                <div class="font-semibold text-slate-900">{{ item.computerName || 'Nepoznat računar' }}</div>
                <div><code class="pdsu-code">{{ item.ip || '—' }}</code></div>
                <div class="text-xs text-slate-500">{{ item.department || '—' }}</div>
              </td>
              <td>{{ item.driverName || '—' }}</td>
              <td>{{ item.portName || '—' }}</td>
              <td class="text-center">
                <span class="pdsu-badge" :class="statusBadgeClass(item.status)">
                  {{ item.status || 'Nepoznato' }}
                </span>
              </td>
              <td>{{ formatDate(item.inventoryDate) }}</td>
            </tr>
            <tr v-if="problemStatus.length === 0">
              <td colspan="6" class="text-center text-slate-500 py-4">Nema štampača sa problematičnim statusom.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Najčešći štampači -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">Najčešći štampači</h5>
          <div class="text-xs text-slate-500">Rangirano po broju računara koji imaju konfigurisan taj štampač</div>
        </div>
        <span class="pdsu-badge bg-slate-900 text-white">Top {{ formatNumber(topNames.length) }}</span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Štampač</th>
              <th class="text-center">Računari</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in topNames" :key="`${item.name}-${index}`">
              <td class="text-slate-500">{{ index + 1 }}</td>
              <td class="font-semibold text-slate-900">{{ item.name }}</td>
              <td class="text-center">
                <span class="pdsu-badge bg-slate-500 text-white">{{ formatNumber(item.computers) }}</span>
              </td>
            </tr>
            <tr v-if="topNames.length === 0">
              <td colspan="3" class="text-center text-slate-500 py-4">Nema rezultata.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Najčešći drajveri -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">Najčešći drajveri štampača</h5>
          <div class="text-xs text-slate-500">Korisno za planiranje ažuriranja drajvera</div>
        </div>
        <span class="pdsu-badge bg-slate-900 text-white">Top {{ formatNumber(topDrivers.length) }}</span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Drajver</th>
              <th class="text-center">Štampači</th>
              <th class="text-center">Računari</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in topDrivers" :key="`${item.driverName}-${index}`">
              <td class="text-slate-500">{{ index + 1 }}</td>
              <td class="font-semibold text-slate-900">{{ item.driverName }}</td>
              <td class="text-center">{{ formatNumber(item.printers) }}</td>
              <td class="text-center">
                <span class="pdsu-badge bg-slate-500 text-white">{{ formatNumber(item.computers) }}</span>
              </td>
            </tr>
            <tr v-if="topDrivers.length === 0">
              <td colspan="4" class="text-center text-slate-500 py-4">Nema rezultata.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Retki štampači -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">Retki štampači</h5>
          <div class="text-xs text-slate-500">Štampači pronađeni na malom broju računara</div>
        </div>
        <span class="pdsu-badge bg-slate-500 text-white">{{ formatNumber(rarePrinters.length) }}</span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>Štampač</th>
              <th class="text-center">Računari</th>
              <th>Pronađen na</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in rarePrinters" :key="`${item.name}-${index}`">
              <td class="font-semibold text-slate-900">{{ item.name }}</td>
              <td class="text-center">
                <span class="pdsu-badge bg-slate-500 text-white">{{ formatNumber(item.computers) }}</span>
              </td>
              <td>
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="computer in splitValues(item.computerNames)"
                    :key="computer"
                    class="pdsu-badge bg-slate-100 text-slate-700 border border-slate-200"
                  >
                    {{ computer }}
                  </span>
                  <span v-if="splitValues(item.computerNames).length === 0" class="text-slate-500">Nema podatka</span>
                </div>
              </td>
            </tr>
            <tr v-if="rarePrinters.length === 0">
              <td colspan="3" class="text-center text-slate-500 py-4">Nema rezultata.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Računari sa najviše štampača -->
    <div class="pdsu-card">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">Računari sa najviše štampača</h5>
          <div class="text-xs text-slate-500">Rangirano prema ukupnom broju konfigurisanih štampača</div>
        </div>
        <span class="pdsu-badge bg-slate-900 text-white">Top {{ formatNumber(computersWithMostPrinters.length) }}</span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Računar</th>
              <th>IP adresa</th>
              <th>Odeljenje</th>
              <th class="text-center">Broj štampača</th>
              <th>Datum inventara</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(item, index) in computersWithMostPrinters"
              :key="item.ipEntryId ?? `${item.ip}-${index}`"
            >
              <td class="text-slate-500">{{ index + 1 }}</td>
              <td class="font-semibold text-slate-900">{{ item.computerName || 'Nepoznat računar' }}</td>
              <td><code class="pdsu-code">{{ item.ip || '—' }}</code></td>
              <td>{{ item.department || '—' }}</td>
              <td class="text-center">
                <span class="pdsu-badge bg-green-600 text-white">{{ formatNumber(item.printerCount) }}</span>
              </td>
              <td>{{ formatDate(item.inventoryDate) }}</td>
            </tr>
            <tr v-if="computersWithMostPrinters.length === 0">
              <td colspan="6" class="text-center text-slate-500 py-4">Nema rezultata.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
