<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  services: {
    type: Object,
    default: () => ({}),
  },
})

const search = ref('')

const stats = computed(() => props.services?.stats ?? {})
const tables = computed(() => props.services?.tables ?? {})

const automaticStopped = computed(() => tables.value?.automaticStopped ?? [])

const unusualPaths = computed(() => tables.value?.unusualPaths ?? [])

const rareServices = computed(() => tables.value?.rareServices ?? [])

const normalizedSearch = computed(() => search.value.trim().toLocaleLowerCase('sr-RS'))

const filteredAutomaticStopped = computed(() => {
  const query = normalizedSearch.value

  if (!query) {
    return automaticStopped.value
  }

  return automaticStopped.value.filter((item) =>
    [
      item.name,
      item.displayName,
      item.computerName,
      item.ip,
      item.department,
      item.startName,
      item.pathName,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('sr-RS').includes(query))
  )
})

const filteredUnusualPaths = computed(() => {
  const query = normalizedSearch.value

  if (!query) {
    return unusualPaths.value
  }

  return unusualPaths.value.filter((item) =>
    [
      item.name,
      item.displayName,
      item.computerName,
      item.ip,
      item.department,
      item.pathName,
      item.startName,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('sr-RS').includes(query))
  )
})

const filteredRareServices = computed(() => {
  const query = normalizedSearch.value

  if (!query) {
    return rareServices.value
  }

  return rareServices.value.filter((item) =>
    [item.name, item.displayName, item.startMode, item.startName, item.pathName, item.computerNames]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('sr-RS').includes(query))
  )
})

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

