<script setup>
import { computed } from 'vue'

const props = defineProps({
  coverage: {
    type: Object,
    default: () => ({}),
  },

  software: {
    type: Object,
    default: () => ({}),
  },

  drivers: {
    type: Object,
    default: () => ({}),
  },

  services: {
    type: Object,
    default: () => ({}),
  },

  updates: {
    type: Object,
    default: () => ({}),
  },
})

const softwareStats = computed(() => props.software?.stats ?? {})
const driverStats = computed(() => props.drivers?.stats ?? {})
const serviceStats = computed(() => props.services?.stats ?? {})
const updateStats = computed(() => props.updates?.stats ?? {})

const updateFreshness = computed(() => updateStats.value?.freshness ?? {})

const totalComputers = computed(() => Number(props.coverage?.totalComputers) || 0)

const coverageItems = computed(() => [
  {
    key: 'software',
    label: 'Programi',
    description: 'Računari sa prikupljenim programima',
    value: Number(props.coverage?.withSoftware) || 0,
    missing: Number(props.coverage?.withoutSoftware) || 0,
    percent: Number(props.coverage?.softwarePct) || 0,
    progressClass: 'bg-primary',
  },
  {
    key: 'drivers',
    label: 'Drajveri',
    description: 'Računari sa prikupljenim drajverima',
    value: Number(props.coverage?.withDrivers) || 0,
    missing: Number(props.coverage?.withoutDrivers) || 0,
    percent: Number(props.coverage?.driversPct) || 0,
    progressClass: 'bg-success',
  },
  {
    key: 'services',
    label: 'Servisi',
    description: 'Računari sa prikupljenim servisima',
    value: Number(props.coverage?.withServices) || 0,
    missing: Number(props.coverage?.withoutServices) || 0,
    percent: Number(props.coverage?.servicesPct) || 0,
    progressClass: 'bg-warning',
  },
  {
    key: 'updates',
    label: 'Updates',
    description: 'Računari sa prikupljenim update podacima',
    value: Number(props.coverage?.withUpdates) || 0,
    missing: Number(props.coverage?.withoutUpdates) || 0,
    percent: Number(props.coverage?.updatesPct) || 0,
    progressClass: 'bg-danger',
  },
])

const alertItems = computed(() => [
  {
    key: 'automaticStopped',
    label: 'Automatski servisi koji ne rade',
    value: Number(serviceStats.value?.automaticStopped) || 0,
    className:
      Number(serviceStats.value?.automaticStopped) > 0 ? 'text-bg-danger' : 'text-bg-success',
  },
  {
    key: 'oldUpdates',
    label: 'Računari bez update-a duže od 90 dana',
    value: Number(updateFreshness.value?.olderThan90Days) || 0,
    className:
      Number(updateFreshness.value?.olderThan90Days) > 0 ? 'text-bg-warning' : 'text-bg-success',
  },
  {
    key: 'missingUpdates',
    label: 'Računari bez update podataka',
    value: Number(updateFreshness.value?.withoutData) || 0,
    className:
      Number(updateFreshness.value?.withoutData) > 0 ? 'text-bg-secondary' : 'text-bg-success',
  },
  {
    key: 'missingDriverDates',
    label: 'Drajveri bez datuma',
    value: Number(driverStats.value?.withoutDate) || 0,
    className: Number(driverStats.value?.withoutDate) > 0 ? 'text-bg-warning' : 'text-bg-success',
  },
])

