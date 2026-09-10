<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePdsuFormatters } from '@/composables/usePdsuFormatters.js'

const { t } = useI18n()
const props = defineProps({
  software: {
    type: Object,
    default: () => ({}),
  },
})

const { formatNumber, formatDate: formatDateBase, barWidth, splitValues } = usePdsuFormatters()

function formatDate(value) {
  return formatDateBase(value, true)
}

const stats = computed(() => props.software?.stats ?? {})
const tables = computed(() => props.software?.tables ?? {})

const topSoftware = computed(() => tables.value?.topSoftware ?? [])

const topPublishers = computed(() => tables.value?.topPublishers ?? [])

const multipleVersions = computed(() => tables.value?.multipleVersions ?? [])

const rareSoftware = computed(() => tables.value?.rareSoftware ?? [])

const computersWithMostSoftware = computed(() => tables.value?.computersWithMostSoftware ?? [])

const maxTopSoftwareComputers = computed(() => {
  return Math.max(...topSoftware.value.map((item) => Number(item.computers) || 0), 1)
})

const maxPublisherInstallations = computed(() => {
  return Math.max(...topPublishers.value.map((item) => Number(item.installations) || 0), 1)
})

</script>

<template>
  <section class="pdsu-software">
    <!-- KPI kartice -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5 mb-4">
      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.totalInstallations') }}</div>

          <div class="text-2xl font-bold tracking-tight text-ink">
            {{ formatNumber(stats.totalInstallations) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">
            {{ t('pdsu.onComputersCount', { count: formatNumber(stats.computersWithSoftware) }) }}
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.uniqueSoftware') }}</div>

          <div class="text-2xl font-bold tracking-tight text-ink">
            {{ formatNumber(stats.uniqueSoftware) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">{{ t('pdsu.distinctSoftwareNames') }}</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.avgPerComputer') }}</div>

          <div class="text-2xl font-bold tracking-tight text-ink">
            {{ formatNumber(stats.avgPerComputer, 1) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">{{ t('pdsu.installationsPerComputer') }}</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.withoutPublisher') }}</div>

          <div
            class="text-2xl font-bold tracking-tight"
            :class="Number(stats.withoutPublisher) > 0 ? 'text-warn' : 'text-ink'"
          >
            {{ formatNumber(stats.withoutPublisher) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">{{ t('pdsu.recordsWithoutPublisher') }}</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.withoutVersion') }}</div>

          <div
            class="text-2xl font-bold tracking-tight"
            :class="Number(stats.withoutVersion) > 0 ? 'text-warn' : 'text-ink'"
          >
            {{ formatNumber(stats.withoutVersion) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">{{ t('pdsu.recordsWithoutVersion') }}</div>
        </div>
      </div>
    </div>

    <!-- Period prikupljanja -->
    <div class="pdsu-card mb-4">
      <div class="p-4">
        <div class="flex flex-col justify-between gap-3 md:flex-row">
          <div>
            <div class="text-xs text-ink-muted">{{ t('pdsu.oldestSoftwareRecord') }}</div>

            <div class="font-semibold text-ink">
              {{ formatDate(stats.oldestInventoryDate) }}
            </div>
          </div>

          <div class="md:text-right">
            <div class="text-xs text-ink-muted">{{ t('pdsu.newestSoftwareRecord') }}</div>

            <div class="font-semibold text-ink">
              {{ formatDate(stats.newestInventoryDate) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Top programi i izdavači -->
    <div class="grid grid-cols-1 gap-4 xl:grid-cols-12 mb-4">
      <div class="xl:col-span-7">
        <div class="pdsu-card h-full">
          <div class="pdsu-card-header">
            <h5 class="pdsu-card-title">{{ t('pdsu.topSoftwareTitle') }}</h5>

            <div class="text-xs text-ink-muted">{{ t('pdsu.rankedByComputerCount') }}</div>
          </div>

          <div class="p-4">
            <div v-if="topSoftware.length === 0" class="text-ink-muted text-center py-4">
              {{ t('pdsu.noSoftwareData') }}
            </div>

            <div
              v-for="(item, index) in topSoftware"
              v-else
              :key="`${item.name}-${index}`"
              class="mb-5 last:mb-0"
            >
              <div class="flex items-start justify-between gap-3 mb-1">
                <div class="truncate">
                  <span class="text-ink-muted mr-2"> {{ index + 1 }}. </span>

                  <span class="font-semibold text-ink" :title="item.name">
                    {{ item.name }}
                  </span>
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
                    width: `${barWidth(item.computers, maxTopSoftwareComputers)}%`,
                  }"
                />
              </div>

              <div class="flex items-center justify-between mt-1 text-xs text-ink-muted">
                <span>
                  {{ formatNumber(item.installations) }}
                  {{ t('pdsu.installationsSuffix') }}
                </span>

                <span>
                  {{ formatNumber(item.versions) }}
                  {{ t('pdsu.versionsSuffix') }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="xl:col-span-5">
        <div class="pdsu-card h-full">
          <div class="pdsu-card-header">
            <h5 class="pdsu-card-title">{{ t('pdsu.topPublishersTitle') }}</h5>

            <div class="text-xs text-ink-muted">{{ t('pdsu.rankedByInstallCount') }}</div>
          </div>

          <div class="p-4">
            <div v-if="topPublishers.length === 0" class="text-ink-muted text-center py-4">
              {{ t('pdsu.noPublisherData') }}
            </div>

            <div
              v-for="(item, index) in topPublishers"
              v-else
              :key="`${item.publisher}-${index}`"
              class="mb-5 last:mb-0"
            >
              <div class="flex items-start justify-between gap-3 mb-1">
                <div class="font-semibold text-ink truncate" :title="item.publisher">
                  {{ item.publisher }}
                </div>

                <div class="whitespace-nowrap font-semibold text-ink">
                  {{ formatNumber(item.installations) }}
                </div>
              </div>

              <div class="pdsu-progress">
                <div
                  class="pdsu-progress-bar bg-ink-muted"
                  :style="{
                    width: `${barWidth(item.installations, maxPublisherInstallations)}%`,
                  }"
                />
              </div>

              <div class="flex items-center justify-between mt-1 text-xs text-ink-muted">
                <span>
                  {{ formatNumber(item.computers) }}
                  {{ t('pdsu.computersSuffix') }}
                </span>

                <span>
                  {{ formatNumber(item.softwareCount) }}
                  {{ t('pdsu.softwareSuffix') }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Programi sa više verzija -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">{{ t('pdsu.multipleVersionsTitle') }}</h5>

          <div class="text-xs text-ink-muted">
            {{ t('pdsu.multipleVersionsHint') }}
          </div>
        </div>

        <span class="pdsu-badge bg-accent text-white">
          {{ formatNumber(multipleVersions.length) }}
        </span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>{{ t('pdsu.colProgram') }}</th>
              <th class="text-center">{{ t('pdsu.colVersionCount') }}</th>
              <th class="text-center">{{ t('pdsu.colComputers') }}</th>
              <th>{{ t('pdsu.colFoundVersions') }}</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="(item, index) in multipleVersions" :key="`${item.name}-${index}`">
              <td class="font-semibold text-ink">
                {{ item.name }}
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
              <td colspan="4" class="text-center text-ink-muted py-4">{{ t('pdsu.noResults') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Retki programi -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">{{ t('pdsu.rareSoftwareTitle') }}</h5>

          <div class="text-xs text-ink-muted">{{ t('pdsu.rareSoftwareHint') }}</div>
        </div>

        <span class="pdsu-badge bg-ink-muted text-white">
          {{ formatNumber(rareSoftware.length) }}
        </span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>{{ t('pdsu.colProgram') }}</th>
              <th>{{ t('pdsu.colVersion') }}</th>
              <th>{{ t('pdsu.colPublisher') }}</th>
              <th class="text-center">{{ t('pdsu.colComputers') }}</th>
              <th>{{ t('pdsu.foundOn') }}</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="(item, index) in rareSoftware" :key="`${item.name}-${index}`">
              <td class="font-semibold text-ink">
                {{ item.name }}
              </td>

              <td>
                {{ item.version || '—' }}
              </td>

              <td>
                {{ item.publisher || t('pdsu.unknownPublisher') }}
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
            </tr>

            <tr v-if="rareSoftware.length === 0">
              <td colspan="5" class="text-center text-ink-muted py-4">{{ t('pdsu.noResults') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Računari sa najviše programa -->
    <div class="pdsu-card">
      <div class="pdsu-card-header flex items-center justify-between">
        <div>
          <h5 class="pdsu-card-title">{{ t('pdsu.computersWithMostSoftware') }}</h5>

          <div class="text-xs text-ink-muted">{{ t('pdsu.rankedByInstalledCount') }}</div>
        </div>

        <span class="pdsu-badge bg-ink text-white">
          Top
          {{ formatNumber(computersWithMostSoftware.length) }}
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
              <th class="text-center">{{ t('pdsu.colSoftwareCount') }}</th>
              <th>{{ t('pdsu.colInventoryDate') }}</th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="(item, index) in computersWithMostSoftware"
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
                <span class="pdsu-badge bg-accent text-white">
                  {{ formatNumber(item.softwareCount) }}
                </span>
              </td>

              <td>
                {{ formatDate(item.inventoryDate) }}
              </td>
            </tr>

            <tr v-if="computersWithMostSoftware.length === 0">
              <td colspan="6" class="text-center text-ink-muted py-4">{{ t('pdsu.noData') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
