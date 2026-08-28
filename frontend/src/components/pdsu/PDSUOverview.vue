<script setup>
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { usePdsuFormatters } from '@/composables/usePdsuFormatters.js'
import { useCurrentSite } from '@/composables/useCurrentSite.js'
import AppButton from '@/components/AppButton.vue'
import NavIcon from '@/components/NavIcon.vue'

const router = useRouter()
const site = useCurrentSite()
const { formatNumber, formatDate: formatDateBase } = usePdsuFormatters()

function formatDate(value) {
  return formatDateBase(value, true)
}

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

  printers: {
    type: Object,
    default: () => ({}),
  },

  missingComputers: {
    type: Array,
    default: () => [],
  },

  exportingMissing: {
    type: Boolean,
    default: false,
  },

  withoutUltravnc: {
    type: Array,
    default: () => [],
  },

  exportingWithoutUltravnc: {
    type: Boolean,
    default: false,
  },

  withoutNetdeskAgentManager: {
    type: Array,
    default: () => [],
  },

  exportingWithoutNetdeskAgentManager: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'export-missing',
  'export-without-ultravnc',
  'export-without-netdesk-agent-manager',
])

// Samo redovi SA agentom mogu da se selektuju na Agenti stranici (bez
// agenta nema kome da se pošalje komanda).
const managerAgentRows = computed(() =>
  props.withoutNetdeskAgentManager.filter((row) => row.agentId),
)

// Isti obrazac kao "🎯 Selektuj agente" na kartici neželjenih programa
// (PDSUFlagged.vue) - umesto checkbox-po-redu selekcije + slanja komande
// direktno sa ove stranice, prosto odeš na Agenti stranicu sa već
// selektovanim ID-jevima i odatle pošalješ BILO KOJU komandu (ne samo
// instalaciju Manager-a) preko postojećeg batch mehanizma. Nema backend
// poziva ovde - ID-jevi su već učitani u props.withoutNetdeskAgentManager.
function selectAgentsFor() {
  const ids = managerAgentRows.value.map((row) => row.agentId)
  router.push({ path: '/agents', query: { site: site.value, agentIds: ids.join(',') } })
}

const softwareStats = computed(() => props.software?.stats ?? {})
const driverStats = computed(() => props.drivers?.stats ?? {})
const serviceStats = computed(() => props.services?.stats ?? {})
const updateStats = computed(() => props.updates?.stats ?? {})
const printerStats = computed(() => props.printers?.stats ?? {})

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
  {
    key: 'printers',
    label: 'Štampači',
    description: 'Računari sa prikupljenim podacima o štampačima',
    value: Number(props.coverage?.withPrinters) || 0,
    missing: Number(props.coverage?.withoutPrinters) || 0,
    percent: Number(props.coverage?.printersPct) || 0,
    barClass: 'bg-purple-600',
  },
])

const alertItems = computed(() => [
  {
    key: 'automaticStopped',
    label: 'Automatski servisi koji ne rade',
    value: Number(serviceStats.value?.automaticStopped) || 0,
    badgeClass:
      Number(serviceStats.value?.automaticStopped) > 0 ? 'bg-bad text-white' : 'bg-good text-white',
  },
  {
    key: 'oldUpdates',
    label: 'Računari bez update-a duže od 90 dana',
    value: Number(updateFreshness.value?.olderThan90Days) || 0,
    badgeClass:
      Number(updateFreshness.value?.olderThan90Days) > 0
        ? 'bg-warn text-white'
        : 'bg-good text-white',
  },
  {
    key: 'missingUpdates',
    label: 'Računari bez update podataka',
    value: Number(updateFreshness.value?.withoutData) || 0,
    badgeClass:
      Number(updateFreshness.value?.withoutData) > 0 ? 'bg-ink-muted text-white' : 'bg-good text-white',
  },
  {
    key: 'missingDriverDates',
    label: 'Drajveri bez datuma',
    value: Number(driverStats.value?.withoutDate) || 0,
    badgeClass:
      Number(driverStats.value?.withoutDate) > 0 ? 'bg-warn text-white' : 'bg-good text-white',
  },
  {
    key: 'printerProblemStatus',
    label: 'Štampači sa problematičnim statusom',
    value: Number(printerStats.value?.problemStatus) || 0,
    badgeClass:
      Number(printerStats.value?.problemStatus) > 0 ? 'bg-bad text-white' : 'bg-good text-white',
  },
])

