<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  software: {
    type: Object,
    default: () => ({}),
  },
})

const search = ref('')

const stats = computed(() => props.software?.stats ?? {})
const tables = computed(() => props.software?.tables ?? {})

const topSoftware = computed(() => tables.value?.topSoftware ?? [])

const topPublishers = computed(() => tables.value?.topPublishers ?? [])

const multipleVersions = computed(() => tables.value?.multipleVersions ?? [])

const rareSoftware = computed(() => tables.value?.rareSoftware ?? [])

const computersWithMostSoftware = computed(() => tables.value?.computersWithMostSoftware ?? [])

const normalizedSearch = computed(() => search.value.trim().toLocaleLowerCase('sr-RS'))

const filteredMultipleVersions = computed(() => {
  const query = normalizedSearch.value

  if (!query) {
    return multipleVersions.value
  }

  return multipleVersions.value.filter((item) =>
    [item.name, item.versions]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('sr-RS').includes(query))
  )
})

const filteredRareSoftware = computed(() => {
  const query = normalizedSearch.value

  if (!query) {
    return rareSoftware.value
  }

  return rareSoftware.value.filter((item) =>
    [item.name, item.version, item.publisher, item.computerNames]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('sr-RS').includes(query))
  )
})

const maxTopSoftwareComputers = computed(() => {
  return Math.max(...topSoftware.value.map((item) => Number(item.computers) || 0), 1)
})

const maxPublisherInstallations = computed(() => {
  return Math.max(...topPublishers.value.map((item) => Number(item.installations) || 0), 1)
})

function formatNumber(value, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('sr-RS', {
    maximumFractionDigits,
  }).format(Number(value) || 0)
}

