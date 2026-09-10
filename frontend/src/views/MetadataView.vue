<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">
          {{ t('metadata.title') }}
        </h1>
        <p class="text-sm text-ink-muted mt-1">
          {{ t('metadata.subtitle') }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <AppButton
          variant="primary"
          :disabled="loading"
          @click="refreshAll"
        >
          {{ loading ? t('metadata.loadingButton') : t('metadata.refresh') }}
        </AppButton>
        <AppButton
          variant="secondary"
          :disabled="!meta.length || loading"
          @click="exportXlsx"
        >
          {{ t('home.exportXlsx') }}
        </AppButton>
      </div>
    </div>

    <div class="rounded-xl border border-line bg-surface p-3 shadow-sm flex items-center gap-2">
      <input
        v-model="search"
        type="text"
        class="app-input w-full"
        :placeholder="t('metadata.searchPlaceholder')"
      >
      <button
        v-if="search"
        type="button"
        class="shrink-0 text-ink-muted hover:text-ink"
        :title="t('printers.clearSearchAriaLabel')"
        @click="search = ''"
      >
        <NavIcon name="x" />
      </button>
    </div>

    <!-- ================= REZULTATI PRETRAGE (cela baza) ================= -->
    <template v-if="search.trim()">
      <div
        v-if="searchLoading"
        class="rounded-xl border border-line bg-surface p-8 text-center text-ink-muted shadow-sm"
      >
        {{ t('metadata.searching') }}
      </div>
      <div
        v-else-if="!searchResults.length"
        class="rounded-xl border border-line bg-surface p-8 text-center text-ink-muted shadow-sm"
      >
        {{ t('metadata.noSearchResults', { query: search.trim() }) }}
      </div>
      <div
        v-else
        class="rounded-xl border border-line bg-surface p-4 shadow-sm overflow-x-auto"
      >
        <div class="text-sm text-ink-muted mb-3">
          {{ t('metadata.searchResultsCount', { count: searchResults.length >= 100 ? `${searchResults.length}+` : searchResults.length }) }}
        </div>
        <table class="min-w-full text-left text-sm">
          <thead class="table-head-row">
            <tr>
              <th class="px-3 py-2 font-medium whitespace-nowrap">
                {{ t('metadata.colComputer') }}
              </th>
              <th class="px-3 py-2 font-medium whitespace-nowrap">
                IP
              </th>
              <th class="px-3 py-2 font-medium whitespace-nowrap">
                {{ t('common.department') }}
              </th>
              <th class="px-3 py-2 font-medium whitespace-nowrap">
                {{ t('metadata.colUser') }}
              </th>
              <th class="px-3 py-2 font-medium whitespace-nowrap">
                OS
              </th>
              <th class="px-3 py-2 font-medium whitespace-nowrap">
                {{ t('inventory.colManufacturerModel') }}
              </th>
              <th class="px-3 py-2 font-medium whitespace-nowrap">
                CPU
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in searchResults"
              :key="row.ipEntry"
              class="border-b border-line last:border-0 hover:bg-surface-sunken cursor-pointer"
              @click="router.push(`/ip/${row.ipEntry}/meta`)"
            >
              <td class="px-3 py-2 whitespace-nowrap font-medium text-accent">
                {{ row.computerName || '—' }}
              </td>
              <td class="px-3 py-2 whitespace-nowrap font-mono text-xs text-ink-secondary">
                {{ row.ip || '—' }}
              </td>
              <td class="px-3 py-2 whitespace-nowrap text-ink-secondary">
                {{ row.department || '—' }}
              </td>
              <td class="px-3 py-2 whitespace-nowrap text-ink-secondary">
                {{ row.userName || '—' }}
              </td>
              <td class="px-3 py-2 whitespace-nowrap text-ink-secondary">
                {{ row.osCaption || '—' }}
              </td>
              <td class="px-3 py-2 whitespace-nowrap text-ink-secondary">
                {{ [row.systemManufacturer, row.systemModel].filter(Boolean).join(' / ') || '—' }}
              </td>
              <td class="px-3 py-2 whitespace-nowrap text-ink-secondary">
                {{ row.cpuName || '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ================= NORMALAN DASHBOARD (kad se ne pretražuje) ================= -->
    <template v-else>
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          :title="t('metadata.totalMachines')"
          :value="stats.totalWithMeta"
          :sub="fmtPct(stats.coveragePct) + ' ' + t('metadata.coverageSuffix')"
        />
        <KpiCard
          :title="t('metadata.withoutMetadata')"
          :value="Math.max(totalIpEntries - stats.totalWithMeta, 0)"
          :sub="t('metadata.ofTotal', { total: totalIpEntries })"
        />
        <KpiCard
          :title="t('metadata.avgRam')"
          :value="fmtGb(stats.avgRamGb)"
          :sub="t('metadata.medSub', { value: fmtGb(stats.medRamGb) })"
        />
        <KpiCard
          title="SSD/HDD"
          :value="stats.ssdCount + ' / ' + stats.hddCount"
          :sub="fmtTb(stats.totalStorageTb) + ' ' + t('metadata.totalSuffix')"
        />
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          :title="t('metadata.uniqueUsers')"
          :value="stats.uniqueUsers"
          :sub="t('metadata.ofMachines', { count: stats.totalWithMeta })"
        />
        <KpiCard
          :title="t('metadata.avgDiskCount')"
          :value="stats.avgDisks"
          :sub="t('metadata.medSub', { value: stats.medDisks })"
        />
        <KpiCard
          :title="t('metadata.avgNicCount')"
          :value="stats.avgNics"
          :sub="t('metadata.medSub', { value: stats.medNics })"
        />
        <KpiCard
          :title="t('metadata.medianOsAge')"
          :value="stats.medOsAgeDays + ' ' + t('metadata.days')"
          :sub="t('metadata.avgSuffixDays', { count: stats.avgOsAgeDays })"
        />
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          :title="t('metadata.lexarSsdFlag')"
          :value="serverFlags?.lexarCount ?? (displayTables.lexarFlag?.length || 0)"
          :sub="t('metadata.problematicDevices')"
        />
        <KpiCard
          :title="t('metadata.wuNotRunning')"
          :value="wuStatusDist.stopped"
          :sub="t('metadata.alertRiskRule')"
        />
        <KpiCard
          :title="t('metadata.psuDetected')"
          :value="fmtPct(stats.psuDetectedPct)"
          :sub="t('metadata.restNotReadable')"
        />
      </div>

      <!-- ================= BEZ METAPODATAKA ================= -->
      <SectionHeader :title="t('metadata.withoutMetadata')" />
      <div class="rounded-xl border border-line bg-surface p-4 shadow-sm overflow-x-auto">
        <div class="flex items-center justify-between gap-3 mb-3">
          <h2 class="font-semibold text-ink">
            {{ t('metadata.computersWithoutMetadata', { count: missingMetadata.length }) }}
          </h2>
          <AppButton
            variant="secondary"
            :disabled="!missingMetadata.length || exportingMissingPdf"
            @click="exportMissingMetadataPdf"
          >
            {{ exportingMissingPdf ? t('withoutAgent.exporting') : t('withoutAgent.exportPdf') }}
          </AppButton>
        </div>
        <div
          v-if="!missingMetadata.length"
          class="text-sm text-ink-muted"
        >
          {{ t('metadata.allHaveMetadata') }}
        </div>
        <table
          v-else
          class="min-w-full text-left text-sm"
        >
          <thead class="table-head-row">
            <tr>
              <th class="px-3 py-2 font-medium whitespace-nowrap">{{ t('metadata.colComputer') }}</th>
              <th class="px-3 py-2 font-medium whitespace-nowrap">IP</th>
              <th class="px-3 py-2 font-medium whitespace-nowrap">{{ t('common.department') }}</th>
              <th class="px-3 py-2 font-medium whitespace-nowrap">OS</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in missingMetadata"
              :key="row.id"
              class="border-b border-line last:border-0 hover:bg-surface-sunken cursor-pointer"
              @click="router.push(`/ip/${row.id}/meta`)"
            >
              <td class="px-3 py-2 whitespace-nowrap font-medium text-accent">
                {{ row.computerName || '—' }}
              </td>
              <td class="px-3 py-2 whitespace-nowrap font-mono text-xs text-ink-secondary">
                {{ row.ip || '—' }}
              </td>
              <td class="px-3 py-2 whitespace-nowrap text-ink-secondary">
                {{ row.department || '—' }}
              </td>
              <td class="px-3 py-2 whitespace-nowrap text-ink-secondary">
                {{ row.os || '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ================= PREGLED ================= -->
      <SectionHeader :title="t('metadata.overview')" />
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <h2 class="font-semibold text-ink mb-3">
            {{ t('metadata.metadataCoverage') }}
          </h2>
          <MeterBar
            :pct="stats.coveragePct"
            :label="t('metadata.machinesOfTotal', { n: stats.totalWithMeta, total: totalIpEntries })"
          />
        </div>

        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <h2 class="font-semibold text-ink mb-3">
            {{ t('metadata.collectionFreshness') }}
          </h2>
          <div class="text-sm text-ink-secondary mb-2">
            {{ t('metadata.machinesPerDay') }}
          </div>
          <TrendArea
            :series="recencySeries"
            :labels="recencyLabels"
          />
        </div>

        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <div class="flex items-center justify-between mb-3">
            <h2 class="font-semibold text-ink">
              {{ t('metadata.osDistribution') }}
            </h2>
            <span
              class="text-xs text-ink-muted"
              :title="t('metadata.clickRowHint')"
            >🔎 {{ t('metadata.clickForDetails') }}</span>
          </div>
          <div class="space-y-2.5">
            <template
              v-for="row in topOs"
              :key="row.key"
            >
              <HBarChart
                :label="row.key || t('home.typeUnknown')"
                :value="row.count"
                :total="stats.totalWithMeta"
                clickable
                @click="toggleOsDrilldown(row.key)"
              />
              <div
                v-if="osDrilldownKey === row.key"
                class="rounded-lg bg-surface-sunken p-2 space-y-1"
              >
                <RouterLink
                  v-for="m in osDrilldownMachines"
                  :key="m.ipEntry"
                  :to="`/ip/${m.ipEntry}/meta`"
                  class="block truncate text-xs text-accent hover:underline px-1 py-0.5"
                >
                  {{ m.ComputerName || '—' }}
                </RouterLink>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- ================= HARDVER ================= -->
      <SectionHeader :title="t('metadata.hardware')" />
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <h2 class="font-semibold text-ink mb-3">
            {{ t('metadata.systemManufacturers') }}
          </h2>
          <div class="space-y-2.5">
            <HBarChart
              v-for="row in topManufacturers"
              :key="row.key"
              :label="row.key || '—'"
              :value="row.count"
              :total="stats.totalWithMeta"
            />
          </div>
        </div>

        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <h2 class="font-semibold text-ink mb-3">
            {{ t('metadata.gpuPresence') }}
          </h2>
          <SplitBar
            :segments="[
              { label: t('metadata.withDedicatedGpu'), value: stats.withGpu, colorClass: 'bg-accent' },
              { label: t('metadata.withoutGpuOrIgpu'), value: stats.withoutGpu, colorClass: 'bg-line-strong' },
            ]"
          />
          <div class="grid grid-cols-2 gap-3 mt-3">
            <InfoPill
              :label="t('metadata.avgVram')"
              :value="fmtGb(stats.avgVramGb)"
            />
            <InfoPill
              :label="t('metadata.topGpuModel')"
              :value="topGpuName || '—'"
            />
          </div>
        </div>

        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <h2 class="font-semibold text-ink mb-3">
            {{ t('metadata.ramDistribution') }}
          </h2>
          <SplitBar
            :segments="[
              { label: '≤ 8 GB', value: bucketRam.le8, colorClass: 'bg-accent-subtle' },
              { label: '16 GB', value: bucketRam.eq16, colorClass: 'bg-accent' },
              { label: '> 16 GB', value: bucketRam.gt16, colorClass: 'bg-accent-emphasis' },
            ]"
          />
          <div class="grid grid-cols-1 gap-3 mt-3">
            <InfoPill
              :label="t('metadata.maxRam')"
              :value="fmtGb(stats.maxRamGb)"
            />
          </div>
        </div>

        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <h2 class="font-semibold text-ink mb-3">
            {{ t('metadata.networkSpeeds') }}
          </h2>
          <div class="space-y-2.5">
            <HBarChart
              v-for="row in topNicSpeeds"
              :key="row.key"
              :label="fmtMbps(Number(row.key))"
              :value="row.count"
              :total="stats.totalWithMeta"
            />
          </div>
        </div>
      </div>

      <!-- ================= PROCESOR I SKLADIŠTE ================= -->
      <SectionHeader :title="t('metadata.cpuAndStorage')" />
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <h2 class="font-semibold text-ink mb-3">
            {{ t('metadata.cpuModels') }}
          </h2>
          <div class="space-y-2.5">
            <HBarChart
              v-for="row in topCpuModels"
              :key="row.key"
              :label="row.key || '—'"
              :value="row.count"
              :total="stats.totalWithMeta"
            />
          </div>
          <div class="grid grid-cols-3 gap-3 mt-3">
            <InfoPill
              :label="t('metadata.avgCores')"
              :value="stats.avgCpuCores"
            />
            <InfoPill
              :label="t('metadata.avgThreads')"
              :value="stats.avgCpuThreads"
            />
            <InfoPill
              :label="t('metadata.avgClock')"
              :value="stats.avgCpuClockGHz + ' GHz'"
            />
          </div>
        </div>

        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <h2 class="font-semibold text-ink mb-3">
            {{ t('metadata.disksPerMachine') }}
          </h2>
          <SplitBar
            :segments="[
              { label: t('metadata.oneDisk'), value: diskBuckets.eq1, colorClass: 'bg-accent-subtle' },
              { label: t('metadata.twoDisks'), value: diskBuckets.eq2, colorClass: 'bg-accent' },
              { label: t('metadata.threePlusDisks'), value: diskBuckets.ge3, colorClass: 'bg-accent-emphasis' },
            ]"
          />
        </div>
      </div>

      <!-- ================= MATIČNA PLOČA / BIOS / WINDOWS UPDATE ================= -->
      <SectionHeader :title="t('metadata.motherboardBiosWu')" />
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <h2 class="font-semibold text-ink mb-3">
            {{ t('metadata.motherboardManufacturers') }}
          </h2>
          <div class="space-y-2.5">
            <HBarChart
              v-for="row in topMotherboards"
              :key="row.key"
              :label="row.key || '—'"
              :value="row.count"
              :total="stats.totalWithMeta"
            />
          </div>
        </div>

        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <h2 class="font-semibold text-ink mb-3">
            {{ t('metadata.biosVendors') }}
          </h2>
          <div class="space-y-2.5">
            <HBarChart
              v-for="row in topBiosVendors"
              :key="row.key"
              :label="row.key || '—'"
              :value="row.count"
              :total="stats.totalWithMeta"
            />
          </div>
        </div>

        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm lg:col-span-2">
          <h2 class="font-semibold text-ink mb-3">
            {{ t('metadata.wuService') }}
          </h2>
          <SplitBar
            :segments="[
              { label: 'Running', value: wuStatusDist.running, colorClass: 'bg-good' },
              { label: 'Stopped', value: wuStatusDist.stopped, colorClass: 'bg-bad' },
              { label: t('home.typeUnknown'), value: wuStatusDist.unknown, colorClass: 'bg-line-strong' },
            ]"
          />
          <p class="text-xs text-ink-muted mt-2">
            {{ t('metadata.wuStoppedRisk') }}
          </p>
        </div>
      </div>

      <!-- ================= TOP LISTE ================= -->
      <SectionHeader :title="t('metadata.topLists')" />
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm overflow-hidden">
          <h2 class="font-semibold text-ink mb-3">
            {{ t('metadata.leastRam') }}
          </h2>
          <DataTable
            :rows="tables.lowRam"
            :cols="['ComputerName', 'TotalRAM_GB', 'OS/Caption', 'CollectedAt']"
            link-col="ipEntry"
          />
        </div>

        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm overflow-hidden">
          <h2 class="font-semibold text-ink mb-3">
            {{ t('metadata.oldestOsInstall') }}
          </h2>
          <DataTable
            :rows="tables.oldOs"
            :cols="['ComputerName', 'OS/Caption', 'OS/InstallDate', 'CollectedAt']"
            link-col="ipEntry"
          />
        </div>

        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm overflow-hidden xl:col-span-2">
          <h2 class="font-semibold text-ink mb-3">
            {{ t('metadata.mostStorage') }}
          </h2>
          <DataTable
            :rows="tables.topStorage"
            :cols="['ComputerName', 'DisksCount', 'Storage_Total_GB', 'CollectedAt']"
            link-col="ipEntry"
          />
        </div>
      </div>

      <!-- ================= RED-FLAGS ================= -->
      <SectionHeader title="Red-flags" />
      <div class="grid grid-cols-1">
        <div class="rounded-xl border border-bad/40 bg-surface p-4 shadow-sm overflow-hidden">
          <h2 class="font-semibold text-bad mb-1">
            🚩 {{ t('metadata.lexarDetected') }}
          </h2>
          <p class="text-sm text-ink-secondary mb-3">
            {{ t('metadata.lexarDescription') }}
          </p>

          <DataTable
            :rows="(displayTables.lexarFlag || []).map((r) => ({
              ComputerName: r.ComputerName,
              Storage: {
                Model: r.Storage?.Model ?? r['Storage.Model'],
                Serial: r.Storage?.Serial ?? r['Storage.Serial'],
                SizeGB: r.Storage?.SizeGB ?? r['Storage.SizeGB'],
              },
              CollectedAt: r.CollectedAt,
              ipEntry: r.ipEntry,
            }))
            "
            :cols="[
              'ComputerName',
              'Storage/Model',
              'Storage/Serial',
              'Storage/SizeGB',
              'CollectedAt',
            ]"
            link-col="ipEntry"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, h, defineComponent, onBeforeUnmount } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { downloadFromResponse } from '@/utils/download.js'
