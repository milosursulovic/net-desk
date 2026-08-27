<script setup>
import { computed } from 'vue'
import { usePdsuFormatters } from '@/composables/usePdsuFormatters.js'

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
          <div class="text-xs text-ink-muted mb-1">Ukupno instalacija</div>

          <div class="text-2xl font-bold tracking-tight text-ink">
            {{ formatNumber(stats.totalInstallations) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">
            Na
            {{ formatNumber(stats.computersWithSoftware) }}
            računara
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">Jedinstvenih programa</div>

          <div class="text-2xl font-bold tracking-tight text-ink">
            {{ formatNumber(stats.uniqueSoftware) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">Različitih naziva programa</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">Prosek po računaru</div>

          <div class="text-2xl font-bold tracking-tight text-ink">
            {{ formatNumber(stats.avgPerComputer, 1) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">Instalacija po računaru</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">Bez izdavača</div>

          <div
            class="text-2xl font-bold tracking-tight"
            :class="Number(stats.withoutPublisher) > 0 ? 'text-warn' : 'text-ink'"
          >
            {{ formatNumber(stats.withoutPublisher) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">Zapisa bez publisher podatka</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-ink-muted mb-1">Bez verzije</div>

          <div
            class="text-2xl font-bold tracking-tight"
            :class="Number(stats.withoutVersion) > 0 ? 'text-warn' : 'text-ink'"
          >
            {{ formatNumber(stats.withoutVersion) }}
          </div>

          <div class="text-xs text-ink-muted mt-2">Zapisa bez verzije programa</div>
        </div>
      </div>
    </div>

    <!-- Period prikupljanja -->
    <div class="pdsu-card mb-4">
      <div class="p-4">
        <div class="flex flex-col justify-between gap-3 md:flex-row">
          <div>
            <div class="text-xs text-ink-muted">Najstariji PDSU zapis programa</div>

            <div class="font-semibold text-ink">
              {{ formatDate(stats.oldestInventoryDate) }}
            </div>
          </div>

          <div class="md:text-right">
            <div class="text-xs text-ink-muted">Najnoviji PDSU zapis programa</div>

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
            <h5 class="pdsu-card-title">Najzastupljeniji programi</h5>

            <div class="text-xs text-ink-muted">Rangirano prema broju računara</div>
          </div>

          <div class="p-4">
            <div v-if="topSoftware.length === 0" class="text-ink-muted text-center py-4">
              Nema podataka o programima.
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

                  <span class="text-ink-muted text-xs"> računara </span>
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
                  instalacija
                </span>

                <span>
                  {{ formatNumber(item.versions) }}
                  verzija
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="xl:col-span-5">
        <div class="pdsu-card h-full">
          <div class="pdsu-card-header">
            <h5 class="pdsu-card-title">Najzastupljeniji izdavači</h5>

            <div class="text-xs text-ink-muted">Prema ukupnom broju instalacija</div>
          </div>

          <div class="p-4">
            <div v-if="topPublishers.length === 0" class="text-ink-muted text-center py-4">
              Nema podataka o izdavačima.
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
                  računara
                </span>

                <span>
                  {{ formatNumber(item.softwareCount) }}
                  programa
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
          <h5 class="pdsu-card-title">Programi sa više verzija</h5>

          <div class="text-xs text-ink-muted">
            Programi kod kojih je pronađeno više različitih verzija
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
              <th>Program</th>
              <th class="text-center">Broj verzija</th>
              <th class="text-center">Računari</th>
              <th>Pronađene verzije</th>
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
                    Nema podatka
                  </span>
                </div>
              </td>
            </tr>

            <tr v-if="multipleVersions.length === 0">
              <td colspan="4" class="text-center text-ink-muted py-4">Nema rezultata.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Retki programi -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">Retki programi</h5>

          <div class="text-xs text-ink-muted">Programi pronađeni na najviše dva računara</div>
        </div>

        <span class="pdsu-badge bg-ink-muted text-white">
          {{ formatNumber(rareSoftware.length) }}
        </span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>Program</th>
              <th>Verzija</th>
              <th>Izdavač</th>
              <th class="text-center">Računari</th>
              <th>Pronađen na</th>
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
                {{ item.publisher || 'Nepoznat izdavač' }}
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
                    Nema podatka
                  </span>
                </div>
              </td>
            </tr>

            <tr v-if="rareSoftware.length === 0">
              <td colspan="5" class="text-center text-ink-muted py-4">Nema rezultata.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Računari sa najviše programa -->
    <div class="pdsu-card">
      <div class="pdsu-card-header flex items-center justify-between">
        <div>
          <h5 class="pdsu-card-title">Računari sa najviše programa</h5>

          <div class="text-xs text-ink-muted">Rangirano prema broju instaliranih programa</div>
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
              <th>Računar</th>
              <th>IP adresa</th>
              <th>Odeljenje</th>
              <th class="text-center">Broj programa</th>
              <th>Datum inventara</th>
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
                {{ item.computerName || 'Nepoznat računar' }}
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
              <td colspan="6" class="text-center text-ink-muted py-4">Nema podataka.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
