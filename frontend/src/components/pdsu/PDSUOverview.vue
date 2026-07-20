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
    barClass: 'bg-blue-600',
  },
  {
    key: 'drivers',
    label: 'Drajveri',
    description: 'Računari sa prikupljenim drajverima',
    value: Number(props.coverage?.withDrivers) || 0,
    missing: Number(props.coverage?.withoutDrivers) || 0,
    percent: Number(props.coverage?.driversPct) || 0,
    barClass: 'bg-green-600',
  },
  {
    key: 'services',
    label: 'Servisi',
    description: 'Računari sa prikupljenim servisima',
    value: Number(props.coverage?.withServices) || 0,
    missing: Number(props.coverage?.withoutServices) || 0,
    percent: Number(props.coverage?.servicesPct) || 0,
    barClass: 'bg-amber-500',
  },
  {
    key: 'updates',
    label: 'Updates',
    description: 'Računari sa prikupljenim update podacima',
    value: Number(props.coverage?.withUpdates) || 0,
    missing: Number(props.coverage?.withoutUpdates) || 0,
    percent: Number(props.coverage?.updatesPct) || 0,
    barClass: 'bg-red-600',
  },
])

const alertItems = computed(() => [
  {
    key: 'automaticStopped',
    label: 'Automatski servisi koji ne rade',
    value: Number(serviceStats.value?.automaticStopped) || 0,
    badgeClass:
      Number(serviceStats.value?.automaticStopped) > 0 ? 'bg-red-600 text-white' : 'bg-green-600 text-white',
  },
  {
    key: 'oldUpdates',
    label: 'Računari bez update-a duže od 90 dana',
    value: Number(updateFreshness.value?.olderThan90Days) || 0,
    badgeClass:
      Number(updateFreshness.value?.olderThan90Days) > 0
        ? 'bg-amber-500 text-amber-950'
        : 'bg-green-600 text-white',
  },
  {
    key: 'missingUpdates',
    label: 'Računari bez update podataka',
    value: Number(updateFreshness.value?.withoutData) || 0,
    badgeClass:
      Number(updateFreshness.value?.withoutData) > 0 ? 'bg-slate-500 text-white' : 'bg-green-600 text-white',
  },
  {
    key: 'missingDriverDates',
    label: 'Drajveri bez datuma',
    value: Number(driverStats.value?.withoutDate) || 0,
    badgeClass:
      Number(driverStats.value?.withoutDate) > 0 ? 'bg-amber-500 text-amber-950' : 'bg-green-600 text-white',
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

  if (value >= 90) return 'text-green-600'
  if (value >= 70) return 'text-amber-600'

  return 'text-red-600'
}
</script>

<template>
  <section class="pdsu-overview">
    <!-- Glavni KPI -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-4">
      <div class="pdsu-card">
        <div class="p-4">
          <div class="flex items-start justify-between">
            <div>
              <div class="text-xs text-slate-500 mb-1">Instalirani programi</div>

              <div class="text-3xl font-bold tracking-tight text-slate-900">
                {{ formatNumber(softwareStats.totalInstallations) }}
              </div>
            </div>

            <span class="pdsu-icon-badge bg-blue-600">P</span>
          </div>

          <div class="text-xs text-slate-500 mt-3">
            {{ formatNumber(softwareStats.uniqueSoftware) }}
            jedinstvenih programa
          </div>

          <div class="text-xs text-slate-500">
            Prosek:
            {{ formatNumber(softwareStats.avgPerComputer) }}
            po računaru
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="flex items-start justify-between">
            <div>
              <div class="text-xs text-slate-500 mb-1">Drajveri</div>

              <div class="text-3xl font-bold tracking-tight text-slate-900">
                {{ formatNumber(driverStats.totalDrivers) }}
              </div>
            </div>

            <span class="pdsu-icon-badge bg-green-600">D</span>
          </div>

          <div class="text-xs text-slate-500 mt-3">
            {{ formatNumber(driverStats.uniqueDevices) }}
            jedinstvenih uređaja
          </div>

          <div class="text-xs text-slate-500">
            Prosek:
            {{ formatNumber(driverStats.avgPerComputer) }}
            po računaru
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="flex items-start justify-between">
            <div>
              <div class="text-xs text-slate-500 mb-1">Servisi</div>

              <div class="text-3xl font-bold tracking-tight text-slate-900">
                {{ formatNumber(serviceStats.totalServices) }}
              </div>
            </div>

            <span class="pdsu-icon-badge bg-amber-500">S</span>
          </div>

          <div class="text-xs text-slate-500 mt-3">
            {{ formatNumber(serviceStats.running) }}
            pokrenutih
          </div>

          <div class="text-xs text-slate-500">
            {{ formatNumber(serviceStats.stopped) }}
            zaustavljenih
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="flex items-start justify-between">
            <div>
              <div class="text-xs text-slate-500 mb-1">Updates</div>

              <div class="text-3xl font-bold tracking-tight text-slate-900">
                {{ formatNumber(updateStats.totalUpdates) }}
              </div>
            </div>

            <span class="pdsu-icon-badge bg-red-600">U</span>
          </div>

          <div class="text-xs text-slate-500 mt-3">
            {{ formatNumber(updateStats.uniqueHotfixes) }}
            jedinstvenih KB paketa
          </div>

          <div class="text-xs text-slate-500">
            {{ formatNumber(updateStats.installationsLast30Days) }}
            instalacija u poslednjih 30 dana
          </div>
        </div>
      </div>
    </div>

    <!-- Pokrivenost -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between">
        <div>
          <h5 class="pdsu-card-title">Pokrivenost PDSU podacima</h5>

          <div class="text-xs text-slate-500">U odnosu na ukupan broj računara u sistemu</div>
        </div>

        <span class="pdsu-badge bg-slate-900 text-white"> {{ formatNumber(totalComputers) }} računara </span>
      </div>

      <div class="p-4">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div v-for="item in coverageItems" :key="item.key">
            <div class="flex items-center justify-between mb-2">
              <div>
                <div class="font-semibold text-slate-900">
                  {{ item.label }}
                </div>

                <div class="text-xs text-slate-500">
                  {{ item.description }}
                </div>
              </div>

              <div class="text-lg font-bold" :class="percentageClass(item.percent)">
                {{ item.percent }}%
              </div>
            </div>

            <div
              class="pdsu-progress"
              role="progressbar"
              :aria-label="`${item.label} pokrivenost`"
              :aria-valuenow="item.percent"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div
                class="pdsu-progress-bar"
                :class="item.barClass"
                :style="{
                  width: `${Math.min(item.percent, 100)}%`,
                }"
              />
            </div>

            <div class="flex items-center justify-between mt-2 text-xs">
              <span>
                {{ formatNumber(item.value) }} /
                {{ formatNumber(totalComputers) }}
              </span>

              <span
                :class="{
                  'text-red-600': item.missing > 0,
                  'text-green-600': item.missing === 0,
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
    <div class="grid grid-cols-1 gap-3 xl:grid-cols-12">
      <div class="xl:col-span-7">
        <div class="pdsu-card h-full">
          <div class="pdsu-card-header">
            <h5 class="pdsu-card-title">Stanje koje zahteva pažnju</h5>

            <div class="text-xs text-slate-500">Najvažniji indikatori iz prikupljenih podataka</div>
          </div>

          <div class="p-4">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div v-for="item in alertItems" :key="item.key">
                <div
                  class="flex h-full items-center justify-between rounded-lg border border-slate-200 p-3"
                >
                  <div class="pr-3">
                    <div class="font-semibold text-slate-900">
                      {{ item.label }}
                    </div>
                  </div>

                  <span class="pdsu-badge pdsu-badge-pill text-base" :class="item.badgeClass">
                    {{ formatNumber(item.value) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="xl:col-span-5">
        <div class="pdsu-card h-full">
          <div class="pdsu-card-header">
            <h5 class="pdsu-card-title">Poslednje prikupljanje</h5>

            <div class="text-xs text-slate-500">Najnoviji datum inventara po kategoriji</div>
          </div>

          <div class="p-4">
            <div class="flex items-center justify-between gap-3 py-2 border-b border-slate-100">
              <span class="font-semibold text-slate-900"> Programi </span>

              <span class="text-slate-500 text-right">
                {{ formatDate(softwareStats.newestInventoryDate) }}
              </span>
            </div>

            <div class="flex items-center justify-between gap-3 py-2 border-b border-slate-100">
              <span class="font-semibold text-slate-900"> Drajveri </span>

              <span class="text-slate-500 text-right">
                {{ formatDate(driverStats.newestInventoryDate) }}
              </span>
            </div>

            <div class="flex items-center justify-between gap-3 py-2 border-b border-slate-100">
              <span class="font-semibold text-slate-900"> Servisi </span>

              <span class="text-slate-500 text-right">
                {{ formatDate(serviceStats.newestInventoryDate) }}
              </span>
            </div>

            <div class="flex items-center justify-between gap-3 pt-2">
              <span class="font-semibold text-slate-900"> Updates </span>

              <span class="text-slate-500 text-right">
                {{ formatDate(updateStats.newestInventoryDate) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
