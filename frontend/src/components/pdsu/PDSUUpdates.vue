<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePdsuFormatters } from '@/composables/usePdsuFormatters.js'

const { t } = useI18n()

const props = defineProps({
  updates: {
    type: Object,
    default: () => ({}),
  },
})

const { formatNumber, formatDate, barWidth } = usePdsuFormatters()

const stats = computed(() => props.updates?.stats ?? {})
const tables = computed(() => props.updates?.tables ?? {})

const freshness = computed(() => props.updates?.freshness ?? stats.value?.freshness ?? {})

const freshnessBuckets = computed(() => tables.value?.freshnessBuckets ?? [])

const topHotfixes = computed(() => tables.value?.topHotfixes ?? [])

const latestUpdateByComputer = computed(() => tables.value?.latestUpdateByComputer ?? [])

const staleUpdateComputers = computed(() => tables.value?.staleUpdateComputers ?? [])

const maxHotfixComputers = computed(() => {
  return Math.max(...topHotfixes.value.map((item) => Number(item.computers) || 0), 1)
})

const totalFreshnessComputers = computed(() => {
  if (freshnessBuckets.value.length > 0) {
    return freshnessBuckets.value.reduce(
      (sum, item) => sum + (Number(item.computers) || Number(item.count) || 0),
      0
    )
  }

  return [
    freshness.value.last30Days,
    freshness.value.between31And60Days,
    freshness.value.between61And90Days,
    freshness.value.olderThan90Days,
    freshness.value.withoutData,
  ].reduce((sum, value) => sum + (Number(value) || 0), 0)
})

// Backend can return either a `freshnessBuckets` array (newer/richer shape)
// or the flat `freshness.{last30Days,...}` fields (older shape) - this and
// totalFreshnessComputers above both branch on which one is present so the
// component renders correctly against either API response.
const normalizedFreshnessBuckets = computed(() => {
  if (freshnessBuckets.value.length > 0) {
    return freshnessBuckets.value.map((item) => ({
      key: item.key ?? item.bucket ?? item.label ?? cryptoSafeKey(item),
      label: item.label ?? freshnessLabel(item.bucket),
      count: Number(item.computers) || Number(item.count) || 0,
      barClass: item.barClass ?? freshnessClass(item.bucket ?? item.key ?? item.label),
    }))
  }

  return [
    {
      key: 'last30Days',
      label: t('pdsu.freshnessLast30Days'),
      count: Number(freshness.value.last30Days) || 0,
      barClass: 'bg-green-600',
    },
    {
      key: 'between31And60Days',
      label: t('pdsu.freshnessBetween31And60'),
      count: Number(freshness.value.between31And60Days) || 0,
      barClass: 'bg-blue-600',
    },
    {
      key: 'between61And90Days',
      label: t('pdsu.freshnessBetween61And90'),
      count: Number(freshness.value.between61And90Days) || 0,
      barClass: 'bg-amber-500',
    },
    {
      key: 'olderThan90Days',
      label: t('pdsu.freshnessOlderThan90'),
      count: Number(freshness.value.olderThan90Days) || 0,
      barClass: 'bg-red-600',
    },
    {
      key: 'withoutData',
      label: t('pdsu.freshnessWithoutData'),
      count: Number(freshness.value.withoutData) || 0,
      barClass: 'bg-slate-500',
    },
  ]
})

// Name is misleading - this is just a v-for :key fallback built by joining
// the item's own fields, not a cryptographic hash. Only used when the
// backend doesn't supply an explicit key/bucket/label for a bucket.
function cryptoSafeKey(item) {
  return [item.label, item.bucket, item.computers, item.count]
    .filter((value) => value !== undefined && value !== null)
    .join('-')
}

function bucketPercent(value) {
  if (totalFreshnessComputers.value === 0) {
    return 0
  }

  return Math.round(((Number(value) || 0) / totalFreshnessComputers.value) * 100)
}

function daysSince(value) {
  if (!value) {
    return null
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)))
}

