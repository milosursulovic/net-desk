<script setup>
import { computed } from 'vue'
import { usePdsuFormatters } from '@/composables/usePdsuFormatters.js'

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
      label: 'Poslednjih 30 dana',
      count: Number(freshness.value.last30Days) || 0,
      barClass: 'bg-green-600',
    },
    {
      key: 'between31And60Days',
      label: '31–60 dana',
      count: Number(freshness.value.between31And60Days) || 0,
      barClass: 'bg-blue-600',
    },
    {
      key: 'between61And90Days',
      label: '61–90 dana',
      count: Number(freshness.value.between61And90Days) || 0,
      barClass: 'bg-amber-500',
    },
    {
      key: 'olderThan90Days',
      label: 'Starije od 90 dana',
      count: Number(freshness.value.olderThan90Days) || 0,
      barClass: 'bg-red-600',
    },
    {
      key: 'withoutData',
      label: 'Bez podataka',
      count: Number(freshness.value.withoutData) || 0,
      barClass: 'bg-slate-500',
    },
  ]
})

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
    return 'bg-slate-500 text-white'
  }

  if (days <= 30) {
    return 'bg-green-600 text-white'
  }

  if (days <= 60) {
    return 'bg-blue-600 text-white'
  }

  if (days <= 90) {
    return 'bg-amber-500 text-amber-950'
  }

  return 'bg-red-600 text-white'
}

function ageLabel(value) {
  const days = daysSince(value)

  if (days === null) {
    return 'Bez podataka'
  }

  if (days === 0) {
    return 'Danas'
  }

  if (days === 1) {
    return 'Pre 1 dan'
  }

  return `Pre ${formatNumber(days)} dana`
}