import { fmtGb, fmtTb, fmtPct, fmtMbps } from '@/utils/format.js'
import { sum, avg, median, round1, joinNonEmpty, groupCount } from '@/utils/math.js'
import {
  totalRamGb,
  cpuNameOf,
  cpuCoresOf,
  cpuThreadsOf,
  cpuClockGHzOf,
} from '@/utils/metadataHelpers.js'
import { useAbortableFetch } from '@/composables/useAbortableFetch.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import { useCurrentSite } from '@/composables/useCurrentSite.js'
import AppButton from '@/components/AppButton.vue'
import NavIcon from '@/components/NavIcon.vue'
import * as XLSX from 'xlsx'

const { t, locale } = useI18n()
const router = useRouter()
const site = useCurrentSite()

const SectionHeader = defineComponent({
  name: 'SectionHeader',
  props: { title: String },
  setup(props) {
    return () =>
      h('h2', { class: 'text-sm font-semibold uppercase tracking-wide text-ink-muted pt-2', style: 'font-family: var(--font-display)' }, props.title)
  },
})

const KpiCard = defineComponent({
  name: 'KpiCard',
  props: { title: String, value: [String, Number], sub: String, icon: String },
  setup(props) {
    return () =>
      h('div', { class: 'rounded-xl border border-line bg-surface p-4 shadow-sm' }, [
        h('div', { class: 'text-2xl' }, props.icon),
        h('div', { class: 'text-ink-secondary text-sm mt-1' }, props.title),
        h('div', { class: 'text-3xl font-semibold tracking-tight font-mono text-ink' }, props.value ?? '—'),
        h('div', { class: 'text-ink-muted text-sm' }, props.sub),
      ])
  },
})