function ageBadgeClass(value) {
  const days = daysSince(value)

  if (days === null) {
    return 'bg-ink-muted text-white'
  }

  if (days <= 30) {
    return 'bg-good text-white'
  }

  if (days <= 60) {
    return 'bg-accent text-white'
  }

  if (days <= 90) {
    return 'bg-warn text-white'
  }

  return 'bg-bad text-white'
}

function ageLabel(value) {
  const days = daysSince(value)

  if (days === null) {
    return t('pdsu.freshnessWithoutData')
  }

  if (days === 0) {
    return t('pdsu.ageToday')
  }

  if (days === 1) {
    return t('pdsu.ageOneDayAgo')
  }

  return t('pdsu.ageDaysAgo', { count: formatNumber(days) })
}

function freshnessLabel(value) {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')

  if (normalized.includes('30') || normalized.includes('fresh')) {
    return t('pdsu.freshnessLast30Days')
  }

  if (normalized.includes('31') || normalized.includes('60')) {
    return t('pdsu.freshnessBetween31And60')
  }

  if (normalized.includes('61') || normalized.includes('90')) {
    return t('pdsu.freshnessBetween61And90')
  }

  if (normalized.includes('older') || normalized.includes('stale')) {
    return t('pdsu.freshnessOlderThan90')
  }

  if (normalized.includes('without') || normalized.includes('missing')) {
    return t('pdsu.freshnessWithoutData')
  }

  return value || t('pdsu.stateUnknown')
}

function freshnessClass(value) {
  const normalized = String(value || '').toLowerCase()

  if (normalized.includes('without') || normalized.includes('missing')) {
    return 'bg-slate-500'
  }

  if (normalized.includes('older') || normalized.includes('stale') || normalized.includes('90+')) {
    return 'bg-red-600'
  }

  if (normalized.includes('61') || normalized.includes('90')) {
    return 'bg-amber-500'
  }

  if (normalized.includes('31') || normalized.includes('60')) {
    return 'bg-blue-600'
  }

  return 'bg-green-600'
}
</script>

