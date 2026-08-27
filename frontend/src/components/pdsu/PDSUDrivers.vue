<script setup>
import { computed } from 'vue'
import { usePdsuFormatters } from '@/composables/usePdsuFormatters.js'

const props = defineProps({
  drivers: {
    type: Object,
    default: () => ({}),
  },
})

const { formatNumber, formatDate, barWidth, splitValues } = usePdsuFormatters()

const stats = computed(() => props.drivers?.stats ?? {})
const tables = computed(() => props.drivers?.tables ?? {})

const topManufacturers = computed(() => tables.value?.topManufacturers ?? [])

const oldestDrivers = computed(() => tables.value?.oldestDrivers ?? [])

const multipleVersions = computed(() => tables.value?.multipleVersions ?? [])

const computersWithMostDrivers = computed(() => tables.value?.computersWithMostDrivers ?? [])

const maxManufacturerDrivers = computed(() => {
  return Math.max(...topManufacturers.value.map((item) => Number(item.drivers) || 0), 1)
})

function driverAgeClass(value) {
  if (!value) {
    return 'bg-ink-muted text-white'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'bg-ink-muted text-white'
  }

  const ageInDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)

  // 3650d (10y) / 1825d (5y) - drivers this old are almost certainly
  // pre-dating the current OS install, flagging them as a support risk
  // rather than tied to any vendor-specific EOL schedule.
  if (ageInDays >= 3650) {
    return 'bg-bad text-white'
  }

  if (ageInDays >= 1825) {
    return 'bg-warn text-white'
  }

  return 'bg-good text-white'
}

function driverAgeLabel(value) {
  if (!value) {
    return 'Nepoznat datum'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Nepoznat datum'
  }

  const years = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 365.25)

  if (years < 1) {
    return 'Manje od godinu dana'
  }

  return `${Math.floor(years)} god.`
}
</script>

