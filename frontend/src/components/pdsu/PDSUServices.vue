<script setup>
import { computed } from 'vue'
import { fmtNumberSr, fmtDateSr } from '@/utils/format.js'

const props = defineProps({
  services: {
    type: Object,
    default: () => ({}),
  },
})

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

function formatNumber(value, maximumFractionDigits = 0) {
  return fmtNumberSr(value, maximumFractionDigits)
}

function formatDate(value) {
  return fmtDateSr(value, { includeTime: true })
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
    return 'bg-green-600 text-white'
  }

  if (state === 'stopped') {
    return 'bg-red-600 text-white'
  }

  if (state === 'paused') {
    return 'bg-amber-500 text-amber-950'
  }

  return 'bg-slate-500 text-white'
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
    return 'bg-blue-600 text-white'
  }

  if (mode === 'manual' || mode === 'ručno' || mode === 'rucno') {
    return 'bg-amber-500 text-amber-950'
  }

  if (mode === 'disabled' || mode === 'isključen' || mode === 'iskljucen') {
    return 'bg-slate-500 text-white'
  }

  return 'bg-slate-100 text-slate-700 border border-slate-200'
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
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5 mb-4">
      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Ukupno servisa</div>

          <div class="text-2xl font-bold tracking-tight text-slate-900">
            {{ formatNumber(stats.totalServices) }}
          </div>

          <div class="text-xs text-slate-500 mt-2">
            Na
            {{ formatNumber(stats.computersWithServices) }}
            računara
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Pokrenuti servisi</div>

          <div class="text-2xl font-bold tracking-tight text-green-600">
            {{ formatNumber(stats.running) }}
          </div>

          <div class="text-xs text-slate-500 mt-2">
            {{ formatNumber(runningPercent) }}% svih servisa
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Zaustavljeni servisi</div>

          <div
            class="text-2xl font-bold tracking-tight"
            :class="Number(stats.stopped) > 0 ? 'text-red-600' : 'text-slate-900'"
          >
            {{ formatNumber(stats.stopped) }}
          </div>

          <div class="text-xs text-slate-500 mt-2">
            {{ formatNumber(stoppedPercent) }}% svih servisa
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Automatski, a zaustavljeni</div>

          <div
            class="text-2xl font-bold tracking-tight"
            :class="Number(stats.automaticStopped) > 0 ? 'text-red-600' : 'text-green-600'"
          >
            {{ formatNumber(stats.automaticStopped) }}
          </div>

          <div class="text-xs text-slate-500 mt-2">Potencijalno zahtevaju proveru</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Jedinstveni servisi</div>

          <div class="text-2xl font-bold tracking-tight text-slate-900">
            {{ formatNumber(stats.uniqueServices) }}
          </div>

          <div class="text-xs text-slate-500 mt-2">Različitih naziva servisa</div>
        </div>
      </div>
    </div>

    <!-- Dodatne statistike -->
    <div class="grid grid-cols-1 gap-3 md:grid-cols-3 mb-4">
      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Automatski servisi</div>

          <div class="text-lg font-bold text-slate-900">
            {{ formatNumber(stats.automatic) }}
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Ručno pokretanje</div>

          <div class="text-lg font-bold text-slate-900">
            {{ formatNumber(stats.manual) }}
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Isključeni servisi</div>

          <div class="text-lg font-bold text-slate-900">
            {{ formatNumber(stats.disabled) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Status distribucija -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header">
        <h5 class="pdsu-card-title">Status servisa</h5>

        <div class="text-xs text-slate-500">Odnos pokrenutih i zaustavljenih servisa</div>
      </div>

      <div class="p-4">
        <div class="flex items-center justify-between mb-2">
          <span class="font-semibold text-slate-900"> Pokrenuti </span>

          <span>
            {{ formatNumber(stats.running) }}
            ·
            {{ formatNumber(runningPercent) }}%
          </span>
        </div>

        <div class="pdsu-progress mb-4">
          <div class="pdsu-progress-bar bg-green-600" :style="{ width: `${runningPercent}%` }" />
        </div>

        <div class="flex items-center justify-between mb-2">
          <span class="font-semibold text-slate-900"> Zaustavljeni </span>

          <span>
            {{ formatNumber(stats.stopped) }}
            ·
            {{ formatNumber(stoppedPercent) }}%
          </span>
        </div>

        <div class="pdsu-progress">
          <div class="pdsu-progress-bar bg-red-600" :style="{ width: `${stoppedPercent}%` }" />
        </div>
      </div>
    </div>

    <!-- Period inventara -->
    <div class="pdsu-card mb-4">
      <div class="p-4">
        <div class="flex flex-col justify-between gap-3 md:flex-row">
          <div>
            <div class="text-xs text-slate-500">Najstariji PDSU zapis servisa</div>

            <div class="font-semibold text-slate-900">
              {{ formatDate(stats.oldestInventoryDate) }}
            </div>
          </div>

          <div class="md:text-right">
            <div class="text-xs text-slate-500">Najnoviji PDSU zapis servisa</div>

            <div class="font-semibold text-slate-900">
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
          <h5 class="pdsu-card-title">Automatski servisi koji nisu pokrenuti</h5>

          <div class="text-xs text-slate-500">
            Servisi podešeni na automatsko pokretanje, ali su trenutno zaustavljeni
          </div>
        </div>

        <span
          class="pdsu-badge"
          :class="automaticStopped.length > 0 ? 'bg-red-600 text-white' : 'bg-green-600 text-white'"
        >
          {{ formatNumber(automaticStopped.length) }}
        </span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
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
              v-for="(item, index) in automaticStopped"
              :key="item.id ?? `${item.ipEntryId}-${item.name}-${index}`"
            >
              <td>
                <div class="font-semibold text-slate-900">
                  {{ item.displayName || item.name || 'Nepoznat servis' }}
                </div>

                <div class="text-xs text-slate-500">
                  {{ item.name || '—' }}
                </div>
              </td>

              <td>
                <div class="font-semibold text-slate-900">
                  {{ item.computerName || 'Nepoznat računar' }}
                </div>

                <div>
                  <code class="pdsu-code">{{ item.ip || '—' }}</code>
                </div>

                <div class="text-xs text-slate-500">
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
                  {{ stateLabel(item.state) }}
                </span>
              </td>

              <td>
                {{ formatDate(item.inventoryDate) }}
              </td>
            </tr>

            <tr v-if="automaticStopped.length === 0">
              <td colspan="6" class="text-center text-slate-500 py-4">
                Nema automatskih servisa koji su zaustavljeni.
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
          <h5 class="pdsu-card-title">Neuobičajene putanje servisa</h5>

          <div class="text-xs text-slate-500">
            Servisi čije izvršne datoteke nisu pronađene u standardnim Windows direktorijumima
          </div>
        </div>

        <span class="pdsu-badge bg-amber-500 text-amber-950">
          {{ formatNumber(unusualPaths.length) }}
        </span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
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
              v-for="(item, index) in unusualPaths"
              :key="item.id ?? `${item.ipEntryId}-${item.name}-${index}`"
            >
              <td>
                <div class="font-semibold text-slate-900">
                  {{ item.displayName || item.name || 'Nepoznat servis' }}
                </div>

                <div class="text-xs text-slate-500">
                  {{ item.name || '—' }}
                </div>
              </td>

              <td>
                <div class="font-semibold text-slate-900">
                  {{ item.computerName || 'Nepoznat računar' }}
                </div>

                <div>
                  <code class="pdsu-code">{{ item.ip || '—' }}</code>
                </div>

                <div class="text-xs text-slate-500">
                  {{ item.department || '—' }}
                </div>
              </td>

              <td>
                <span class="pdsu-badge" :class="startModeBadgeClass(item.startMode)">
                  {{ startModeLabel(item.startMode) }}
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
                  {{ stateLabel(item.state) }}
                </span>
              </td>
            </tr>

            <tr v-if="unusualPaths.length === 0">
              <td colspan="6" class="text-center text-slate-500 py-4">Nema rezultata.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Retki servisi -->
    <div class="pdsu-card">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">Retki servisi</h5>

          <div class="text-xs text-slate-500">Servisi pronađeni na malom broju računara</div>
        </div>

        <span class="pdsu-badge bg-slate-500 text-white">
          {{ formatNumber(rareServices.length) }}
        </span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
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
            <tr v-for="(item, index) in rareServices" :key="`${item.name}-${index}`">
              <td>
                <div class="font-semibold text-slate-900">
                  {{ item.displayName || item.name || 'Nepoznat servis' }}
                </div>

                <div class="text-xs text-slate-500">
                  {{ item.name || '—' }}
                </div>
              </td>

              <td>
                <span class="pdsu-badge" :class="startModeBadgeClass(item.startMode)">
                  {{ startModeLabel(item.startMode) }}
                </span>
              </td>

              <td>
                {{ item.startName || '—' }}
              </td>

              <td class="text-center">
                <span class="pdsu-badge bg-slate-500 text-white">
                  {{ formatNumber(item.computers) }}
                </span>
              </td>

              <td>
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="computer in splitValues(item.computerNames)"
                    :key="computer"
                    class="pdsu-badge bg-slate-100 text-slate-700 border border-slate-200"
                  >
                    {{ computer }}
                  </span>

                  <span v-if="splitValues(item.computerNames).length === 0" class="text-slate-500">
                    Nema podatka
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
              <td colspan="6" class="text-center text-slate-500 py-4">Nema rezultata.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