<template>
  <section class="pdsu-updates">
    <!-- KPI kartice -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5 mb-4">
      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.totalUpdateRecords') }}</div>

          <div class="text-2xl font-bold tracking-tight text-ink">
            {{ formatNumber(stats.totalUpdates) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">
            {{ t('pdsu.onComputersCount', { count: formatNumber(stats.computersWithUpdates) }) }}
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.uniqueHotfixPackages') }}</div>

          <div class="text-2xl font-bold tracking-tight text-ink">
            {{ formatNumber(stats.uniqueHotfixes) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">{{ t('pdsu.distinctKbLabels') }}</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.freshnessLast30Days') }}</div>

          <div class="text-2xl font-bold tracking-tight text-good">
            {{ formatNumber(stats.installationsLast30Days ?? freshness.last30Days) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">{{ t('pdsu.freshUpdateRecords') }}</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.freshnessOlderThan90') }}</div>

          <div
            class="text-2xl font-bold tracking-tight"
            :class="Number(freshness.olderThan90Days) > 0 ? 'text-bad' : 'text-good'"
          >
            {{ formatNumber(freshness.olderThan90Days) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">{{ t('pdsu.computersNeedReviewUpdates') }}</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.withoutUpdateData') }}</div>

          <div
            class="text-2xl font-bold tracking-tight"
            :class="Number(freshness.withoutData) > 0 ? 'text-warn' : 'text-ink'"
          >
            {{ formatNumber(freshness.withoutData) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">{{ t('pdsu.computersWithoutUpdateInventory') }}</div>
        </div>
      </div>
    </div>

    <!-- Dodatne statistike -->
    <div class="grid grid-cols-1 gap-3 md:grid-cols-3 mb-4">
      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.avgPerComputer') }}</div>

          <div class="text-lg font-bold text-ink">
            {{ formatNumber(stats.avgPerComputer, 1) }}
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.withoutKbLabel') }}</div>

          <div
            class="text-lg font-bold"
            :class="Number(stats.withoutHotfixId) > 0 ? 'text-warn' : 'text-ink'"
          >
            {{ formatNumber(stats.withoutHotfixId) }}
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.withoutInstallDate') }}</div>

          <div
            class="text-lg font-bold"
            :class="Number(stats.withoutInstalledOn) > 0 ? 'text-warn' : 'text-ink'"
          >
            {{ formatNumber(stats.withoutInstalledOn) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Svežina update-a -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header">
        <h5 class="pdsu-card-title">{{ t('pdsu.updateFreshnessTitle') }}</h5>

        <div class="text-xs text-ink-muted">
          {{ t('pdsu.updateFreshnessHint') }}
        </div>
      </div>

      <div class="p-4">
        <div v-for="item in normalizedFreshnessBuckets" :key="item.key" class="mb-4 last:mb-0">
          <div class="flex items-center justify-between mb-2">
            <span class="font-semibold text-ink">
              {{ item.label }}
            </span>

            <span class="whitespace-nowrap">
              {{ formatNumber(item.count) }}
              ·
              {{ formatNumber(bucketPercent(item.count)) }}%
            </span>
          </div>

          <div class="pdsu-progress">
            <div
              class="pdsu-progress-bar"
              :class="item.barClass"
              :style="{
                width: `${bucketPercent(item.count)}%`,
              }"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Period podataka -->
    <div class="pdsu-card mb-4">
      <div class="p-4">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <div class="text-xs text-ink-muted">{{ t('pdsu.oldestInstalledUpdate') }}</div>

            <div class="font-semibold text-ink">
              {{ formatDate(stats.oldestInstalledOn) }}
            </div>
          </div>

          <div class="md:text-center">
            <div class="text-xs text-ink-muted">{{ t('pdsu.newestInstalledUpdate') }}</div>

            <div class="font-semibold text-ink">
              {{ formatDate(stats.newestInstalledOn) }}
            </div>
          </div>

          <div class="md:text-right">
            <div class="text-xs text-ink-muted">{{ t('pdsu.newestPdsuInventory') }}</div>

            <div class="font-semibold text-ink">
              {{ formatDate(stats.newestInventoryDate, true) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Najčešći hotfix paketi -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header">
        <h5 class="pdsu-card-title">{{ t('pdsu.topHotfixesTitle') }}</h5>

        <div class="text-xs text-ink-muted">
          {{ t('pdsu.rankedByComputersFound') }}
        </div>
      </div>

      <div class="p-4">
        <div v-if="topHotfixes.length === 0" class="text-ink-muted text-center py-4">
          {{ t('pdsu.noHotfixData') }}
        </div>

        <div
          v-for="(item, index) in topHotfixes"
          v-else
          :key="`${item.hotfixId}-${index}`"
          class="mb-5 last:mb-0"
        >
          <div class="flex items-start justify-between gap-3 mb-1">
            <div class="truncate">
              <span class="text-ink-muted mr-2"> {{ index + 1 }}. </span>

              <span class="font-semibold text-ink" :title="item.hotfixId">
                {{ item.hotfixId || t('pdsu.withoutKbLabel') }}
              </span>

              <div
                v-if="item.description"
                class="text-xs text-ink-muted truncate"
                :title="item.description"
              >
                {{ item.description }}
              </div>
            </div>

            <div class="whitespace-nowrap text-right">
              <span class="font-semibold text-ink">
                {{ formatNumber(item.computers) }}
              </span>

              <span class="text-ink-muted text-xs"> {{ t('pdsu.computersSuffix') }} </span>
            </div>
          </div>

          <div class="pdsu-progress">
            <div
              class="pdsu-progress-bar bg-accent"
              :style="{
                width: `${barWidth(item.computers, maxHotfixComputers)}%`,
              }"
            />
          </div>

          <div class="flex items-center justify-between mt-1 text-xs text-ink-muted">
            <span>
              {{ formatNumber(item.installations) }}
              {{ t('pdsu.installationsSuffix') }}
            </span>

            <span>
              {{ t('pdsu.latestLabel') }}
              {{ formatDate(item.latestInstalledOn) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Poslednji update po računaru -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">{{ t('pdsu.lastUpdatePerComputerTitle') }}</h5>

          <div class="text-xs text-ink-muted">{{ t('pdsu.lastUpdatePerComputerHint') }}</div>
        </div>

        <span class="pdsu-badge bg-accent text-white">
          {{ formatNumber(latestUpdateByComputer.length) }}
        </span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>{{ t('metadata.colComputer') }}</th>
              <th>{{ t('common.department') }}</th>
              <th>{{ t('pdsu.colHotfix') }}</th>
              <th>{{ t('pdsu.colDescription') }}</th>
              <th>{{ t('pdsu.colInstalledBy') }}</th>
              <th>{{ t('pdsu.colInstallDate') }}</th>
              <th class="text-center">{{ t('pdsu.colAge') }}</th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="(item, index) in latestUpdateByComputer"
              :key="item.ipEntryId ?? `${item.ip}-${item.hotfixId}-${index}`"
            >
              <td>
                <div class="font-semibold text-ink">
                  {{ item.computerName || t('pdsu.unknownComputer') }}
                </div>

                <div>
                  <code class="pdsu-code">{{ item.ip || '—' }}</code>
                </div>
              </td>

              <td>
                {{ item.department || '—' }}
              </td>

              <td>
                <span class="pdsu-badge bg-surface-sunken text-ink-secondary border border-line">
                  {{ item.hotfixId || t('pdsu.withoutKbLabel') }}
                </span>
              </td>

              <td class="update-description">
                <span :title="item.description">
                  {{ item.description || '—' }}
                </span>
              </td>

              <td>
                {{ item.installedBy || '—' }}
              </td>

              <td>
                {{ formatDate(item.installedOn) }}
              </td>

              <td class="text-center">
                <span class="pdsu-badge" :class="ageBadgeClass(item.installedOn)">
                  {{ ageLabel(item.installedOn) }}
                </span>
              </td>
            </tr>

            <tr v-if="latestUpdateByComputer.length === 0">
              <td colspan="7" class="text-center text-ink-muted py-4">{{ t('pdsu.noResults') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Zastareli računari -->
    <div class="pdsu-card">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">{{ t('pdsu.staleComputersTitle') }}</h5>

          <div class="text-xs text-ink-muted">
            {{ t('pdsu.staleComputersHint') }}
          </div>
        </div>

        <span
          class="pdsu-badge"
          :class="staleUpdateComputers.length > 0 ? 'bg-bad text-white' : 'bg-good text-white'"
        >
          {{ formatNumber(staleUpdateComputers.length) }}
        </span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>{{ t('metadata.colComputer') }}</th>
              <th>{{ t('pdsu.colIpAddress') }}</th>
              <th>{{ t('common.department') }}</th>
              <th>{{ t('pdsu.colLastHotfix') }}</th>
              <th>{{ t('pdsu.colInstallDate') }}</th>
              <th class="text-center">{{ t('pdsu.colAge') }}</th>
              <th>{{ t('pdsu.colInventoryDate') }}</th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="(item, index) in staleUpdateComputers"
              :key="item.ipEntryId ?? `${item.ip}-${item.hotfixId}-${index}`"
            >
              <td class="font-semibold text-ink">
                {{ item.computerName || t('pdsu.unknownComputer') }}
              </td>

              <td>
                <code class="pdsu-code">{{ item.ip || '—' }}</code>
              </td>

              <td>
                {{ item.department || '—' }}
              </td>

              <td>
                <span class="pdsu-badge bg-surface-sunken text-ink-secondary border border-line">
                  {{ item.hotfixId || t('pdsu.withoutKbLabel') }}
                </span>

                <div v-if="item.description" class="text-xs text-ink-muted mt-1">
                  {{ item.description }}
                </div>
              </td>

              <td>
                {{ formatDate(item.installedOn) }}
              </td>

              <td class="text-center">
                <span class="pdsu-badge" :class="ageBadgeClass(item.installedOn)">
                  {{ ageLabel(item.installedOn) }}
                </span>
              </td>

              <td>
                {{ formatDate(item.inventoryDate, true) }}
              </td>
            </tr>

            <tr v-if="staleUpdateComputers.length === 0">
              <td colspan="7" class="text-center text-ink-muted py-4">
                {{ t('pdsu.noStaleComputers') }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