<template>
  <section class="pdsu-drivers">
    <!-- KPI kartice -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5 mb-4">
      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">Ukupno drajvera</div>

          <div class="text-2xl font-bold tracking-tight text-ink">
            {{ formatNumber(stats.totalDrivers) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">
            Na
            {{ formatNumber(stats.computersWithDrivers) }}
            računara
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">Jedinstveni uređaji</div>

          <div class="text-2xl font-bold tracking-tight text-ink">
            {{ formatNumber(stats.uniqueDevices) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">Različitih naziva uređaja</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">Prosek po računaru</div>

          <div class="text-2xl font-bold tracking-tight text-ink">
            {{ formatNumber(stats.avgPerComputer, 1) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">Drajvera po računaru</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">Bez proizvođača</div>

          <div
            class="text-2xl font-bold tracking-tight"
            :class="Number(stats.withoutManufacturer) > 0 ? 'text-warn' : 'text-ink'"
          >
            {{ formatNumber(stats.withoutManufacturer) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">Zapisa bez proizvođača</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">Bez datuma</div>

          <div
            class="text-2xl font-bold tracking-tight"
            :class="Number(stats.withoutDate) > 0 ? 'text-warn' : 'text-ink'"
          >
            {{ formatNumber(stats.withoutDate) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">Drajvera bez datuma</div>
        </div>
      </div>
    </div>

    <!-- Dodatni status -->
    <div class="grid grid-cols-1 gap-3 md:grid-cols-3 mb-4">
      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">Jedinstveni proizvođači</div>

          <div class="text-lg font-bold text-ink">
            {{ formatNumber(stats.uniqueManufacturers) }}
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">Bez verzije</div>

          <div
            class="text-lg font-bold"
            :class="Number(stats.withoutVersion) > 0 ? 'text-warn' : 'text-ink'"
          >
            {{ formatNumber(stats.withoutVersion) }}
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">Raspon datuma drajvera</div>

          <div class="font-semibold text-ink">
            {{ formatDate(stats.oldestDriverDate) }}
            –
            {{ formatDate(stats.newestDriverDate) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Period inventara -->
    <div class="pdsu-card mb-4">
      <div class="p-4">
        <div class="flex flex-col justify-between gap-3 md:flex-row">
          <div>
            <div class="text-xs text-ink-muted">Najstariji PDSU zapis drajvera</div>

            <div class="font-semibold text-ink">
              {{ formatDate(stats.oldestInventoryDate, true) }}
            </div>
          </div>

          <div class="md:text-right">
            <div class="text-xs text-ink-muted">Najnoviji PDSU zapis drajvera</div>

            <div class="font-semibold text-ink">
              {{ formatDate(stats.newestInventoryDate, true) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Top proizvođači -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header">
        <h5 class="pdsu-card-title">Najzastupljeniji proizvođači drajvera</h5>

        <div class="text-xs text-ink-muted">Prema ukupnom broju pronađenih drajvera</div>
      </div>

      <div class="p-4">
        <div v-if="topManufacturers.length === 0" class="text-ink-muted text-center py-4">
          Nema podataka o proizvođačima.
        </div>

        <div
          v-for="(item, index) in topManufacturers"
          v-else
          :key="`${item.manufacturer}-${index}`"
          class="mb-5 last:mb-0"
        >
          <div class="flex items-start justify-between gap-3 mb-1">
            <div class="truncate">
              <span class="text-ink-muted mr-2"> {{ index + 1 }}. </span>

              <span class="font-semibold text-ink" :title="item.manufacturer">
                {{ item.manufacturer }}
              </span>
            </div>

            <div class="whitespace-nowrap font-semibold text-ink">
              {{ formatNumber(item.drivers) }}
            </div>
          </div>

          <div class="pdsu-progress">
            <div
              class="pdsu-progress-bar bg-good"
              :style="{
                width: `${barWidth(item.drivers, maxManufacturerDrivers)}%`,
              }"
            />
          </div>

          <div class="flex items-center justify-between mt-1 text-xs text-ink-muted">
            <span>
              {{ formatNumber(item.computers) }}
              računara
            </span>

            <span>
              {{ formatNumber(item.devices) }}
              uređaja
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Najstariji drajveri -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">Najstariji drajveri</h5>

          <div class="text-xs text-ink-muted">Drajveri sortirani prema datumu od najstarijeg</div>
        </div>

        <span class="pdsu-badge bg-bad text-white">
          {{ formatNumber(oldestDrivers.length) }}
        </span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>Uređaj</th>
              <th>Računar</th>
              <th>Proizvođač</th>
              <th>Verzija</th>
              <th>Datum drajvera</th>
              <th class="text-center">Starost</th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="(item, index) in oldestDrivers"
              :key="
                item.ipEntryId
                  ? `${item.ipEntryId}-${item.deviceName}-${index}`
                  : `${item.ip}-${index}`
              "
            >
              <td>
                <div class="font-semibold text-ink">
                  {{ item.deviceName || 'Nepoznat uređaj' }}
                </div>

                <div class="text-xs text-ink-muted">
                  {{ item.driverProviderName || 'Nepoznat provider' }}
                </div>
              </td>

              <td>
                <div class="font-semibold text-ink">
                  {{ item.computerName || 'Nepoznat računar' }}
                </div>

                <div>
                  <code class="pdsu-code">{{ item.ip || '—' }}</code>
                </div>

                <div class="text-xs text-ink-muted">
                  {{ item.department || '—' }}
                </div>
              </td>

              <td>
                {{ item.manufacturer || 'Nepoznat' }}
              </td>

              <td>
                {{ item.driverVersion || '—' }}
              </td>

              <td>
                {{ formatDate(item.driverDate) }}
              </td>

              <td class="text-center">
                <span class="pdsu-badge" :class="driverAgeClass(item.driverDate)">
                  {{ driverAgeLabel(item.driverDate) }}
                </span>
              </td>
            </tr>

            <tr v-if="oldestDrivers.length === 0">
              <td colspan="6" class="text-center text-ink-muted py-4">Nema rezultata.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Više verzija -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">Uređaji sa više verzija drajvera</h5>

          <div class="text-xs text-ink-muted">
            Isti uređaj je pronađen sa različitim verzijama drajvera
          </div>
        </div>

        <span class="pdsu-badge bg-warn text-white">
          {{ formatNumber(multipleVersions.length) }}
        </span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>Uređaj</th>
              <th>Proizvođač</th>
              <th class="text-center">Broj verzija</th>
              <th class="text-center">Računari</th>
              <th>Pronađene verzije</th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="(item, index) in multipleVersions"
              :key="`${item.deviceName}-${index}`"
            >
              <td class="font-semibold text-ink">
                {{ item.deviceName }}
              </td>

              <td>
                {{ item.manufacturer || 'Nepoznat' }}
              </td>

              <td class="text-center">
                <span class="pdsu-badge bg-warn text-white">
                  {{ formatNumber(item.versionCount) }}
                </span>
              </td>

              <td class="text-center">
                {{ formatNumber(item.computers) }}
              </td>

              <td>
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="version in splitValues(item.versions)"
                    :key="version"
                    class="pdsu-badge bg-surface-sunken text-ink-secondary border border-line"
                  >
                    {{ version }}
                  </span>

                  <span v-if="splitValues(item.versions).length === 0" class="text-ink-muted">
                    Nema podatka
                  </span>
                </div>
              </td>
            </tr>

            <tr v-if="multipleVersions.length === 0">
              <td colspan="5" class="text-center text-ink-muted py-4">Nema rezultata.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Računari sa najviše drajvera -->
    <div class="pdsu-card">
      <div class="pdsu-card-header flex items-center justify-between">
        <div>
          <h5 class="pdsu-card-title">Računari sa najviše drajvera</h5>

          <div class="text-xs text-ink-muted">Rangirano prema ukupnom broju drajvera</div>
        </div>

        <span class="pdsu-badge bg-ink text-white">
          Top
          {{ formatNumber(computersWithMostDrivers.length) }}
        </span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Računar</th>
              <th>IP adresa</th>
              <th>Odeljenje</th>
              <th class="text-center">Broj drajvera</th>
              <th>Datum inventara</th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="(item, index) in computersWithMostDrivers"
              :key="item.ipEntryId ?? `${item.ip}-${index}`"
            >
              <td class="text-ink-muted">
                {{ index + 1 }}
              </td>

              <td class="font-semibold text-ink">
                {{ item.computerName || 'Nepoznat računar' }}
              </td>

              <td>
                <code class="pdsu-code">{{ item.ip || '—' }}</code>
              </td>

              <td>
                {{ item.department || '—' }}
              </td>

              <td class="text-center">
                <span class="pdsu-badge bg-good text-white">
                  {{ formatNumber(item.driverCount) }}
                </span>
              </td>

              <td>
                {{ formatDate(item.inventoryDate, true) }}
              </td>
            </tr>

            <tr v-if="computersWithMostDrivers.length === 0">
              <td colspan="6" class="text-center text-ink-muted py-4">Nema podataka.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