function freshnessLabel(value) {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')

  if (normalized.includes('30') || normalized.includes('fresh')) {
    return 'Poslednjih 30 dana'
  }

  if (normalized.includes('31') || normalized.includes('60')) {
    return '31–60 dana'
  }

  if (normalized.includes('61') || normalized.includes('90')) {
    return '61–90 dana'
  }

  if (normalized.includes('older') || normalized.includes('stale')) {
    return 'Starije od 90 dana'
  }

  if (normalized.includes('without') || normalized.includes('missing')) {
    return 'Bez podataka'
  }

  return value || 'Nepoznato'
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
          <div class="text-xs text-slate-500 mb-1">Ukupno update zapisa</div>

          <div class="text-2xl font-bold tracking-tight text-slate-900">
            {{ formatNumber(stats.totalUpdates) }}
          </div>

          <div class="text-xs text-slate-500 mt-2">
            Na
            {{ formatNumber(stats.computersWithUpdates) }}
            računara
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Jedinstveni hotfix paketi</div>

          <div class="text-2xl font-bold tracking-tight text-slate-900">
            {{ formatNumber(stats.uniqueHotfixes) }}
          </div>

          <div class="text-xs text-slate-500 mt-2">Različitih KB oznaka</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Poslednjih 30 dana</div>

          <div class="text-2xl font-bold tracking-tight text-green-600">
            {{ formatNumber(stats.installationsLast30Days ?? freshness.last30Days) }}
          </div>

          <div class="text-xs text-slate-500 mt-2">Svežih update zapisa</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Starije od 90 dana</div>

          <div
            class="text-2xl font-bold tracking-tight"
            :class="Number(freshness.olderThan90Days) > 0 ? 'text-red-600' : 'text-green-600'"
          >
            {{ formatNumber(freshness.olderThan90Days) }}
          </div>

          <div class="text-xs text-slate-500 mt-2">Računara koji zahtevaju proveru</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Bez update podataka</div>

          <div
            class="text-2xl font-bold tracking-tight"
            :class="Number(freshness.withoutData) > 0 ? 'text-amber-600' : 'text-slate-900'"
          >
            {{ formatNumber(freshness.withoutData) }}
          </div>

          <div class="text-xs text-slate-500 mt-2">Računara bez inventara update-a</div>
        </div>
      </div>
    </div>

    <!-- Dodatne statistike -->
    <div class="grid grid-cols-1 gap-3 md:grid-cols-3 mb-4">
      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Prosek po računaru</div>

          <div class="text-lg font-bold text-slate-900">
            {{ formatNumber(stats.avgPerComputer, 1) }}
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Bez KB oznake</div>

          <div
            class="text-lg font-bold"
            :class="Number(stats.withoutHotfixId) > 0 ? 'text-amber-600' : 'text-slate-900'"
          >
            {{ formatNumber(stats.withoutHotfixId) }}
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Bez datuma instalacije</div>

          <div
            class="text-lg font-bold"
            :class="Number(stats.withoutInstalledOn) > 0 ? 'text-amber-600' : 'text-slate-900'"
          >
            {{ formatNumber(stats.withoutInstalledOn) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Svežina update-a -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header">
        <h5 class="pdsu-card-title">Svežina poslednjeg update-a</h5>

        <div class="text-xs text-slate-500">
          Raspodela računara prema datumu poslednjeg instaliranog update-a
        </div>
      </div>

      <div class="p-4">
        <div v-for="item in normalizedFreshnessBuckets" :key="item.key" class="mb-4 last:mb-0">
          <div class="flex items-center justify-between mb-2">
            <span class="font-semibold text-slate-900">
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
            <div class="text-xs text-slate-500">Najstariji instalirani update</div>

            <div class="font-semibold text-slate-900">
              {{ formatDate(stats.oldestInstalledOn) }}
            </div>
          </div>

          <div class="md:text-center">
            <div class="text-xs text-slate-500">Najnoviji instalirani update</div>

            <div class="font-semibold text-slate-900">
              {{ formatDate(stats.newestInstalledOn) }}
            </div>
          </div>

          <div class="md:text-right">
            <div class="text-xs text-slate-500">Najnoviji PDSU inventar</div>

            <div class="font-semibold text-slate-900">
              {{ formatDate(stats.newestInventoryDate, true) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Najčešći hotfix paketi -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header">
        <h5 class="pdsu-card-title">Najzastupljeniji hotfix paketi</h5>

        <div class="text-xs text-slate-500">
          Rangirano prema broju računara na kojima je paket pronađen
        </div>
      </div>

      <div class="p-4">
        <div v-if="topHotfixes.length === 0" class="text-slate-500 text-center py-4">
          Nema podataka o hotfix paketima.
        </div>

        <div
          v-for="(item, index) in topHotfixes"
          v-else
          :key="`${item.hotfixId}-${index}`"
          class="mb-5 last:mb-0"
        >
          <div class="flex items-start justify-between gap-3 mb-1">
            <div class="truncate">
              <span class="text-slate-500 mr-2"> {{ index + 1 }}. </span>

              <span class="font-semibold text-slate-900" :title="item.hotfixId">
                {{ item.hotfixId || 'Bez KB oznake' }}
              </span>

              <div
                v-if="item.description"
                class="text-xs text-slate-500 truncate"
                :title="item.description"
              >
                {{ item.description }}
              </div>
            </div>

            <div class="whitespace-nowrap text-right">
              <span class="font-semibold text-slate-900">
                {{ formatNumber(item.computers) }}
              </span>

              <span class="text-slate-500 text-xs"> računara </span>
            </div>
          </div>

          <div class="pdsu-progress">
            <div
              class="pdsu-progress-bar bg-blue-600"
              :style="{
                width: `${barWidth(item.computers, maxHotfixComputers)}%`,
              }"
            />
          </div>

          <div class="flex items-center justify-between mt-1 text-xs text-slate-500">
            <span>
              {{ formatNumber(item.installations) }}
              instalacija
            </span>

            <span>
              Poslednja:
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
          <h5 class="pdsu-card-title">Poslednji update po računaru</h5>

          <div class="text-xs text-slate-500">Najnoviji pronađeni hotfix za svaki računar</div>
        </div>

        <span class="pdsu-badge bg-blue-600 text-white">
          {{ formatNumber(latestUpdateByComputer.length) }}
        </span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>Računar</th>
              <th>Odeljenje</th>
              <th>Hotfix</th>
              <th>Opis</th>
              <th>Instalirao</th>
              <th>Datum instalacije</th>
              <th class="text-center">Starost</th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="(item, index) in latestUpdateByComputer"
              :key="item.ipEntryId ?? `${item.ip}-${item.hotfixId}-${index}`"
            >
              <td>
                <div class="font-semibold text-slate-900">
                  {{ item.computerName || 'Nepoznat računar' }}
                </div>

                <div>
                  <code class="pdsu-code">{{ item.ip || '—' }}</code>
                </div>
              </td>

              <td>
                {{ item.department || '—' }}
              </td>

              <td>
                <span class="pdsu-badge bg-slate-100 text-slate-700 border border-slate-200">
                  {{ item.hotfixId || 'Bez KB oznake' }}
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
              <td colspan="7" class="text-center text-slate-500 py-4">Nema rezultata.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Zastareli računari -->
    <div class="pdsu-card">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">Računari sa zastarelim update podacima</h5>

          <div class="text-xs text-slate-500">
            Računari čiji je poslednji pronađeni update stariji od 90 dana ili nedostaje datum
          </div>
        </div>

        <span
          class="pdsu-badge"
          :class="staleUpdateComputers.length > 0 ? 'bg-red-600 text-white' : 'bg-green-600 text-white'"
        >
          {{ formatNumber(staleUpdateComputers.length) }}
        </span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>Računar</th>
              <th>IP adresa</th>
              <th>Odeljenje</th>
              <th>Poslednji hotfix</th>
              <th>Datum instalacije</th>
              <th class="text-center">Starost</th>
              <th>Datum inventara</th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="(item, index) in staleUpdateComputers"
              :key="item.ipEntryId ?? `${item.ip}-${item.hotfixId}-${index}`"
            >
              <td class="font-semibold text-slate-900">
                {{ item.computerName || 'Nepoznat računar' }}
              </td>

              <td>
                <code class="pdsu-code">{{ item.ip || '—' }}</code>
              </td>

              <td>
                {{ item.department || '—' }}
              </td>

              <td>
                <span class="pdsu-badge bg-slate-100 text-slate-700 border border-slate-200">
                  {{ item.hotfixId || 'Bez KB oznake' }}
                </span>

                <div v-if="item.description" class="text-xs text-slate-500 mt-1">
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
              <td colspan="7" class="text-center text-slate-500 py-4">
                Nema računara sa zastarelim update podacima.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