function splitValues(value) {
  if (!value) {
    return []
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeState(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function normalizeStartMode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

function stateBadgeClass(value) {
  const state = normalizeState(value)

  if (state === 'running') {
    return 'text-bg-success'
  }

  if (state === 'stopped') {
    return 'text-bg-danger'
  }

  if (state === 'paused') {
    return 'text-bg-warning'
  }

  return 'text-bg-secondary'
}

function stateLabel(value) {
  const state = normalizeState(value)

  if (state === 'running') {
    return 'Pokrenut'
  }

  if (state === 'stopped') {
    return 'Zaustavljen'
  }

  if (state === 'paused') {
    return 'Pauziran'
  }

  return value || 'Nepoznato'
}

function startModeBadgeClass(value) {
  const mode = normalizeStartMode(value)

  if (mode === 'auto' || mode === 'automatic' || mode === 'automatski') {
    return 'text-bg-primary'
  }

  if (mode === 'manual' || mode === 'ručno' || mode === 'rucno') {
    return 'text-bg-warning'
  }

  if (mode === 'disabled' || mode === 'isključen' || mode === 'iskljucen') {
    return 'text-bg-secondary'
  }

  return 'text-bg-light border'
}

function startModeLabel(value) {
  const mode = normalizeStartMode(value)

  if (mode === 'auto' || mode === 'automatic' || mode === 'automatski') {
    return 'Automatski'
  }

  if (mode === 'manual' || mode === 'ručno' || mode === 'rucno') {
    return 'Ručno'
  }

  if (mode === 'disabled' || mode === 'isključen' || mode === 'iskljucen') {
    return 'Isključen'
  }

  return value || 'Nepoznato'
}

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
    <div class="row g-3 mb-4">
      <div class="col-sm-6 col-xl">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Ukupno servisa</div>

            <div class="fs-2 fw-semibold">
              {{ formatNumber(stats.totalServices) }}
            </div>

            <div class="small text-muted mt-2">
              Na
              {{ formatNumber(stats.computersWithServices) }}
              računara
            </div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Pokrenuti servisi</div>

            <div class="fs-2 fw-semibold text-success">
              {{ formatNumber(stats.running) }}
            </div>

            <div class="small text-muted mt-2">
              {{ formatNumber(runningPercent) }}% svih servisa
            </div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Zaustavljeni servisi</div>

            <div
              class="fs-2 fw-semibold"
              :class="{
                'text-danger': Number(stats.stopped) > 0,
              }"
            >
              {{ formatNumber(stats.stopped) }}
            </div>

            <div class="small text-muted mt-2">
              {{ formatNumber(stoppedPercent) }}% svih servisa
            </div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Automatski, a zaustavljeni</div>

            <div
              class="fs-2 fw-semibold"
              :class="{
                'text-danger': Number(stats.automaticStopped) > 0,
                'text-success': Number(stats.automaticStopped) === 0,
              }"
            >
              {{ formatNumber(stats.automaticStopped) }}
            </div>

            <div class="small text-muted mt-2">Potencijalno zahtevaju proveru</div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Jedinstveni servisi</div>

            <div class="fs-2 fw-semibold">
              {{ formatNumber(stats.uniqueServices) }}
            </div>

            <div class="small text-muted mt-2">Različitih naziva servisa</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Dodatne statistike -->
    <div class="row g-3 mb-4">
      <div class="col-md-4">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Automatski servisi</div>

            <div class="fs-4 fw-semibold">
              {{ formatNumber(stats.automatic) }}
            </div>
          </div>
        </div>
      </div>

      <div class="col-md-4">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Ručno pokretanje</div>

            <div class="fs-4 fw-semibold">
              {{ formatNumber(stats.manual) }}
            </div>
          </div>
        </div>
      </div>

      <div class="col-md-4">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-1">Isključeni servisi</div>

            <div class="fs-4 fw-semibold">
              {{ formatNumber(stats.disabled) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Status distribucija -->
    <div class="card border-0 shadow-sm mb-4">
      <div class="card-header bg-body">
        <h5 class="mb-1">Status servisa</h5>

        <div class="text-muted small">Odnos pokrenutih i zaustavljenih servisa</div>
      </div>

      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="fw-semibold"> Pokrenuti </span>

          <span>
            {{ formatNumber(stats.running) }}
            ·
            {{ formatNumber(runningPercent) }}%
          </span>
        </div>

        <div class="progress mb-4">
          <div class="progress-bar bg-success" :style="{ width: `${runningPercent}%` }" />
        </div>

        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="fw-semibold"> Zaustavljeni </span>

          <span>
            {{ formatNumber(stats.stopped) }}
            ·
            {{ formatNumber(stoppedPercent) }}%
          </span>
        </div>

        <div class="progress">
          <div class="progress-bar bg-danger" :style="{ width: `${stoppedPercent}%` }" />
        </div>
      </div>
    </div>

    <!-- Period inventara -->
    <div class="card border-0 shadow-sm mb-4">
      <div class="card-body">
        <div class="d-flex flex-column flex-md-row justify-content-between gap-3">
          <div>
            <div class="text-muted small">Najstariji PDSU zapis servisa</div>

            <div class="fw-semibold">
              {{ formatDate(stats.oldestInventoryDate) }}
            </div>
          </div>

          <div class="text-md-end">
            <div class="text-muted small">Najnoviji PDSU zapis servisa</div>

            <div class="fw-semibold">
              {{ formatDate(stats.newestInventoryDate) }}
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
          <h5 class="mb-1">Detaljna analiza servisa</h5>

          <div class="text-muted small">Pretraga se primenjuje na sve tabele ispod.</div>
        </div>

        <div class="service-search">
          <input
            v-model="search"
            type="search"
            class="form-control"
            placeholder="Pretraži servis, računar, putanju..."
          />
        </div>
      </div>
    </div>

    <!-- Automatski servisi koji ne rade -->
    <div class="card border-0 shadow-sm mb-4">
      <div class="card-header bg-body d-flex justify-content-between align-items-center gap-3">
        <div>
          <h5 class="mb-1">Automatski servisi koji nisu pokrenuti</h5>

          <div class="text-muted small">
            Servisi podešeni na automatsko pokretanje, ali su trenutno zaustavljeni
          </div>
        </div>

        <span
          class="badge"
          :class="filteredAutomaticStopped.length > 0 ? 'text-bg-danger' : 'text-bg-success'"
        >
          {{ formatNumber(filteredAutomaticStopped.length) }}
        </span>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead>
            <tr>
              <th>Servis</th>
              <th>Računar</th>
              <th>Nalog</th>
              <th>Putanja</th>
              <th class="text-center">Status</th>
              <th>Datum inventara</th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="(item, index) in filteredAutomaticStopped"
              :key="item.id ?? `${item.ipEntryId}-${item.name}-${index}`"
            >
              <td>
                <div class="fw-semibold">
                  {{ item.displayName || item.name || 'Nepoznat servis' }}
                </div>

                <div class="small text-muted">
                  {{ item.name || '—' }}
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
                {{ item.startName || '—' }}
              </td>

              <td class="service-path">
                <code :title="item.pathName">
                  {{ shortenPath(item.pathName) }}
                </code>
              </td>

              <td class="text-center">
                <span class="badge" :class="stateBadgeClass(item.state)">
                  {{ stateLabel(item.state) }}
                </span>
              </td>

              <td>
                {{ formatDate(item.inventoryDate) }}
              </td>
            </tr>

            <tr v-if="filteredAutomaticStopped.length === 0">
              <td colspan="6" class="text-center text-muted py-4">
                Nema automatskih servisa koji su zaustavljeni.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Neuobičajene putanje -->
    <div class="card border-0 shadow-sm mb-4">
      <div class="card-header bg-body d-flex justify-content-between align-items-center gap-3">
        <div>
          <h5 class="mb-1">Neuobičajene putanje servisa</h5>

          <div class="text-muted small">
            Servisi čije izvršne datoteke nisu pronađene u standardnim Windows direktorijumima
          </div>
        </div>

        <span class="badge text-bg-warning">
          {{ formatNumber(filteredUnusualPaths.length) }}
        </span>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead>
            <tr>
              <th>Servis</th>
              <th>Računar</th>
              <th>Način pokretanja</th>
              <th>Nalog</th>
              <th>Putanja</th>
              <th class="text-center">Status</th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="(item, index) in filteredUnusualPaths"
              :key="item.id ?? `${item.ipEntryId}-${item.name}-${index}`"
            >
              <td>
                <div class="fw-semibold">
                  {{ item.displayName || item.name || 'Nepoznat servis' }}
                </div>

                <div class="small text-muted">
                  {{ item.name || '—' }}
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
                <span class="badge" :class="startModeBadgeClass(item.startMode)">
                  {{ startModeLabel(item.startMode) }}
                </span>
              </td>

              <td>
                {{ item.startName || '—' }}
              </td>

              <td class="service-path">
                <code :title="item.pathName">
                  {{ shortenPath(item.pathName, 110) }}
                </code>
              </td>

              <td class="text-center">
                <span class="badge" :class="stateBadgeClass(item.state)">
                  {{ stateLabel(item.state) }}
                </span>
              </td>
            </tr>

            <tr v-if="filteredUnusualPaths.length === 0">
              <td colspan="6" class="text-center text-muted py-4">Nema rezultata.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Retki servisi -->
    <div class="card border-0 shadow-sm">
      <div class="card-header bg-body d-flex justify-content-between align-items-center gap-3">
        <div>
          <h5 class="mb-1">Retki servisi</h5>

          <div class="text-muted small">Servisi pronađeni na malom broju računara</div>
        </div>

        <span class="badge text-bg-secondary">
          {{ formatNumber(filteredRareServices.length) }}
        </span>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead>
            <tr>
              <th>Servis</th>
              <th>Način pokretanja</th>
              <th>Nalog</th>
              <th class="text-center">Računari</th>
              <th>Pronađen na</th>
              <th>Putanja</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="(item, index) in filteredRareServices" :key="`${item.name}-${index}`">
              <td>
                <div class="fw-semibold">
                  {{ item.displayName || item.name || 'Nepoznat servis' }}
                </div>

                <div class="small text-muted">
                  {{ item.name || '—' }}
                </div>
              </td>

              <td>
                <span class="badge" :class="startModeBadgeClass(item.startMode)">
                  {{ startModeLabel(item.startMode) }}
                </span>
              </td>

              <td>
                {{ item.startName || '—' }}
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

              <td class="service-path">
                <code :title="item.pathName">
                  {{ shortenPath(item.pathName) }}
                </code>
              </td>
            </tr>

            <tr v-if="filteredRareServices.length === 0">
              <td colspan="6" class="text-center text-muted py-4">Nema rezultata.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>