const InfoPill = defineComponent({
  name: 'InfoPill',
  props: { label: String, value: [String, Number] },
  setup(props) {
    return () =>
      h('div', { class: 'rounded-xl border border-line bg-surface-sunken px-3 py-2' }, [
        h('div', { class: 'text-xs text-ink-muted' }, props.label),
        h('div', { class: 'text-lg font-semibold font-mono text-ink' }, props.value ?? '—'),
      ])
  },
})

// A single ratio against a limit -> meter form, same-ramp track.
const MeterBar = defineComponent({
  name: 'MeterBar',
  props: { pct: { type: Number, default: 0 }, label: String },
  setup(props) {
    return () =>
      h('div', { class: 'space-y-2' }, [
        h('div', { class: 'text-sm text-ink-secondary' }, props.label),
        h('div', { class: 'w-full h-3 bg-accent-subtle rounded-full overflow-hidden' }, [
          h('div', {
            class: 'h-full bg-accent rounded-full transition-all',
            style: { width: `${Math.min(100, Math.max(0, props.pct))}%` },
          }),
        ]),
      ])
  },
})

// Magnitude comparison across categories -> horizontal bar, single hue,
// rounded 4px ends, hover reveals exact count + share. Optionally clickable
// for drill-down (only wired where the target field is actually filterable
// on the home page - see drillDownOs()).
const HBarChart = defineComponent({
  name: 'HBarChart',
  props: {
    label: String,
    value: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    clickable: { type: Boolean, default: false },
  },
  emits: ['click'],
  setup(props, { emit }) {
    const hovered = ref(false)
    const pct = computed(() => Math.min(100, Math.round((props.value / (props.total || 1)) * 100)))
    return () =>
      h(
        'div',
        {
          class: ['text-sm', props.clickable ? 'cursor-pointer group' : ''],
          onMouseenter: () => (hovered.value = true),
          onMouseleave: () => (hovered.value = false),
          onClick: () => props.clickable && emit('click'),
        },
        [
          h('div', { class: 'flex items-center justify-between' }, [
            h(
              'span',
              {
                class: [
                  'truncate pr-2',
                  props.clickable ? 'group-hover:underline group-hover:text-accent-emphasis' : '',
                ],
              },
              props.label,
            ),
            h(
              'span',
              { class: 'tabular-nums text-ink-muted text-xs shrink-0 font-mono' },
              hovered.value ? `${props.value} (${pct.value}%)` : String(props.value ?? 0),
            ),
          ]),
          h('div', { class: 'w-full h-2.5 bg-surface-sunken rounded-full overflow-hidden' }, [
            h('div', {
              class: ['h-full rounded-full transition-all', hovered.value ? 'bg-accent-emphasis' : 'bg-accent'],
              style: { width: `${pct.value}%` },
            }),
          ]),
        ],
      )
  },
})

