<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePdsuFormatters } from '@/composables/usePdsuFormatters.js'
import {
  stateLabel,
  stateBadgeClass,
  startModeLabel,
  startModeBadgeClass,
} from '@/utils/pdsuServiceLabels.js'

const { t } = useI18n()

const props = defineProps({
  services: {
    type: Object,
    default: () => ({}),
  },
})

const { formatNumber, formatDate: formatDateBase, splitValues } = usePdsuFormatters()

function formatDate(value) {
  return formatDateBase(value, true)
}

const stats = computed(() => props.services?.stats ?? {})
const tables = computed(() => props.services?.tables ?? {})

const automaticStopped = computed(() => tables.value?.automaticStopped ?? [])

const unusualPaths = computed(() => tables.value?.unusualPaths ?? [])

const rareServices = computed(() => tables.value?.rareServices ?? [])

const totalServices = computed(() => Number(stats.value?.totalServices) || 0)

const runningPercent = computed(() => {
  if (totalServices.value === 0) {
    return 0
  }

  return Math.round(((Number(stats.value?.running) || 0) / totalServices.value) * 100)
})

const stoppedPercent = computed(() => {
  if (totalServices.value === 0) {
    return 0
  }

  return Math.round(((Number(stats.value?.stopped) || 0) / totalServices.value) * 100)
})

function shortenPath(value, maxLength = 90) {
  if (!value) {
    return '—'
  }

  const text = String(value)

  if (text.length <= maxLength) {
    return text
  }

  return `${text.slice(0, maxLength)}…`
}
</script>

