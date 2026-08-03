<script setup>
import { computed } from 'vue'
import { usePdsuFormatters } from '@/composables/usePdsuFormatters.js'

const props = defineProps({
  printers: {
    type: Object,
    default: () => ({}),
  },
})

const { formatNumber, formatDate: formatDateBase, splitValues } = usePdsuFormatters()

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

const totalPrinters = computed(() => Number(stats.value?.totalPrinters) || 0)

function statusBadgeClass(status) {
  const s = String(status || '').trim().toLowerCase()
  if (['ok', 'idle', 'unknown', ''].includes(s)) {
    return 'bg-green-600 text-white'
  }
  return 'bg-red-600 text-white'
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