// Part-to-whole across 2-3 categories -> horizontal 100% stacked bar (same
// visual language as UptimeTimeline), with a legend so identity never rides
// on color alone.
const SplitBar = defineComponent({
  name: 'SplitBar',
  props: { segments: { type: Array, default: () => [] } },
  setup(props) {
    const hovered = ref(null)
    const visible = computed(() => props.segments.filter((s) => (s.value || 0) > 0))
    return () =>
      h('div', { class: 'space-y-2' }, [
        h(
          'div',
          { class: 'flex h-6 w-full overflow-hidden rounded-md bg-surface-sunken' },
          visible.value.map((s, idx) =>
            h('div', {
              key: idx,
              class: ['h-full first:rounded-l-md last:rounded-r-md', s.colorClass],
              style: { flexGrow: s.value, flexBasis: 0, marginLeft: idx > 0 ? '2px' : 0 },
              title: `${s.label}: ${s.value}`,
              onMouseenter: () => (hovered.value = s),
              onMouseleave: () => (hovered.value = null),
            }),
          ),
        ),
        h(
          'div',
          { class: 'flex flex-wrap items-center gap-3 text-xs text-ink-secondary' },
          props.segments.map((s, idx) =>
            h('span', { key: idx, class: 'inline-flex items-center gap-1.5' }, [
              h('span', { class: ['h-2 w-2 rounded-full shrink-0', s.colorClass] }),
              `${s.label}: ${s.value}`,
            ]),
          ),
        ),
      ])
  },
})

