<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  drivers: {
    type: Object,
    default: () => ({}),
  },
})

const search = ref('')

const stats = computed(() => props.drivers?.stats ?? {})
const tables = computed(() => props.drivers?.tables ?? {})

const topManufacturers = computed(() => tables.value?.topManufacturers ?? [])

const oldestDrivers = computed(() => tables.value?.oldestDrivers ?? [])

const multipleVersions = computed(() => tables.value?.multipleVersions ?? [])

const computersWithMostDrivers = computed(() => tables.value?.computersWithMostDrivers ?? [])

const normalizedSearch = computed(() => search.value.trim().toLocaleLowerCase('sr-RS'))

const filteredOldestDrivers = computed(() => {
  const query = normalizedSearch.value

  if (!query) {
    return oldestDrivers.value
  }

  return oldestDrivers.value.filter((item) =>
    [
      item.computerName,
      item.ip,
      item.department,
      item.deviceName,
      item.driverVersion,
      item.manufacturer,
      item.driverProviderName,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('sr-RS').includes(query))
  )
})

const filteredMultipleVersions = computed(() => {
  const query = normalizedSearch.value

  if (!query) {
    return multipleVersions.value
  }

  return multipleVersions.value.filter((item) =>
    [item.deviceName, item.manufacturer, item.versions]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('sr-RS').includes(query))
  )
})

const maxManufacturerDrivers = computed(() => {
  return Math.max(...topManufacturers.value.map((item) => Number(item.drivers) || 0), 1)
})

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

  return Math.max(2, Math.min(100, (safeValue / safeMaximum) * 100))
}