function formatNumber(value) {
  return new Intl.NumberFormat('sr-RS').format(Number(value) || 0)
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

function percentageClass(percent) {
  const value = Number(percent) || 0

  if (value >= 90) return 'text-success'
  if (value >= 70) return 'text-warning'

  return 'text-danger'
}
</script>

<template>
  <section class="pdsu-overview">
    <!-- Glavni KPI -->
    <div class="row g-3 mb-4">
      <div class="col-sm-6 col-xl-3">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <div class="text-muted small mb-1">Instalirani programi</div>

                <div class="display-6 fw-semibold">
                  {{ formatNumber(softwareStats.totalInstallations) }}
                </div>
              </div>

              <span class="badge text-bg-primary"> P </span>
            </div>

            <div class="small text-muted mt-3">
              {{ formatNumber(softwareStats.uniqueSoftware) }}
              jedinstvenih programa
            </div>

            <div class="small text-muted">
              Prosek:
              {{ formatNumber(softwareStats.avgPerComputer) }}
              po računaru
            </div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl-3">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <div class="text-muted small mb-1">Drajveri</div>

                <div class="display-6 fw-semibold">
                  {{ formatNumber(driverStats.totalDrivers) }}
                </div>
              </div>

              <span class="badge text-bg-success"> D </span>
            </div>

            <div class="small text-muted mt-3">
              {{ formatNumber(driverStats.uniqueDevices) }}
              jedinstvenih uređaja
            </div>

            <div class="small text-muted">
              Prosek:
              {{ formatNumber(driverStats.avgPerComputer) }}
              po računaru
            </div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl-3">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <div class="text-muted small mb-1">Servisi</div>

                <div class="display-6 fw-semibold">
                  {{ formatNumber(serviceStats.totalServices) }}
                </div>
              </div>

              <span class="badge text-bg-warning"> S </span>
            </div>

            <div class="small text-muted mt-3">
              {{ formatNumber(serviceStats.running) }}
              pokrenutih
            </div>

            <div class="small text-muted">
              {{ formatNumber(serviceStats.stopped) }}
              zaustavljenih
            </div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl-3">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <div class="text-muted small mb-1">Updates</div>

                <div class="display-6 fw-semibold">
                  {{ formatNumber(updateStats.totalUpdates) }}
                </div>
              </div>

              <span class="badge text-bg-danger"> U </span>
            </div>

            <div class="small text-muted mt-3">
              {{ formatNumber(updateStats.uniqueHotfixes) }}
              jedinstvenih KB paketa
            </div>

            <div class="small text-muted">
              {{ formatNumber(updateStats.installationsLast30Days) }}
              instalacija u poslednjih 30 dana
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Pokrivenost -->
    <div class="card border-0 shadow-sm mb-4">
      <div class="card-header bg-body d-flex justify-content-between align-items-center">
        <div>
          <h5 class="mb-1">Pokrivenost PDSU podacima</h5>

          <div class="text-muted small">U odnosu na ukupan broj računara u sistemu</div>
        </div>

        <span class="badge text-bg-dark"> {{ formatNumber(totalComputers) }} računara </span>
      </div>

      <div class="card-body">
        <div class="row g-4">
          <div v-for="item in coverageItems" :key="item.key" class="col-md-6 col-xl-3">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <div>
                <div class="fw-semibold">
                  {{ item.label }}
                </div>

                <div class="text-muted small">
                  {{ item.description }}
                </div>
              </div>

              <div class="fw-bold fs-5" :class="percentageClass(item.percent)">
                {{ item.percent }}%
              </div>
            </div>

            <div
              class="progress"
              role="progressbar"
              :aria-label="`${item.label} pokrivenost`"
              :aria-valuenow="item.percent"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div
                class="progress-bar"
                :class="item.progressClass"
                :style="{
                  width: `${Math.min(item.percent, 100)}%`,
                }"
              />
            </div>

            <div class="d-flex justify-content-between mt-2 small">
              <span>
                {{ formatNumber(item.value) }} /
                {{ formatNumber(totalComputers) }}
              </span>

              <span
                :class="{
                  'text-danger': item.missing > 0,
                  'text-success': item.missing === 0,
                }"
              >
                Bez podataka:
                {{ formatNumber(item.missing) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Upozorenja i stanje -->
    <div class="row g-3">
      <div class="col-xl-7">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-header bg-body">
            <h5 class="mb-1">Stanje koje zahteva pažnju</h5>

            <div class="text-muted small">Najvažniji indikatori iz prikupljenih podataka</div>
          </div>

          <div class="card-body">
            <div class="row g-3">
              <div v-for="item in alertItems" :key="item.key" class="col-sm-6">
                <div
                  class="border rounded p-3 h-100 d-flex justify-content-between align-items-center"
                >
                  <div class="pe-3">
                    <div class="fw-semibold">
                      {{ item.label }}
                    </div>
                  </div>

                  <span class="badge rounded-pill fs-6" :class="item.className">
                    {{ formatNumber(item.value) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-xl-5">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-header bg-body">
            <h5 class="mb-1">Poslednje prikupljanje</h5>

            <div class="text-muted small">Najnoviji datum inventara po kategoriji</div>
          </div>

          <div class="card-body">
            <div class="d-flex justify-content-between gap-3 py-2 border-bottom">
              <span class="fw-semibold"> Programi </span>

              <span class="text-muted text-end">
                {{ formatDate(softwareStats.newestInventoryDate) }}
              </span>
            </div>

            <div class="d-flex justify-content-between gap-3 py-2 border-bottom">
              <span class="fw-semibold"> Drajveri </span>

              <span class="text-muted text-end">
                {{ formatDate(driverStats.newestInventoryDate) }}
              </span>
            </div>

            <div class="d-flex justify-content-between gap-3 py-2 border-bottom">
              <span class="fw-semibold"> Servisi </span>

              <span class="text-muted text-end">
                {{ formatDate(serviceStats.newestInventoryDate) }}
              </span>
            </div>

            <div class="d-flex justify-content-between gap-3 pt-2">
              <span class="fw-semibold"> Updates </span>

              <span class="text-muted text-end">
                {{ formatDate(updateStats.newestInventoryDate) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>