// Trend over time -> area + line, single hue, per-point hover tooltip.
const TrendArea = defineComponent({
  name: 'TrendArea',
  props: {
    series: { type: Array, default: () => [] },
    labels: { type: Array, default: () => [] },
  },
  setup(props) {
    const hoverIdx = ref(null)
    return () => {
      const width = 320
      const height = 90
      const pad = 8
      const n = props.series.length
      const max = Math.max(1, ...props.series)
      const step = n > 1 ? (width - pad * 2) / (n - 1) : 0
      const pts = props.series.map((v, i) => {
        const x = pad + i * step
        const y = height - pad - (v / max) * (height - pad * 2)
        return [x, y]
      })
      const linePoints = pts.map(([x, y]) => `${x},${y}`).join(' ')
      const areaPoints = `${pad},${height - pad} ${linePoints} ${width - pad},${height - pad}`
      const activePt = hoverIdx.value != null ? pts[hoverIdx.value] : null

      return h('div', { class: 'relative' }, [
        h(
          'svg',
          { width, height, viewBox: `0 0 ${width} ${height}`, class: 'w-full', preserveAspectRatio: 'none' },
          [
            h('polygon', { points: areaPoints, class: 'fill-accent-subtle' }),
            h('polyline', {
              points: linePoints,
              fill: 'none',
              stroke: 'currentColor',
              'stroke-width': 2,
              class: 'text-accent',
            }),
            activePt
              ? h('circle', { cx: activePt[0], cy: activePt[1], r: 4, class: 'fill-accent' })
              : null,
            ...pts.map(([x], i) =>
              h('rect', {
                key: i,
                x: x - Math.max(step, 8) / 2,
                y: 0,
                width: Math.max(step, 8),
                height,
                fill: 'transparent',
                onMouseenter: () => (hoverIdx.value = i),
                onMouseleave: () => (hoverIdx.value = null),
              }),
            ),
          ],
        ),
        hoverIdx.value != null
          ? h(
            'div',
            {
              class:
                'absolute top-0 -translate-y-full rounded-lg border border-line bg-surface px-2 py-1 text-xs shadow-sm pointer-events-none whitespace-nowrap',
              style: { left: `${(activePt[0] / width) * 100}%`, transform: 'translate(-50%, -100%)' },
            },
            [
              h('div', { class: 'font-medium text-ink font-mono' }, t('metadata.machinesCount', { count: props.series[hoverIdx.value] })),
              props.labels[hoverIdx.value]
                ? h('div', { class: 'text-ink-muted font-mono' }, props.labels[hoverIdx.value])
                : null,
            ],
          )
          : null,
      ])
    }
  },
})

