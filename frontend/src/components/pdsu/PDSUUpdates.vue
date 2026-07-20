<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  updates: {
    type: Object,
    default: () => ({}),
  },
})

const search = ref('')

const stats = computed(() => props.updates?.stats ?? {})
const tables = computed(() => props.updates?.tables ?? {})

const freshness = computed(() => props.updates?.freshness ?? stats.value?.freshness ?? {})

const freshnessBuckets = computed(() => tables.value?.freshnessBuckets ?? [])

const topHotfixes = computed(() => tables.value?.topHotfixes ?? [])

const latestUpdateByComputer = computed(() => tables.value?.latestUpdateByComputer ?? [])

const staleUpdateComputers = computed(() => tables.value?.staleUpdateComputers ?? [])

const normalizedSearch = computed(() => search.value.trim().toLocaleLowerCase('sr-RS'))

const filteredLatestUpdates = computed(() => {
  const query = normalizedSearch.value

  if (!query) {
    return latestUpdateByComputer.value
  }

  return latestUpdateByComputer.value.filter((item) =>
    [item.computerName, item.ip, item.department, item.hotfixId, item.description, item.installedBy]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('sr-RS').includes(query))
  )
})

const filteredStaleComputers = computed(() => {
  const query = normalizedSearch.value

  if (!query) {
    return staleUpdateComputers.value
  }

  return staleUpdateComputers.value.filter((item) =>
    [item.computerName, item.ip, item.department, item.hotfixId, item.description, item.installedBy]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('sr-RS').includes(query))
  )
})

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
      className: item.className ?? freshnessClass(item.bucket ?? item.key ?? item.label),
    }))
  }

  return [
    {
      key: 'last30Days',
      label: 'Poslednjih 30 dana',
      count: Number(freshness.value.last30Days) || 0,
      className: 'bg-success',
    },
    {
      key: 'between31And60Days',
      label: '31–60 dana',
      count: Number(freshness.value.between31And60Days) || 0,
      className: 'bg-primary',
    },
    {
      key: 'between61And90Days',
      label: '61–90 dana',
      count: Number(freshness.value.between61And90Days) || 0,
      className: 'bg-warning',
    },
    {
      key: 'olderThan90Days',
      label: 'Starije od 90 dana',
      count: Number(freshness.value.olderThan90Days) || 0,
      className: 'bg-danger',
    },
    {
      key: 'withoutData',
      label: 'Bez podataka',
      count: Number(freshness.value.withoutData) || 0,
      className: 'bg-secondary',
    },
  ]
})

function cryptoSafeKey(item) {
  return [item.label, item.bucket, item.computers, item.count]
    .filter((value) => value !== undefined && value !== null)
    .join('-')
}

function formatNumber(value, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('sr-RS', {
    maximumFractionDigits,
  }).format(Number(value) || 0)
}

function formatDate(value, includeTime = false) {
  if (!value) {
    return 'Nema podataka'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Nema podataka'
  }

  return new Intl.DateTimeFormat('sr-RS', {
    dateStyle: 'medium',
    ...(includeTime ? { timeStyle: 'short' } : {}),
  }).format(date)
}

function barWidth(value, maximum) {
  const safeValue = Number(value) || 0
  const safeMaximum = Number(maximum) || 1

  return Math.max(safeValue > 0 ? 2 : 0, Math.min(100, (safeValue / safeMaximum) * 100))
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
    return 'text-bg-secondary'
  }

  if (days <= 30) {
    return 'text-bg-success'
  }

  if (days <= 60) {
    return 'text-bg-primary'
  }

  if (days <= 90) {
    return 'text-bg-warning'
  }

  return 'text-bg-danger'
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
    return 'bg-secondary'
  }

  if (normalized.includes('older') || normalized.includes('stale') || normalized.includes('90+')) {
    return 'bg-danger'
  }

  if (normalized.includes('61') || normalized.includes('90')) {
    return 'bg-warning'
  }

  if (normalized.includes('31') || normalized.includes('60')) {
    return 'bg-primary'
  }

  return 'bg-success'
}
</script>