function percentageClass(percent) {
  const value = Number(percent) || 0

  if (value >= 90) return 'text-good'
  if (value >= 70) return 'text-warn'

  return 'text-bad'
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
              <div class="text-xs text-ink-muted mb-1">Instalirani programi</div>

              <div class="text-3xl font-bold tracking-tight text-ink">
                {{ formatNumber(softwareStats.totalInstallations) }}
              </div>
            </div>

            <span class="pdsu-icon-badge bg-accent">P</span>
          </div>

          <div class="text-xs text-ink-muted mt-3">
            {{ formatNumber(softwareStats.uniqueSoftware) }}
            jedinstvenih programa
          </div>

          <div class="text-xs text-ink-muted">
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
              <div class="text-xs text-ink-muted mb-1">Drajveri</div>

              <div class="text-3xl font-bold tracking-tight text-ink">
                {{ formatNumber(driverStats.totalDrivers) }}
              </div>
            </div>

            <span class="pdsu-icon-badge bg-good">D</span>
          </div>

          <div class="text-xs text-ink-muted mt-3">
            {{ formatNumber(driverStats.uniqueDevices) }}
            jedinstvenih uređaja
          </div>

          <div class="text-xs text-ink-muted">
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
              <div class="text-xs text-ink-muted mb-1">Servisi</div>

              <div class="text-3xl font-bold tracking-tight text-ink">
                {{ formatNumber(serviceStats.totalServices) }}
              </div>
            </div>

            <span class="pdsu-icon-badge bg-warn">S</span>
          </div>

          <div class="text-xs text-ink-muted mt-3">
            {{ formatNumber(serviceStats.running) }}
            pokrenutih
          </div>

          <div class="text-xs text-ink-muted">
            {{ formatNumber(serviceStats.stopped) }}
            zaustavljenih
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="flex items-start justify-between">
            <div>
              <div class="text-xs text-ink-muted mb-1">Updates</div>

              <div class="text-3xl font-bold tracking-tight text-ink">
                {{ formatNumber(updateStats.totalUpdates) }}
              </div>
            </div>

            <span class="pdsu-icon-badge bg-bad">U</span>
          </div>

          <div class="text-xs text-ink-muted mt-3">
            {{ formatNumber(updateStats.uniqueHotfixes) }}
            jedinstvenih KB paketa
          </div>

          <div class="text-xs text-ink-muted">
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

          <div class="text-xs text-ink-muted">U odnosu na ukupan broj računara u sistemu</div>
        </div>

        <span class="pdsu-badge bg-ink text-white"> {{ formatNumber(totalComputers) }} računara </span>
      </div>

      <div class="p-4">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div v-for="item in coverageItems" :key="item.key">
            <div class="flex items-center justify-between mb-2">
              <div>
                <div class="font-semibold text-ink">
                  {{ item.label }}
                </div>

                <div class="text-xs text-ink-muted">
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
                  'text-bad': item.missing > 0,
                  'text-good': item.missing === 0,
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

    <!-- Bez PDSU podataka -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">
            Računari bez PDSU podataka ({{ missingComputers.length }})
          </h5>
          <div class="text-xs text-ink-muted">
            Nema nijedan zapis (ni programi, ni drajveri, ni servisi, ni update-i)
          </div>
        </div>
        <AppButton
          variant="secondary"
          :disabled="!missingComputers.length || exportingMissing"
          @click="emit('export-missing')"
        >
          {{ exportingMissing ? 'Izvoz…' : 'Izvezi PDF' }}
        </AppButton>
      </div>

      <div
        v-if="!missingComputers.length"
        class="p-4 text-sm text-ink-muted"
      >
        Svi računari imaju bar neki PDSU podatak.
      </div>
      <div
        v-else
        class="pdsu-table-wrap"
      >
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>Računar</th>
              <th>IP</th>
              <th>Odeljenje</th>
              <th>OS</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in missingComputers" :key="row.id">
              <td class="font-semibold text-ink">
                <RouterLink :to="`/ip/${row.id}/meta`" class="text-accent hover:underline">
                  {{ row.computerName || 'Nepoznat računar' }}
                </RouterLink>
              </td>
              <td><code class="pdsu-code">{{ row.ip || '—' }}</code></td>
              <td>{{ row.department || '—' }}</td>
              <td>{{ row.os || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Bez UltraVNC -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">
            Računari bez UltraVNC ({{ withoutUltravnc.length }})
          </h5>
          <div class="text-xs text-ink-muted">
            Nema servis nalik UltraVNC (uvnc_service) u servis inventaru - kandidati za
            (ponovno) pokretanje deploy skripte
          </div>
        </div>
        <AppButton
          variant="secondary"
          :disabled="!withoutUltravnc.length || exportingWithoutUltravnc"
          @click="emit('export-without-ultravnc')"
        >
          {{ exportingWithoutUltravnc ? 'Izvoz…' : 'Izvezi PDF' }}
        </AppButton>
      </div>

      <div
        v-if="!withoutUltravnc.length"
        class="p-4 text-sm text-ink-muted"
      >
        Svi računari imaju UltraVNC servis.
      </div>
      <div
        v-else
        class="pdsu-table-wrap"
      >
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>Računar</th>
              <th>IP</th>
              <th>Odeljenje</th>
              <th>OS</th>
              <th>Status</th>
              <th>Servis podaci</th>
              <th>Agent</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in withoutUltravnc" :key="row.id">
              <td class="font-semibold text-ink">
                <RouterLink :to="`/ip/${row.id}/meta`" class="text-accent hover:underline">
                  {{ row.computerName || 'Nepoznat računar' }}
                </RouterLink>
              </td>
              <td><code class="pdsu-code">{{ row.ip || '—' }}</code></td>
              <td>{{ row.department || '—' }}</td>
              <td>{{ row.os || '—' }}</td>
              <td>
                <span
                  class="pdsu-badge"
                  :class="row.isOnline ? 'bg-good text-white' : 'bg-ink-muted text-white'"
                >
                  {{ row.isOnline ? 'Online' : 'Offline' }}
                </span>
              </td>
              <td>
                <span
                  class="pdsu-badge"
                  :class="row.hasServiceData ? 'bg-bad text-white' : 'bg-ink-muted text-white'"
                >
                  {{ row.hasServiceData ? 'Potvrđeno nema' : 'Nema podataka' }}
                </span>
              </td>
              <td>
                <RouterLink
                  v-if="row.agentId"
                  :to="`/agents/${row.agentId}`"
                  class="text-good hover:underline"
                >
                  Otvori agenta
                </RouterLink>
                <span v-else class="text-ink-muted">Nema agenta</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Bez NetdeskAgentManager-a -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h5 class="pdsu-card-title">
            Računari bez NetdeskAgentManager-a ({{ withoutNetdeskAgentManager.length }})
          </h5>
          <div class="text-xs text-ink-muted">
            Nema NetdeskAgentManager servis u servis inventaru - kandidati za instalaciju
            preko "Instaliraj/ažuriraj NetdeskAgent Manager servis" preseta
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="managerAgentRows.length"
            type="button"
            class="inline-flex items-center gap-1 text-accent hover:underline text-sm"
            @click="selectAgentsFor"
          >
            <NavIcon name="target" /> Selektuj agente ({{ managerAgentRows.length }})
          </button>
          <AppButton
            variant="secondary"
            :disabled="!withoutNetdeskAgentManager.length || exportingWithoutNetdeskAgentManager"
            @click="emit('export-without-netdesk-agent-manager')"
          >
            {{ exportingWithoutNetdeskAgentManager ? 'Izvoz…' : 'Izvezi PDF' }}
          </AppButton>
        </div>
      </div>

      <div
        v-if="!withoutNetdeskAgentManager.length"
        class="p-4 text-sm text-ink-muted"
      >
        Svi računari imaju NetdeskAgentManager servis.
      </div>
      <div
        v-else
        class="pdsu-table-wrap"
      >
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>Računar</th>
              <th>IP</th>
              <th>Odeljenje</th>
              <th>OS</th>
              <th>Status</th>
              <th>Servis podaci</th>
              <th>Agent</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in withoutNetdeskAgentManager" :key="row.id">
              <td class="font-semibold text-ink">
                <RouterLink :to="`/ip/${row.id}/meta`" class="text-accent hover:underline">
                  {{ row.computerName || 'Nepoznat računar' }}
                </RouterLink>
              </td>
              <td><code class="pdsu-code">{{ row.ip || '—' }}</code></td>
              <td>{{ row.department || '—' }}</td>
              <td>{{ row.os || '—' }}</td>
              <td>
                <span
                  class="pdsu-badge"
                  :class="row.isOnline ? 'bg-good text-white' : 'bg-ink-muted text-white'"
                >
                  {{ row.isOnline ? 'Online' : 'Offline' }}
                </span>
              </td>
              <td>
                <span
                  class="pdsu-badge"
                  :class="row.hasServiceData ? 'bg-bad text-white' : 'bg-ink-muted text-white'"
                >
                  {{ row.hasServiceData ? 'Potvrđeno nema' : 'Nema podataka' }}
                </span>
              </td>
              <td>
                <RouterLink
                  v-if="row.agentId"
                  :to="`/agents/${row.agentId}`"
                  class="text-good hover:underline"
                >
                  Otvori agenta
                </RouterLink>
                <span v-else class="text-ink-muted">Nema agenta</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Upozorenja i stanje -->
    <div class="grid grid-cols-1 gap-3 xl:grid-cols-12">
      <div class="xl:col-span-7">
        <div class="pdsu-card h-full">
          <div class="pdsu-card-header">
            <h5 class="pdsu-card-title">Stanje koje zahteva pažnju</h5>

            <div class="text-xs text-ink-muted">Najvažniji indikatori iz prikupljenih podataka</div>
          </div>

          <div class="p-4">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div v-for="item in alertItems" :key="item.key">
                <div
                  class="flex h-full items-center justify-between rounded-lg border border-line p-3"
                >
                  <div class="pr-3">
                    <div class="font-semibold text-ink">
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

            <div class="text-xs text-ink-muted">Najnoviji datum inventara po kategoriji</div>
          </div>

          <div class="p-4">
            <div class="flex items-center justify-between gap-3 py-2 border-b border-line">
              <span class="font-semibold text-ink"> Programi </span>

              <span class="text-ink-muted text-right">
                {{ formatDate(softwareStats.newestInventoryDate) }}
              </span>
            </div>

            <div class="flex items-center justify-between gap-3 py-2 border-b border-line">
              <span class="font-semibold text-ink"> Drajveri </span>

              <span class="text-ink-muted text-right">
                {{ formatDate(driverStats.newestInventoryDate) }}
              </span>
            </div>

            <div class="flex items-center justify-between gap-3 py-2 border-b border-line">
              <span class="font-semibold text-ink"> Servisi </span>

              <span class="text-ink-muted text-right">
                {{ formatDate(serviceStats.newestInventoryDate) }}
              </span>
            </div>

            <div class="flex items-center justify-between gap-3 pt-2">
              <span class="font-semibold text-ink"> Updates </span>

              <span class="text-ink-muted text-right">
                {{ formatDate(updateStats.newestInventoryDate) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