const DataTable = defineComponent({
  name: 'DataTable',
  props: { rows: { type: Array, default: () => [] }, cols: Array, linkCol: String },
  setup(props) {
    const routerLocal = useRouter()
    const get = (obj, path) => path.split('/').reduce((o, k) => (o ? o[k] : undefined), obj)
    const formatCell = (v) => {
      if (v == null || v === '') return '—'
      if (typeof v === 'number') return v
      const d = new Date(v)
      return isNaN(d) ? v : d.toLocaleString()
    }
    return () =>
      h('div', { class: 'overflow-x-auto' }, [
        h('table', { class: 'min-w-full text-left text-sm' }, [
          h('thead', { class: 'table-head-row' }, [
            h(
              'tr',
              {},
              props.cols.map((c) => h('th', { class: 'px-3 py-2 whitespace-nowrap' }, c)),
            ),
          ]),
          h(
            'tbody',
            {},
            (props.rows || []).map((r, i) => {
              const targetId = props.linkCol ? r[props.linkCol] : null
              return h(
                'tr',
                {
                  key: i,
                  class: [
                    'border-b border-line last:border-0 hover:bg-surface-sunken',
                    targetId ? 'cursor-pointer' : '',
                  ],
                  title: targetId ? t('metadata.openMetadataTitle') : undefined,
                  onClick: targetId ? () => routerLocal.push(`/ip/${targetId}/meta`) : undefined,
                },
                props.cols.map((c) =>
                  h('td', { class: 'px-3 py-2 whitespace-nowrap text-ink-secondary font-mono' }, formatCell(get(r, c))),
                ),
              )
            }),
          ),
        ]),
      ])
  },
})

const meta = ref([])
const totalIpEntries = ref(0)
const loading = ref(false)
const serverTables = ref(null)
const serverFlags = ref(null)
const displayTables = computed(() => serverTables.value || tables.value)
const { getSignal, abort } = useAbortableFetch()

const missingMetadata = ref([])
const exportingMissingPdf = ref(false)

async function fetchMissingMetadata() {
  try {
    const res = await fetchWithAuth(`/api/protected/metadata/missing?site=${site.value}`)
    if (!res.ok) return
    const data = await res.json()
    missingMetadata.value = Array.isArray(data.items) ? data.items : []
  } catch {
    /* best effort */
  }
}

async function exportMissingMetadataPdf() {
  exportingMissingPdf.value = true
  try {
    const dateStamp = new Date().toISOString().slice(0, 10)
    await downloadFromResponse(
      await fetchWithAuth(`/api/protected/metadata/missing/export-pdf?site=${site.value}`),
      `NetDesk_bez_metapodataka_${dateStamp}.pdf`
    )
  } catch (err) {
    console.error('Export bez metapodataka greška:', err)
  } finally {
    exportingMissingPdf.value = false
  }
}

// Pretraga preko CELE baze (isti obrazac kao PDSUAnalyticsView) - namerno
// odvojena od klijentski učitanog `meta` (koji je samo trenutna stranica po
// 200) i gađa /api/protected/metadata/search, koje pretražuje direktno u
// bazi bez obzira šta je trenutno učitano u browseru.
const { search } = usePaginatedRoute({
  fields: { search: { type: 'string', default: '', omitIfEmpty: true } },
  useReplace: true,
})
const searchResults = ref([])
const searchLoading = ref(false)
const { getSignal: getSearchSignal } = useAbortableFetch()
let searchTimer = null