function splitValues(value) {
  if (!value) {
    return []
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function driverAgeClass(value) {
  if (!value) {
    return 'text-bg-secondary'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'text-bg-secondary'
  }

  const ageInDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)

  if (ageInDays >= 3650) {
    return 'text-bg-danger'
  }

  if (ageInDays >= 1825) {
    return 'text-bg-warning'
  }

  return 'text-bg-success'
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
    <div class="row g-3 mb-4">
      <div class="col-sm-6 col-xl">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Ukupno drajvera</div>

            <div class="fs-2 fw-semibold">
              {{ formatNumber(stats.totalDrivers) }}
            </div>

            <div class="small text-muted mt-2">
              Na
              {{ formatNumber(stats.computersWithDrivers) }}
              računara
            </div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Jedinstveni uređaji</div>

            <div class="fs-2 fw-semibold">
              {{ formatNumber(stats.uniqueDevices) }}
            </div>

            <div class="small text-muted mt-2">Različitih naziva uređaja</div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Prosek po računaru</div>

            <div class="fs-2 fw-semibold">
              {{ formatNumber(stats.avgPerComputer, 1) }}
            </div>

            <div class="small text-muted mt-2">Drajvera po računaru</div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Bez proizvođača</div>

            <div
              class="fs-2 fw-semibold"
              :class="{
                'text-warning': Number(stats.withoutManufacturer) > 0,
              }"
            >
              {{ formatNumber(stats.withoutManufacturer) }}
            </div>

            <div class="small text-muted mt-2">Zapisa bez proizvođača</div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Bez datuma</div>

            <div
              class="fs-2 fw-semibold"
              :class="{
                'text-warning': Number(stats.withoutDate) > 0,
              }"
            >
              {{ formatNumber(stats.withoutDate) }}
            </div>

            <div class="small text-muted mt-2">Drajvera bez datuma</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Dodatni status -->
    <div class="row g-3 mb-4">
      <div class="col-md-4">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Jedinstveni proizvođači</div>

            <div class="fs-4 fw-semibold">
              {{ formatNumber(stats.uniqueManufacturers) }}
            </div>
          </div>
        </div>
      </div>

      <div class="col-md-4">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Bez verzije</div>

            <div
              class="fs-4 fw-semibold"
              :class="{
                'text-warning': Number(stats.withoutVersion) > 0,
              }"
            >
              {{ formatNumber(stats.withoutVersion) }}
            </div>
          </div>
        </div>
      </div>

      <div class="col-md-4">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Raspon datuma drajvera</div>

            <div class="fw-semibold">
              {{ formatDate(stats.oldestDriverDate) }}
              –
              {{ formatDate(stats.newestDriverDate) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Period inventara -->
    <div class="card border-0 shadow-sm mb-4">
      <div class="card-body">
        <div class="d-flex flex-column flex-md-row justify-content-between gap-3">
          <div>
            <div class="text-muted small">Najstariji PDSU zapis drajvera</div>

            <div class="fw-semibold">
              {{ formatDate(stats.oldestInventoryDate, true) }}
            </div>
          </div>

          <div class="text-md-end">
            <div class="text-muted small">Najnoviji PDSU zapis drajvera</div>

            <div class="fw-semibold">
              {{ formatDate(stats.newestInventoryDate, true) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Top proizvođači -->
    <div class="card border-0 shadow-sm mb-4">
      <div class="card-header bg-body">
        <h5 class="mb-1">Najzastupljeniji proizvođači drajvera</h5>

        <div class="text-muted small">Prema ukupnom broju pronađenih drajvera</div>
      </div>

      <div class="card-body">
        <div v-if="topManufacturers.length === 0" class="text-muted text-center py-4">
          Nema podataka o proizvođačima.
        </div>

        <div
          v-for="(item, index) in topManufacturers"
          v-else
          :key="`${item.manufacturer}-${index}`"
          class="driver-bar-row"
        >
          <div class="d-flex justify-content-between align-items-start gap-3 mb-1">
            <div class="text-truncate">
              <span class="text-muted me-2"> {{ index + 1 }}. </span>

              <span class="fw-semibold" :title="item.manufacturer">
                {{ item.manufacturer }}
              </span>
            </div>

            <div class="text-nowrap fw-semibold">
              {{ formatNumber(item.drivers) }}
            </div>
          </div>

          <div class="progress">
            <div
              class="progress-bar bg-success"
              :style="{
                width: `${barWidth(item.drivers, maxManufacturerDrivers)}%`,
              }"
            />
          </div>

          <div class="d-flex justify-content-between mt-1 small text-muted">
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

    <!-- Pretraga -->
    <div class="card border-0 shadow-sm mb-4">
      <div
        class="card-body d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3"
      >
        <div>
          <h5 class="mb-1">Detaljna analiza drajvera</h5>

          <div class="text-muted small">
            Pretraga se primenjuje na najstarije drajvere i uređaje sa više verzija.
          </div>
        </div>

        <div class="driver-search">
          <input
            v-model="search"
            type="search"
            class="form-control"
            placeholder="Pretraži uređaj, računar, verziju..."
          />
        </div>
      </div>
    </div>

    <!-- Najstariji drajveri -->
    <div class="card border-0 shadow-sm mb-4">
      <div class="card-header bg-body d-flex justify-content-between align-items-center gap-3">
        <div>
          <h5 class="mb-1">Najstariji drajveri</h5>

          <div class="text-muted small">Drajveri sortirani prema datumu od najstarijeg</div>
        </div>

        <span class="badge text-bg-danger">
          {{ formatNumber(filteredOldestDrivers.length) }}
        </span>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
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
              v-for="(item, index) in filteredOldestDrivers"
              :key="
                item.ipEntryId
                  ? `${item.ipEntryId}-${item.deviceName}-${index}`
                  : `${item.ip}-${index}`
              "
            >
              <td>
                <div class="fw-semibold">
                  {{ item.deviceName || 'Nepoznat uređaj' }}
                </div>

                <div class="small text-muted">
                  {{ item.driverProviderName || 'Nepoznat provider' }}
                </div>
              </td>

              <td>
                <div class="fw-semibold">
                  {{ item.computerName || 'Nepoznat računar' }}
                </div>

                <div class="small">
                  <code>{{ item.ip || '—' }}</code>
                </div>

                <div class="small text-muted">
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
                <span class="badge" :class="driverAgeClass(item.driverDate)">
                  {{ driverAgeLabel(item.driverDate) }}
                </span>
              </td>
            </tr>

            <tr v-if="filteredOldestDrivers.length === 0">
              <td colspan="6" class="text-center text-muted py-4">Nema rezultata.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Više verzija -->
    <div class="card border-0 shadow-sm mb-4">
      <div class="card-header bg-body d-flex justify-content-between align-items-center gap-3">
        <div>
          <h5 class="mb-1">Uređaji sa više verzija drajvera</h5>

          <div class="text-muted small">
            Isti uređaj je pronađen sa različitim verzijama drajvera
          </div>
        </div>

        <span class="badge text-bg-warning">
          {{ formatNumber(filteredMultipleVersions.length) }}
        </span>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
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
              v-for="(item, index) in filteredMultipleVersions"
              :key="`${item.deviceName}-${index}`"
            >
              <td class="fw-semibold">
                {{ item.deviceName }}
              </td>

              <td>
                {{ item.manufacturer || 'Nepoznat' }}
              </td>

              <td class="text-center">
                <span class="badge text-bg-warning">
                  {{ formatNumber(item.versionCount) }}
                </span>
              </td>

              <td class="text-center">
                {{ formatNumber(item.computers) }}
              </td>

              <td>
                <div class="d-flex flex-wrap gap-1">
                  <span
                    v-for="version in splitValues(item.versions)"
                    :key="version"
                    class="badge text-bg-light border"
                  >
                    {{ version }}
                  </span>

                  <span v-if="splitValues(item.versions).length === 0" class="text-muted">
                    Nema podatka
                  </span>
                </div>
              </td>
            </tr>

            <tr v-if="filteredMultipleVersions.length === 0">
              <td colspan="5" class="text-center text-muted py-4">Nema rezultata.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Računari sa najviše drajvera -->
    <div class="card border-0 shadow-sm">
      <div class="card-header bg-body d-flex justify-content-between align-items-center">
        <div>
          <h5 class="mb-1">Računari sa najviše drajvera</h5>

          <div class="text-muted small">Rangirano prema ukupnom broju drajvera</div>
        </div>

        <span class="badge text-bg-dark">
          Top
          {{ formatNumber(computersWithMostDrivers.length) }}
        </span>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
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
              <td class="text-muted">
                {{ index + 1 }}
              </td>

              <td class="fw-semibold">
                {{ item.computerName || 'Nepoznat računar' }}
              </td>

              <td>
                <code>{{ item.ip || '—' }}</code>
              </td>

              <td>
                {{ item.department || '—' }}
              </td>

              <td class="text-center">
                <span class="badge text-bg-success">
                  {{ formatNumber(item.driverCount) }}
                </span>
              </td>

              <td>
                {{ formatDate(item.inventoryDate, true) }}
              </td>
            </tr>

            <tr v-if="computersWithMostDrivers.length === 0">
              <td colspan="6" class="text-center text-muted py-4">Nema podataka.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>