<template>
  <section class="pdsu-updates">
    <!-- KPI kartice -->
    <div class="row g-3 mb-4">
      <div class="col-sm-6 col-xl">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Ukupno update zapisa</div>

            <div class="fs-2 fw-semibold">
              {{ formatNumber(stats.totalUpdates) }}
            </div>

            <div class="small text-muted mt-2">
              Na
              {{ formatNumber(stats.computersWithUpdates) }}
              računara
            </div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Jedinstveni hotfix paketi</div>

            <div class="fs-2 fw-semibold">
              {{ formatNumber(stats.uniqueHotfixes) }}
            </div>

            <div class="small text-muted mt-2">Različitih KB oznaka</div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Poslednjih 30 dana</div>

            <div class="fs-2 fw-semibold text-success">
              {{ formatNumber(stats.installationsLast30Days ?? freshness.last30Days) }}
            </div>

            <div class="small text-muted mt-2">Svežih update zapisa</div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Starije od 90 dana</div>

            <div
              class="fs-2 fw-semibold"
              :class="{
                'text-danger': Number(freshness.olderThan90Days) > 0,
                'text-success': Number(freshness.olderThan90Days) === 0,
              }"
            >
              {{ formatNumber(freshness.olderThan90Days) }}
            </div>

            <div class="small text-muted mt-2">Računara koji zahtevaju proveru</div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Bez update podataka</div>

            <div
              class="fs-2 fw-semibold"
              :class="{
                'text-warning': Number(freshness.withoutData) > 0,
              }"
            >
              {{ formatNumber(freshness.withoutData) }}
            </div>

            <div class="small text-muted mt-2">Računara bez inventara update-a</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Dodatne statistike -->
    <div class="row g-3 mb-4">
      <div class="col-md-4">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Prosek po računaru</div>

            <div class="fs-4 fw-semibold">
              {{ formatNumber(stats.avgPerComputer, 1) }}
            </div>

            <div class="small text-muted mt-2">Update zapisa po računaru</div>
          </div>
        </div>
      </div>

      <div class="col-md-4">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Bez KB oznake</div>

            <div
              class="fs-4 fw-semibold"
              :class="{
                'text-warning': Number(stats.withoutHotfixId) > 0,
              }"
            >
              {{ formatNumber(stats.withoutHotfixId) }}
            </div>
          </div>
        </div>
      </div>

      <div class="col-md-4">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Bez datuma instalacije</div>

            <div
              class="fs-4 fw-semibold"
              :class="{
                'text-warning': Number(stats.withoutInstalledOn) > 0,
              }"
            >
              {{ formatNumber(stats.withoutInstalledOn) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Svežina update-a -->
    <div class="card border-0 shadow-sm mb-4">
      <div class="card-header bg-body">
        <h5 class="mb-1">Svežina poslednjeg update-a</h5>

        <div class="text-muted small">
          Raspodela računara prema datumu poslednjeg instaliranog update-a
        </div>
      </div>

      <div class="card-body">
        <div v-for="item in normalizedFreshnessBuckets" :key="item.key" class="freshness-row">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="fw-semibold">
              {{ item.label }}
            </span>

            <span class="text-nowrap">
              {{ formatNumber(item.count) }}
              ·
              {{ formatNumber(bucketPercent(item.count)) }}%
            </span>
          </div>

          <div class="progress">
            <div
              class="progress-bar"
              :class="item.className"
              :style="{
                width: `${bucketPercent(item.count)}%`,
              }"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Period podataka -->
    <div class="card border-0 shadow-sm mb-4">
      <div class="card-body">
        <div class="row g-3">
          <div class="col-md-4">
            <div class="text-muted small">Najstariji instalirani update</div>

            <div class="fw-semibold">
              {{ formatDate(stats.oldestInstalledOn) }}
            </div>
          </div>

          <div class="col-md-4 text-md-center">
            <div class="text-muted small">Najnoviji instalirani update</div>

            <div class="fw-semibold">
              {{ formatDate(stats.newestInstalledOn) }}
            </div>
          </div>

          <div class="col-md-4 text-md-end">
            <div class="text-muted small">Najnoviji PDSU inventar</div>

            <div class="fw-semibold">
              {{ formatDate(stats.newestInventoryDate, true) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Najčešći hotfix paketi -->
    <div class="card border-0 shadow-sm mb-4">
      <div class="card-header bg-body">
        <h5 class="mb-1">Najzastupljeniji hotfix paketi</h5>

        <div class="text-muted small">
          Rangirano prema broju računara na kojima je paket pronađen
        </div>
      </div>

      <div class="card-body">
        <div v-if="topHotfixes.length === 0" class="text-muted text-center py-4">
          Nema podataka o hotfix paketima.
        </div>

        <div
          v-for="(item, index) in topHotfixes"
          v-else
          :key="`${item.hotfixId}-${index}`"
          class="hotfix-bar-row"
        >
          <div class="d-flex justify-content-between align-items-start gap-3 mb-1">
            <div class="text-truncate">
              <span class="text-muted me-2"> {{ index + 1 }}. </span>

              <span class="fw-semibold" :title="item.hotfixId">
                {{ item.hotfixId || 'Bez KB oznake' }}
              </span>

              <div
                v-if="item.description"
                class="small text-muted text-truncate"
                :title="item.description"
              >
                {{ item.description }}
              </div>
            </div>

            <div class="text-nowrap text-end">
              <span class="fw-semibold">
                {{ formatNumber(item.computers) }}
              </span>

              <span class="text-muted small"> računara </span>
            </div>
          </div>

          <div class="progress">
            <div
              class="progress-bar bg-primary"
              :style="{
                width: `${barWidth(item.computers, maxHotfixComputers)}%`,
              }"
            />
          </div>

          <div class="d-flex justify-content-between mt-1 small text-muted">
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

    <!-- Pretraga -->
    <div class="card border-0 shadow-sm mb-4">
      <div
        class="card-body d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3"
      >
        <div>
          <h5 class="mb-1">Detaljna analiza update-a</h5>

          <div class="text-muted small">
            Pretraga se primenjuje na tabele poslednjih i zastarelih update-a.
          </div>
        </div>

        <div class="update-search">
          <input
            v-model="search"
            type="search"
            class="form-control"
            placeholder="Pretraži računar, IP, KB paket..."
          />
        </div>
      </div>
    </div>

    <!-- Poslednji update po računaru -->
    <div class="card border-0 shadow-sm mb-4">
      <div class="card-header bg-body d-flex justify-content-between align-items-center gap-3">
        <div>
          <h5 class="mb-1">Poslednji update po računaru</h5>

          <div class="text-muted small">Najnoviji pronađeni hotfix za svaki računar</div>
        </div>

        <span class="badge text-bg-primary">
          {{ formatNumber(filteredLatestUpdates.length) }}
        </span>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
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
              v-for="(item, index) in filteredLatestUpdates"
              :key="item.ipEntryId ?? `${item.ip}-${item.hotfixId}-${index}`"
            >
              <td>
                <div class="fw-semibold">
                  {{ item.computerName || 'Nepoznat računar' }}
                </div>

                <div class="small">
                  <code>{{ item.ip || '—' }}</code>
                </div>
              </td>

              <td>
                {{ item.department || '—' }}
              </td>

              <td>
                <span class="badge text-bg-light border">
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
                <span class="badge" :class="ageBadgeClass(item.installedOn)">
                  {{ ageLabel(item.installedOn) }}
                </span>
              </td>
            </tr>

            <tr v-if="filteredLatestUpdates.length === 0">
              <td colspan="7" class="text-center text-muted py-4">Nema rezultata.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Zastareli računari -->
    <div class="card border-0 shadow-sm">
      <div class="card-header bg-body d-flex justify-content-between align-items-center gap-3">
        <div>
          <h5 class="mb-1">Računari sa zastarelim update podacima</h5>

          <div class="text-muted small">
            Računari čiji je poslednji pronađeni update stariji od 90 dana ili nedostaje datum
          </div>
        </div>

        <span
          class="badge"
          :class="filteredStaleComputers.length > 0 ? 'text-bg-danger' : 'text-bg-success'"
        >
          {{ formatNumber(filteredStaleComputers.length) }}
        </span>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
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
              v-for="(item, index) in filteredStaleComputers"
              :key="item.ipEntryId ?? `${item.ip}-${item.hotfixId}-${index}`"
            >
              <td class="fw-semibold">
                {{ item.computerName || 'Nepoznat računar' }}
              </td>

              <td>
                <code>{{ item.ip || '—' }}</code>
              </td>

              <td>
                {{ item.department || '—' }}
              </td>

              <td>
                <span class="badge text-bg-light border">
                  {{ item.hotfixId || 'Bez KB oznake' }}
                </span>

                <div v-if="item.description" class="small text-muted mt-1">
                  {{ item.description }}
                </div>
              </td>

              <td>
                {{ formatDate(item.installedOn) }}
              </td>

              <td class="text-center">
                <span class="badge" :class="ageBadgeClass(item.installedOn)">
                  {{ ageLabel(item.installedOn) }}
                </span>
              </td>

              <td>
                {{ formatDate(item.inventoryDate, true) }}
              </td>
            </tr>

            <tr v-if="filteredStaleComputers.length === 0">
              <td colspan="7" class="text-center text-muted py-4">
                Nema računara sa zastarelim update podacima.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>