async function runSearch() {
  const query = search.value.trim()
  if (!query) {
    searchResults.value = []
    return
  }
  searchLoading.value = true
  try {
    const params = new URLSearchParams({ q: query, site: site.value })
    const res = await fetchWithAuth(`/api/protected/metadata/search?${params.toString()}`, {
      signal: getSearchSignal(),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    searchResults.value = Array.isArray(data.items) ? data.items : []
  } catch (err) {
    if (err?.name !== 'AbortError') {
      console.error('Metadata pretraga greška:', err)
      searchResults.value = []
    }
  } finally {
    searchLoading.value = false
  }
}

watch([search, site], () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(runSearch, 300)
}, { immediate: true })

// Inline drill-down (not a HomeView navigation): ip_entries.os (what
// HomeView's os filter matches exactly against) and computer_metadata's
// OS.Caption/Version (what this chart groups by) are two independently
// maintained fields with different value shapes ("Windows 10" vs
// "Microsoft Windows 10 Pro 10.0.19045") - an exact-match filter built from
// one would silently return nothing against the other. Since the exact
// ipEntry id for every machine is already available client-side in
// meta.value, showing the matching machines right here is both correct and
// avoids a broken cross-page filter.
const osDrilldownKey = ref(null)
function toggleOsDrilldown(osKey) {
  osDrilldownKey.value = osDrilldownKey.value === osKey ? null : osKey
}
const osDrilldownMachines = computed(() => {
  if (!osDrilldownKey.value) return []
  return meta.value
    .filter((x) => joinNonEmpty([x?.OS?.Caption, x?.OS?.Version], ' ') === osDrilldownKey.value)
    .map((x) => ({ ipEntry: x.ipEntry, ComputerName: x.ComputerName }))
    .filter((m) => m.ipEntry)
})

async function fetchStatsPreferServer() {
  // Napomena: /api/protected/metadata i /api/protected/metadata/stats već
  // filtriraju na entry_type = 'computer' na backend-u (vidi metadata.repo.js).
  // Namerno se NE oslanjamo na /api/protected/ip-addresses kao fallback ovde -
  // ta lista nije filtrirana po tipu i vraćala bi i aparate.
  try {
    const res = await fetchWithAuth(`/api/protected/metadata/stats?site=${site.value}`)
    if (res.ok) {
      const payload = await res.json()
      if (payload?.tables) serverTables.value = payload.tables
      if (payload?.flags) serverFlags.value = payload.flags
      totalIpEntries.value = Number(payload.cover?.totalIpEntries) || 0
    }
  } catch {
    /* best effort */
  }

  try {
    let page = 1,
      all = []
    while (true) {
      const r = await fetchWithAuth(`/api/protected/metadata?page=${page}&limit=200&site=${site.value}`, {
        signal: getSignal(),
      })
      if (!r.ok) break
      const d = await r.json()
      if (Array.isArray(d.items)) {
        all.push(...d.items)
        if (d.items.length < 200) break
        page++
      } else if (Array.isArray(d)) {
        all = d
        break
      } else {
        break
      }
    }
    meta.value = all
  } catch { /* best effort */ }
}

async function refreshAll() {
  loading.value = true
  getSignal()
  serverTables.value = null
  serverFlags.value = null
  meta.value = []
  await Promise.all([fetchStatsPreferServer(), fetchMissingMetadata()])
  loading.value = false
}

onMounted(refreshAll)

onBeforeUnmount(() => {
  abort()
  clearTimeout(searchTimer)
})

watch(site, refreshAll)

const cpuDist = computed(() => groupCount(meta.value.map((x) => cpuNameOf(x)).filter(Boolean)))
const topCpuModels = computed(() => cpuDist.value.slice(0, 5))

const diskBuckets = computed(() => {
  const counts = meta.value.map((x) => (x?.Storage ? x.Storage.length : 0))
  return {
    eq1: counts.filter((c) => c === 1).length,
    eq2: counts.filter((c) => c === 2).length,
    ge3: counts.filter((c) => c >= 3).length,
  }
})

const osDist = computed(() =>
  groupCount(meta.value.map((x) => joinNonEmpty([x?.OS?.Caption, x?.OS?.Version], ' ')))
)
const topOs = computed(() => osDist.value.slice(0, 5))

const manufacturers = computed(() =>
  groupCount(meta.value.map((x) => x?.System?.Manufacturer || x?.Motherboard?.Manufacturer))
)
const topManufacturers = computed(() => manufacturers.value.slice(0, 6))

const motherboardDist = computed(() =>
  groupCount(meta.value.map((x) => x?.Motherboard?.Manufacturer).filter(Boolean))
)
const topMotherboards = computed(() => motherboardDist.value.slice(0, 5))

const biosDist = computed(() =>
  groupCount(meta.value.map((x) => x?.BIOS?.Vendor).filter(Boolean))
)
const topBiosVendors = computed(() => biosDist.value.slice(0, 5))

const wuStatusDist = computed(() => {
  const statuses = meta.value.map((x) => x?.WindowsUpdate?.ServiceStatus || null)
  return {
    running: statuses.filter((s) => s === 'Running').length,
    stopped: statuses.filter((s) => s && s !== 'Running').length,
    unknown: statuses.filter((s) => !s).length,
  }
})

const topNicSpeeds = computed(() => {
  const speeds = meta.value.flatMap((x) => (x?.NICs || []).map((n) => Number(n?.SpeedMbps) || 0))
  const filtered = speeds.filter((s) => Number.isFinite(s) && s > 0)
  const rounded = filtered.map((s) => (s >= 950 && s <= 1100 ? 1000 : s))
  return groupCount(rounded.map(String)).slice(0, 5)
})

const topGpuName = computed(() => {
  const names = meta.value.flatMap((x) => (x?.GPUs || []).map((g) => g?.Name).filter(Boolean))
  const grouped = groupCount(names)
  return grouped[0]?.key
})

const bucketRam = computed(() => {
  const totals = meta.value.map((x) => totalRamGb(x))
  return {
    le8: totals.filter((v) => v > 0 && v <= 8).length,
    eq16: totals.filter((v) => v === 16).length,
    gt16: totals.filter((v) => v > 16).length,
  }
})

const RECENCY_DAYS = 14
const recencySeries = computed(() => {
  const counts = Array(RECENCY_DAYS).fill(0)
  const now = new Date()
  for (const x of meta.value) {
    const d = new Date(x?.CollectedAt)
    if (isNaN(d)) continue
    const diff = Math.floor((now - d) / (24 * 3600 * 1000))
    if (diff >= 0 && diff < RECENCY_DAYS) counts[RECENCY_DAYS - 1 - diff]++
  }
  return counts
})
const recencyLabels = computed(() => {
  const now = new Date()
  return Array.from({ length: RECENCY_DAYS }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - (RECENCY_DAYS - 1 - i))
    return d.toLocaleDateString(locale.value === 'en' ? 'en-US' : 'sr-RS', { day: '2-digit', month: '2-digit' })
  })
})

const _osAgesDays = computed(() => {
  const now = Date.now()
  return meta.value
    .map((x) => {
      const d = new Date(x?.OS?.InstallDate)
      return isNaN(d) ? null : Math.max(0, Math.floor((now - d.getTime()) / 86400000))
    })
    .filter((v) => Number.isFinite(v))
})