<template>
  <section class="pdsu-services">
    <!-- KPI kartice -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5 mb-4">
      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.totalServicesCount') }}</div>

          <div class="text-2xl font-bold tracking-tight text-ink">
            {{ formatNumber(stats.totalServices) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">
            {{ t('pdsu.onComputersCount', { count: formatNumber(stats.computersWithServices) }) }}
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.runningServices') }}</div>

          <div class="text-2xl font-bold tracking-tight text-good">
            {{ formatNumber(stats.running) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">
            {{ t('pdsu.percentOfAllServices', { percent: formatNumber(runningPercent) }) }}
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.stoppedServices') }}</div>

          <div
            class="text-2xl font-bold tracking-tight"
            :class="Number(stats.stopped) > 0 ? 'text-bad' : 'text-ink'"
          >
            {{ formatNumber(stats.stopped) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">
            {{ t('pdsu.percentOfAllServices', { percent: formatNumber(stoppedPercent) }) }}
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.automaticStopped') }}</div>

          <div
            class="text-2xl font-bold tracking-tight"
            :class="Number(stats.automaticStopped) > 0 ? 'text-bad' : 'text-good'"
          >
            {{ formatNumber(stats.automaticStopped) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">{{ t('pdsu.mayNeedReview') }}</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.uniqueServices') }}</div>

          <div class="text-2xl font-bold tracking-tight text-ink">
            {{ formatNumber(stats.uniqueServices) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">{{ t('pdsu.distinctServiceNames') }}</div>
        </div>
      </div>
    </div>

    <!-- Dodatne statistike -->
    <div class="grid grid-cols-1 gap-3 md:grid-cols-3 mb-4">
      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.automaticServices') }}</div>

          <div class="text-lg font-bold text-ink">
            {{ formatNumber(stats.automatic) }}
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.manualStart') }}</div>

          <div class="text-lg font-bold text-ink">
            {{ formatNumber(stats.manual) }}
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.disabledServices') }}</div>

          <div class="text-lg font-bold text-ink">
            {{ formatNumber(stats.disabled) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Status distribucija -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header">
        <h5 class="pdsu-card-title">{{ t('pdsu.serviceStatusTitle') }}</h5>

        <div class="text-xs text-ink-muted">{{ t('pdsu.serviceStatusHint') }}</div>
      </div>

      <div class="p-4">
        <div class="flex items-center justify-between mb-2">
          <span class="font-semibold text-ink"> {{ t('pdsu.running') }} </span>

          <span>
            {{ formatNumber(stats.running) }}
            ·
            {{ formatNumber(runningPercent) }}%
          </span>
        </div>

        <div class="pdsu-progress mb-4">
          <div class="pdsu-progress-bar bg-good" :style="{ width: `${runningPercent}%` }" />
        </div>

        <div class="flex items-center justify-between mb-2">
          <span class="font-semibold text-ink"> {{ t('pdsu.stopped') }} </span>

          <span>
            {{ formatNumber(stats.stopped) }}
            ·
            {{ formatNumber(stoppedPercent) }}%
          </span>
        </div>

        <div class="pdsu-progress">
          <div class="pdsu-progress-bar bg-bad" :style="{ width: `${stoppedPercent}%` }" />
        </div>
      </div>
    </div>

    <!-- Period inventara -->
    <div class="pdsu-card mb-4">
      <div class="p-4">
        <div class="flex flex-col justify-between gap-3 md:flex-row">
          <div>
            <div class="text-xs text-ink-muted">{{ t('pdsu.oldestServiceRecord') }}</div>

            <div class="font-semibold text-ink">
              {{ formatDate(stats.oldestInventoryDate) }}
            </div>
          </div>

          <div class="md:text-right">
            <div class="text-xs text-ink-muted">{{ t('pdsu.newestServiceRecord') }}</div>

            <div class="font-semibold text-ink">
              {{ formatDate(stats.newestInventoryDate) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Automatski servisi koji ne rade -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">{{ t('pdsu.automaticNotRunningTitle') }}</h5>

          <div class="text-xs text-ink-muted">
            {{ t('pdsu.automaticNotRunningHint') }}
          </div>
        </div>

        <span
          class="pdsu-badge"
          :class="automaticStopped.length > 0 ? 'bg-bad text-white' : 'bg-good text-white'"
        >
          {{ formatNumber(automaticStopped.length) }}
        </span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>{{ t('pdsu.colService') }}</th>
              <th>{{ t('metadata.colComputer') }}</th>
              <th>{{ t('pdsu.colAccount') }}</th>
              <th>{{ t('pdsu.colPath') }}</th>
              <th class="text-center">{{ t('pdsu.colStatus') }}</th>
              <th>{{ t('pdsu.colInventoryDate') }}</th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="(item, index) in automaticStopped"
              :key="item.id ?? `${item.ipEntryId}-${item.name}-${index}`"
            >
              <td>
                <div class="font-semibold text-ink">
                  {{ item.displayName || item.name || t('pdsu.unknownService') }}
                </div>

                <div class="text-xs text-ink-muted">
                  {{ item.name || '—' }}
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
                {{ item.startName || '—' }}
              </td>

              <td class="service-path">
                <code class="pdsu-code" :title="item.pathName">
                  {{ shortenPath(item.pathName) }}
                </code>
              </td>

              <td class="text-center">
                <span class="pdsu-badge" :class="stateBadgeClass(item.state)">
                  {{ stateLabel(item.state, t) }}
                </span>
              </td>

              <td>
                {{ formatDate(item.inventoryDate) }}
              </td>
            </tr>

            <tr v-if="automaticStopped.length === 0">
              <td colspan="6" class="text-center text-ink-muted py-4">
                {{ t('pdsu.noAutomaticStopped') }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Neuobičajene putanje -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">{{ t('pdsu.unusualPathsTitle') }}</h5>

          <div class="text-xs text-ink-muted">
            {{ t('pdsu.unusualPathsHint') }}
          </div>
        </div>

        <span class="pdsu-badge bg-warn text-white">
          {{ formatNumber(unusualPaths.length) }}
        </span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>{{ t('pdsu.colService') }}</th>
              <th>{{ t('metadata.colComputer') }}</th>
              <th>{{ t('pdsu.colStartMode') }}</th>
              <th>{{ t('pdsu.colAccount') }}</th>
              <th>{{ t('pdsu.colPath') }}</th>
              <th class="text-center">{{ t('pdsu.colStatus') }}</th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="(item, index) in unusualPaths"
              :key="item.id ?? `${item.ipEntryId}-${item.name}-${index}`"
            >
              <td>
                <div class="font-semibold text-ink">
                  {{ item.displayName || item.name || t('pdsu.unknownService') }}
                </div>

                <div class="text-xs text-ink-muted">
                  {{ item.name || '—' }}
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
                <span class="pdsu-badge" :class="startModeBadgeClass(item.startMode)">
                  {{ startModeLabel(item.startMode, t) }}
                </span>
              </td>

              <td>
                {{ item.startName || '—' }}
              </td>

              <td class="service-path">
                <code class="pdsu-code" :title="item.pathName">
                  {{ shortenPath(item.pathName, 110) }}
                </code>
              </td>

              <td class="text-center">
                <span class="pdsu-badge" :class="stateBadgeClass(item.state)">
                  {{ stateLabel(item.state, t) }}
                </span>
              </td>
            </tr>

            <tr v-if="unusualPaths.length === 0">
              <td colspan="6" class="text-center text-ink-muted py-4">{{ t('pdsu.noResults') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Retki servisi -->
    <div class="pdsu-card">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">{{ t('pdsu.rareServicesTitle') }}</h5>

          <div class="text-xs text-ink-muted">{{ t('pdsu.rareServicesHint') }}</div>
        </div>

        <span class="pdsu-badge bg-ink-muted text-white">
          {{ formatNumber(rareServices.length) }}
        </span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>{{ t('pdsu.colService') }}</th>
              <th>{{ t('pdsu.colStartMode') }}</th>
              <th>{{ t('pdsu.colAccount') }}</th>
              <th class="text-center">{{ t('pdsu.colComputers') }}</th>
              <th>{{ t('pdsu.foundOnShort') }}</th>
              <th>{{ t('pdsu.colPath') }}</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="(item, index) in rareServices" :key="`${item.name}-${index}`">
              <td>
                <div class="font-semibold text-ink">
                  {{ item.displayName || item.name || t('pdsu.unknownService') }}
                </div>

                <div class="text-xs text-ink-muted">
                  {{ item.name || '—' }}
                </div>
              </td>

              <td>
                <span class="pdsu-badge" :class="startModeBadgeClass(item.startMode)">
                  {{ startModeLabel(item.startMode, t) }}
                </span>
              </td>

              <td>
                {{ item.startName || '—' }}
              </td>

              <td class="text-center">
                <span class="pdsu-badge bg-ink-muted text-white">
                  {{ formatNumber(item.computers) }}
                </span>
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

                  <span v-if="splitValues(item.computerNames).length === 0" class="text-ink-muted">
                    {{ t('pdsu.noData') }}
                  </span>
                </div>
              </td>

              <td class="service-path">
                <code class="pdsu-code" :title="item.pathName">
                  {{ shortenPath(item.pathName) }}
                </code>
              </td>
            </tr>

            <tr v-if="rareServices.length === 0">
              <td colspan="6" class="text-center text-ink-muted py-4">{{ t('pdsu.noResults') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
