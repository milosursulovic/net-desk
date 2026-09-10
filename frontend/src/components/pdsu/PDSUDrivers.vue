<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePdsuFormatters } from '@/composables/usePdsuFormatters.js'

const { t } = useI18n()
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
    return t('pdsu.unknownDate')
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return t('pdsu.unknownDate')
  }

  const years = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 365.25)

  if (years < 1) {
    return t('pdsu.lessThanAYear')
  }

  return t('pdsu.yearsAgo', { count: Math.floor(years) })
}
</script>

<template>
  <section class="pdsu-drivers">
    <!-- KPI kartice -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5 mb-4">
      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.totalDrivers') }}</div>

          <div class="text-2xl font-bold tracking-tight text-ink">
            {{ formatNumber(stats.totalDrivers) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">
            {{ t('pdsu.onComputersCount', { count: formatNumber(stats.computersWithDrivers) }) }}
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.uniqueDevices') }}</div>

          <div class="text-2xl font-bold tracking-tight text-ink">
            {{ formatNumber(stats.uniqueDevices) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">{{ t('pdsu.distinctDeviceNames') }}</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.avgPerComputer') }}</div>

          <div class="text-2xl font-bold tracking-tight text-ink">
            {{ formatNumber(stats.avgPerComputer, 1) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">{{ t('pdsu.driversPerComputer') }}</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.withoutManufacturer') }}</div>

          <div
            class="text-2xl font-bold tracking-tight"
            :class="Number(stats.withoutManufacturer) > 0 ? 'text-warn' : 'text-ink'"
          >
            {{ formatNumber(stats.withoutManufacturer) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">{{ t('pdsu.recordsWithoutManufacturer') }}</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.withoutDate') }}</div>

          <div
            class="text-2xl font-bold tracking-tight"
            :class="Number(stats.withoutDate) > 0 ? 'text-warn' : 'text-ink'"
          >
            {{ formatNumber(stats.withoutDate) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">{{ t('pdsu.driversWithoutDate') }}</div>
        </div>
      </div>
    </div>

    <!-- Dodatni status -->
    <div class="grid grid-cols-1 gap-3 md:grid-cols-3 mb-4">
      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.uniqueManufacturers') }}</div>

          <div class="text-lg font-bold text-ink">
            {{ formatNumber(stats.uniqueManufacturers) }}
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.withoutVersion') }}</div>

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
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.driverDateRange') }}</div>

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
            <div class="text-xs text-ink-muted">{{ t('pdsu.oldestDriverRecord') }}</div>

            <div class="font-semibold text-ink">
              {{ formatDate(stats.oldestInventoryDate, true) }}
            </div>
          </div>

          <div class="md:text-right">
            <div class="text-xs text-ink-muted">{{ t('pdsu.newestDriverRecord') }}</div>

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
        <h5 class="pdsu-card-title">{{ t('pdsu.topDriverManufacturers') }}</h5>

        <div class="text-xs text-ink-muted">{{ t('pdsu.byTotalDriversFound') }}</div>
      </div>

      <div class="p-4">
        <div v-if="topManufacturers.length === 0" class="text-ink-muted text-center py-4">
          {{ t('pdsu.noManufacturerData') }}
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
              {{ t('pdsu.computersSuffix') }}
            </span>

            <span>
              {{ formatNumber(item.devices) }}
              {{ t('pdsu.devicesSuffix') }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Najstariji drajveri -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">{{ t('pdsu.oldestDriversTitle') }}</h5>

          <div class="text-xs text-ink-muted">{{ t('pdsu.oldestDriversHint') }}</div>
        </div>

        <span class="pdsu-badge bg-bad text-white">
          {{ formatNumber(oldestDrivers.length) }}
        </span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>{{ t('pdsu.colDevice') }}</th>
              <th>{{ t('metadata.colComputer') }}</th>
              <th>{{ t('printers.manufacturer') }}</th>
              <th>{{ t('pdsu.colVersion') }}</th>
              <th>{{ t('pdsu.colDriverDate') }}</th>
              <th class="text-center">{{ t('pdsu.colAge') }}</th>
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
                  {{ item.deviceName || t('pdsu.unknownDevice') }}
                </div>

                <div class="text-xs text-ink-muted">
                  {{ item.driverProviderName || t('pdsu.unknownProvider') }}
                </div>
              </td>

              <td>
                <div class="font-semibold text-ink">
                  {{ item.computerName || t('pdsu.unknownComputer') }}
                </div>

                <div>
                  <code class="pdsu-code">{{ item.ip || '—' }}</code>
                </div>

                <div class="text-xs text-ink-muted">
                  {{ item.department || '—' }}
                </div>
              </td>

              <td>
                {{ item.manufacturer || t('pdsu.unknown') }}
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
              <td colspan="6" class="text-center text-ink-muted py-4">{{ t('pdsu.noResults') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Više verzija -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">{{ t('pdsu.devicesWithMultipleVersions') }}</h5>

          <div class="text-xs text-ink-muted">
            {{ t('pdsu.devicesWithMultipleVersionsHint') }}
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
              <th>{{ t('pdsu.colDevice') }}</th>
              <th>{{ t('printers.manufacturer') }}</th>
              <th class="text-center">{{ t('pdsu.colVersionCount') }}</th>
              <th class="text-center">{{ t('pdsu.colComputers') }}</th>
              <th>{{ t('pdsu.colFoundVersions') }}</th>
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
                {{ item.manufacturer || t('pdsu.unknown') }}
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
                    {{ t('pdsu.noData') }}
                  </span>
                </div>
              </td>
            </tr>

            <tr v-if="multipleVersions.length === 0">
              <td colspan="5" class="text-center text-ink-muted py-4">{{ t('pdsu.noResults') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Računari sa najviše drajvera -->
    <div class="pdsu-card">
      <div class="pdsu-card-header flex items-center justify-between">
        <div>
          <h5 class="pdsu-card-title">{{ t('pdsu.computersWithMostDrivers') }}</h5>

          <div class="text-xs text-ink-muted">{{ t('pdsu.rankedByTotalDrivers') }}</div>
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
              <th>{{ t('metadata.colComputer') }}</th>
              <th>{{ t('pdsu.colIpAddress') }}</th>
              <th>{{ t('common.department') }}</th>
              <th class="text-center">{{ t('pdsu.colDriverCount') }}</th>
              <th>{{ t('pdsu.colInventoryDate') }}</th>
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
                {{ item.computerName || t('pdsu.unknownComputer') }}
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
              <td colspan="6" class="text-center text-ink-muted py-4">{{ t('pdsu.noData') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