const stats = computed(() => {
  const m = meta.value
  const n = m.length

  const ramTotals = m.map((x) => totalRamGb(x))
  const avgRam = avg(ramTotals),
    medRam = median(ramTotals),
    maxRam = Math.max(0, ...ramTotals)

  const stor = m.flatMap((x) => x?.Storage || [])
  const ssd = stor.filter((s) => (s?.MediaType || '').toUpperCase().includes('SSD'))
  const hdd = stor.filter((s) => (s?.MediaType || '').toUpperCase().includes('HDD'))
  const totalGb = sum(stor.map((s) => Number(s?.SizeGB) || 0))

  const withGpu = m.filter((x) => (x?.GPUs || []).length > 0).length
  const vramAll = m
    .map((x) => avg((x?.GPUs || []).map((g) => Number(g?.VRAM_GB) || 0)))
    .filter(Boolean)
  const avgVram = avg(vramAll)

  const coverage = totalIpEntries.value ? Math.round((n / totalIpEntries.value) * 100) : 100

  const uniqueUsers = new Set(m.map((x) => (x?.UserName || '').trim()).filter(Boolean))
  const diskCounts = m.map((x) => (x?.Storage ? x.Storage.length : 0))
  const nicCounts = m.map((x) => (x?.NICs ? x.NICs.length : 0))
  const cores = m.map((x) => cpuCoresOf(x)).filter((v) => v > 0)
  const threads = m.map((x) => cpuThreadsOf(x)).filter((v) => v > 0)
  const clocks = m.map((x) => cpuClockGHzOf(x)).filter((v) => v > 0)
  const osAges = _osAgesDays.value

  const psuDetected = m.filter((x) => x?.PSU && !/unknown/i.test(x.PSU)).length

  return {
    totalWithMeta: n,
    avgRamGb: round1(avgRam),
    medRamGb: round1(medRam),
    maxRamGb: round1(maxRam),
    ssdCount: ssd.length,
    hddCount: hdd.length,
    totalStorageTb: round1(totalGb / 1024),
    withGpu,
    withoutGpu: Math.max(n - withGpu, 0),
    avgVramGb: round1(avgVram),
    coveragePct: coverage,

    uniqueUsers: uniqueUsers.size,
    avgDisks: round1(avg(diskCounts)),
    medDisks: median(diskCounts),
    avgNics: round1(avg(nicCounts)),
    medNics: median(nicCounts),
    avgCpuCores: round1(avg(cores)),
    avgCpuThreads: round1(avg(threads)),
    avgCpuClockGHz: round1(avg(clocks)),
    medOsAgeDays: Math.round(median(osAges)),
    avgOsAgeDays: Math.round(avg(osAges)),
    psuDetectedPct: n ? Math.round((psuDetected / n) * 100) : 0,
  }
})

const tables = computed(() => {
  const m = meta.value

  const withTotals = m.map((x) => ({
    ComputerName: x?.ComputerName || '—',
    TotalRAM_GB: totalRamGb(x) || 0,
    OS: { Caption: x?.OS?.Caption },
    CollectedAt: x?.CollectedAt,
    ipEntry: x?.ipEntry,
  }))
  const lowRam = [...withTotals].sort((a, b) => a.TotalRAM_GB - b.TotalRAM_GB).slice(0, 10)

  const oldOs = m
    .map((x) => ({
      ComputerName: x?.ComputerName || '—',
      OS: { Caption: x?.OS?.Caption, InstallDate: x?.OS?.InstallDate },
      CollectedAt: x?.CollectedAt,
      ipEntry: x?.ipEntry,
    }))
    .filter((r) => r?.OS?.InstallDate)
    .sort((a, b) => new Date(a.OS.InstallDate) - new Date(b.OS.InstallDate))
    .slice(0, 10)

  const storageRows = m.map((x) => {
    const disks = x?.Storage || []
    return {
      ComputerName: x?.ComputerName || '—',
      DisksCount: disks.length || 0,
      Storage_Total_GB: sum(disks.map((s) => Number(s?.SizeGB) || 0)),
      CollectedAt: x?.CollectedAt,
      ipEntry: x?.ipEntry,
    }
  })
  const topStorage = storageRows
    .sort((a, b) => b.Storage_Total_GB - a.Storage_Total_GB)
    .slice(0, 10)

  return {
    lowRam: lowRam || [],
    oldOs: oldOs || [],
    topStorage: topStorage || [],
  }
})

function exportXlsx() {
  if (!meta.value.length) return
  const rows = meta.value.map((x) => ({
    ComputerName: x?.ComputerName || '',
    UserName: x?.UserName || '',
    CollectedAt: x?.CollectedAt || '',
    OS_Caption: x?.OS?.Caption || '',
    OS_Version: x?.OS?.Version || '',
    OS_Build: x?.OS?.Build || '',
    OS_InstallDate: x?.OS?.InstallDate || '',
    System_Manufacturer: x?.System?.Manufacturer || '',
    System_Model: x?.System?.Model || '',
    System_TotalRAM_GB: totalRamGb(x) || '',
    GPUs_Count: (x?.GPUs || []).length,
    Storage_Total_GB: sum((x?.Storage || []).map((s) => Number(s?.SizeGB) || 0)),
  }))

  const header = Object.keys(rows[0] || { dummy: '' })
  const ws = XLSX.utils.json_to_sheet(rows, { header })
  const colWidths = header.map((h) => {
    const maxLen = Math.max(h.length, ...rows.map((r) => String(r[h] ?? '').length))
    return { wch: Math.min(60, Math.max(8, maxLen + 2)) }
  })
  ws['!cols'] = colWidths

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Metadata')
  XLSX.writeFile(wb, 'metadata_stats.xlsx')
}
</script>