function formatDate(value) {
  if (!value) {
    return 'Nema podataka'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Nema podataka'
  }

  return new Intl.DateTimeFormat('sr-RS', {
    dateStyle: 'medium',
    timeStyle: 'short',
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
</script>

<template>
  <section class="pdsu-software">
    <!-- KPI kartice -->
    <div class="row g-3 mb-4">
      <div class="col-sm-6 col-xl">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Ukupno instalacija</div>

            <div class="fs-2 fw-semibold">
              {{ formatNumber(stats.totalInstallations) }}
            </div>

            <div class="small text-muted mt-2">
              Na
              {{ formatNumber(stats.computersWithSoftware) }}
              računara
            </div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Jedinstvenih programa</div>

            <div class="fs-2 fw-semibold">
              {{ formatNumber(stats.uniqueSoftware) }}
            </div>

            <div class="small text-muted mt-2">Različitih naziva programa</div>
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

            <div class="small text-muted mt-2">Instalacija po računaru</div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Bez izdavača</div>

            <div
              class="fs-2 fw-semibold"
              :class="{
                'text-warning': Number(stats.withoutPublisher) > 0,
              }"
            >
              {{ formatNumber(stats.withoutPublisher) }}
            </div>

            <div class="small text-muted mt-2">Zapisa bez publisher podatka</div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Bez verzije</div>

            <div
              class="fs-2 fw-semibold"
              :class="{
                'text-warning': Number(stats.withoutVersion) > 0,
              }"
            >
              {{ formatNumber(stats.withoutVersion) }}
            </div>

            <div class="small text-muted mt-2">Zapisa bez verzije programa</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Period prikupljanja -->
    <div class="card border-0 shadow-sm mb-4">
      <div class="card-body">
        <div class="d-flex flex-column flex-md-row justify-content-between gap-3">
          <div>
            <div class="text-muted small">Najstariji PDSU zapis programa</div>

            <div class="fw-semibold">
              {{ formatDate(stats.oldestInventoryDate) }}
            </div>
          </div>

          <div class="text-md-end">
            <div class="text-muted small">Najnoviji PDSU zapis programa</div>

            <div class="fw-semibold">
              {{ formatDate(stats.newestInventoryDate) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Top programi i izdavači -->
    <div class="row g-4 mb-4">
      <div class="col-xl-7">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-header bg-body">
            <h5 class="mb-1">Najzastupljeniji programi</h5>

            <div class="text-muted small">Rangirano prema broju računara</div>
          </div>

          <div class="card-body">
            <div v-if="topSoftware.length === 0" class="text-muted text-center py-4">
              Nema podataka o programima.
            </div>

            <div
              v-for="(item, index) in topSoftware"
              v-else
              :key="`${item.name}-${index}`"
              class="software-bar-row"
            >
              <div class="d-flex justify-content-between align-items-start gap-3 mb-1">
                <div class="text-truncate">
                  <span class="text-muted me-2"> {{ index + 1 }}. </span>

                  <span class="fw-semibold" :title="item.name">
                    {{ item.name }}
                  </span>
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
                  class="progress-bar"
                  :style="{
                    width: `${barWidth(item.computers, maxTopSoftwareComputers)}%`,
                  }"
                />
              </div>

              <div class="d-flex justify-content-between mt-1 small text-muted">
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

      <div class="col-xl-5">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-header bg-body">
            <h5 class="mb-1">Najzastupljeniji izdavači</h5>

            <div class="text-muted small">Prema ukupnom broju instalacija</div>
          </div>

          <div class="card-body">
            <div v-if="topPublishers.length === 0" class="text-muted text-center py-4">
              Nema podataka o izdavačima.
            </div>

            <div
              v-for="(item, index) in topPublishers"
              v-else
              :key="`${item.publisher}-${index}`"
              class="software-bar-row"
            >
              <div class="d-flex justify-content-between align-items-start gap-3 mb-1">
                <div class="fw-semibold text-truncate" :title="item.publisher">
                  {{ item.publisher }}
                </div>

                <div class="text-nowrap fw-semibold">
                  {{ formatNumber(item.installations) }}
                </div>
              </div>

              <div class="progress">
                <div
                  class="progress-bar bg-secondary"
                  :style="{
                    width: `${barWidth(item.installations, maxPublisherInstallations)}%`,
                  }"
                />
              </div>

              <div class="d-flex justify-content-between mt-1 small text-muted">
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

    <!-- Pretraga -->
    <div class="card border-0 shadow-sm mb-4">
      <div
        class="card-body d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3"
      >
        <div>
          <h5 class="mb-1">Detaljna analiza programa</h5>

          <div class="text-muted small">
            Pretraga se primenjuje na programe sa više verzija i retke programe.
          </div>
        </div>

        <div class="software-search">
          <input
            v-model="search"
            type="search"
            class="form-control"
            placeholder="Pretraži program, verziju, izdavača..."
          />
        </div>
      </div>
    </div>

    <!-- Programi sa više verzija -->
    <div class="card border-0 shadow-sm mb-4">
      <div class="card-header bg-body d-flex justify-content-between align-items-center gap-3">
        <div>
          <h5 class="mb-1">Programi sa više verzija</h5>

          <div class="text-muted small">
            Programi kod kojih je pronađeno više različitih verzija
          </div>
        </div>

        <span class="badge text-bg-primary">
          {{ formatNumber(filteredMultipleVersions.length) }}
        </span>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead>
            <tr>
              <th>Program</th>
              <th class="text-center">Broj verzija</th>
              <th class="text-center">Računari</th>
              <th>Pronađene verzije</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="(item, index) in filteredMultipleVersions" :key="`${item.name}-${index}`">
              <td class="fw-semibold">
                {{ item.name }}
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
              <td colspan="4" class="text-center text-muted py-4">Nema rezultata.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Retki programi -->
    <div class="card border-0 shadow-sm mb-4">
      <div class="card-header bg-body d-flex justify-content-between align-items-center gap-3">
        <div>
          <h5 class="mb-1">Retki programi</h5>

          <div class="text-muted small">Programi pronađeni na najviše dva računara</div>
        </div>

        <span class="badge text-bg-secondary">
          {{ formatNumber(filteredRareSoftware.length) }}
        </span>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
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
            <tr v-for="(item, index) in filteredRareSoftware" :key="`${item.name}-${index}`">
              <td class="fw-semibold">
                {{ item.name }}
              </td>

              <td>
                {{ item.version || '—' }}
              </td>

              <td>
                {{ item.publisher || 'Nepoznat izdavač' }}
              </td>

              <td class="text-center">
                <span class="badge text-bg-secondary">
                  {{ formatNumber(item.computers) }}
                </span>
              </td>

              <td>
                <div class="d-flex flex-wrap gap-1">
                  <span
                    v-for="computer in splitValues(item.computerNames)"
                    :key="computer"
                    class="badge text-bg-light border"
                  >
                    {{ computer }}
                  </span>

                  <span v-if="splitValues(item.computerNames).length === 0" class="text-muted">
                    Nema podatka
                  </span>
                </div>
              </td>
            </tr>

            <tr v-if="filteredRareSoftware.length === 0">
              <td colspan="5" class="text-center text-muted py-4">Nema rezultata.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Računari sa najviše programa -->
    <div class="card border-0 shadow-sm">
      <div class="card-header bg-body d-flex justify-content-between align-items-center">
        <div>
          <h5 class="mb-1">Računari sa najviše programa</h5>

          <div class="text-muted small">Rangirano prema broju instaliranih programa</div>
        </div>

        <span class="badge text-bg-dark">
          Top
          {{ formatNumber(computersWithMostSoftware.length) }}
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
              <th class="text-center">Broj programa</th>
              <th>Datum inventara</th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="(item, index) in computersWithMostSoftware"
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
                <span class="badge text-bg-primary">
                  {{ formatNumber(item.softwareCount) }}
                </span>
              </td>

              <td>
                {{ formatDate(item.inventoryDate) }}
              </td>
            </tr>

            <tr v-if="computersWithMostSoftware.length === 0">
              <td colspan="6" class="text-center text-muted py-4">Nema podataka.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>