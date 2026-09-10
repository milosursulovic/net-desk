<script setup>
import { ref, computed, h, defineComponent, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { useToast } from '@/composables/useToast.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const { t, locale } = useI18n()
const { toast, showToast } = useToast()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()
const { isAdmin } = useCurrentUser()

const LIVE_POLL_MS = 4000

const KpiCard = defineComponent({
  name: 'KpiCard',
  props: { title: String, value: [String, Number], sub: String, warn: Boolean },
  setup(props) {
    return () =>
      h('div', { class: 'rounded-xl border border-line bg-surface p-4 shadow-sm' }, [
        h('div', { class: 'text-ink-muted text-sm' }, props.title),
        h(
          'div',
          { class: ['text-2xl font-semibold tracking-tight font-mono', props.warn ? 'text-bad' : 'text-ink'] },
          props.value ?? '—',
        ),
        props.sub ? h('div', { class: 'text-ink-muted text-xs mt-1' }, props.sub) : null,
      ])
  },
})

// Same minimal single-hue trend line as MetadataView.vue's local TrendArea -
// deliberately not extracted into a shared component (only these two pages
// use it, and their prop shapes differ slightly).
const TrendLine = defineComponent({
  name: 'TrendLine',
  props: {
    points: { type: Array, default: () => [] }, // [{ x: Date|string, y: number }]
    unit: { type: String, default: '' },
  },
  setup(props) {
    const hoverIdx = ref(null)
    return () => {
      const width = 600
      const height = 120
      const pad = 10
      const n = props.points.length
      if (n < 2) {
        return h('div', { class: 'text-sm text-ink-muted py-8 text-center' }, t('serverHealth.notEnoughData'))
      }
      const ys = props.points.map((p) => p.y ?? 0)
      const max = Math.max(1, ...ys)
      const step = (width - pad * 2) / (n - 1)
      const pts = ys.map((y, i) => {
        const x = pad + i * step
        const py = height - pad - (y / max) * (height - pad * 2)
        return [x, py]
      })
      const linePoints = pts.map(([x, y]) => `${x},${y}`).join(' ')
      const areaPoints = `${pad},${height - pad} ${linePoints} ${width - pad},${height - pad}`
      const activePt = hoverIdx.value != null ? pts[hoverIdx.value] : null

      return h('div', { class: 'relative' }, [
        h('svg', { width, height, viewBox: `0 0 ${width} ${height}`, class: 'w-full', preserveAspectRatio: 'none' }, [
          h('polygon', { points: areaPoints, class: 'fill-accent-subtle' }),
          h('polyline', { points: linePoints, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, class: 'text-accent' }),
          activePt ? h('circle', { cx: activePt[0], cy: activePt[1], r: 4, class: 'fill-accent' }) : null,
          ...pts.map(([x], i) =>
            h('rect', {
              key: i,
              x: x - Math.max(step, 6) / 2,
              y: 0,
              width: Math.max(step, 6),
              height,
              fill: 'transparent',
              onMouseenter: () => (hoverIdx.value = i),
              onMouseleave: () => (hoverIdx.value = null),
            }),
          ),
        ]),
        hoverIdx.value != null
          ? h(
              'div',
              {
                class:
                  'absolute top-0 -translate-y-full rounded-lg border border-line bg-surface px-2 py-1 text-xs shadow-sm pointer-events-none whitespace-nowrap',
                style: { left: `${(activePt[0] / width) * 100}%`, transform: 'translate(-50%, -100%)' },
              },
              [
                h('div', { class: 'font-medium text-ink font-mono' }, `${props.points[hoverIdx.value].y ?? '—'}${props.unit}`),
                h('div', { class: 'text-ink-muted font-mono' }, fmtHistTime(props.points[hoverIdx.value].x)),
              ],
            )
          : null,
      ])
    }
  },
})

function fmtHistTime(v) {
  const d = new Date(v)
  return isNaN(d) ? '—' : d.toLocaleString(locale.value === 'en' ? 'en-US' : 'sr-RS', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}

const live = ref(null)
const liveError = ref('')
const history = ref([])
const historyLoading = ref(false)
const historyHours = ref(24)

async function loadLive() {
  try {
    const res = await fetchWithAuth('/api/protected/server-health/live')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    live.value = await res.json()
    liveError.value = ''
  } catch (err) {
    console.error('Greška pri učitavanju live stanja servera:', err)
    liveError.value = t('serverHealth.errorLoadLive')
  }
}

async function loadHistory() {
  historyLoading.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/server-health/history?hours=${historyHours.value}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    history.value = Array.isArray(data.items) ? data.items : []
  } catch (err) {
    console.error('Greška pri učitavanju istorije servera:', err)
  } finally {
    historyLoading.value = false
  }
}

const cpuPoints = computed(() => history.value.map((h) => ({ x: h.recordedAt, y: h.cpuLoadPct })))
const ramPoints = computed(() => history.value.map((h) => ({ x: h.recordedAt, y: h.ramUsedPct })))
const reqPoints = computed(() => history.value.map((h) => ({ x: h.recordedAt, y: h.requestsPerMin })))
const respPoints = computed(() => history.value.map((h) => ({ x: h.recordedAt, y: h.avgResponseMs })))
const dbSizePoints = computed(() => history.value.map((h) => ({ x: h.recordedAt, y: h.dbSizeMb })))
const queryMsPoints = computed(() => history.value.map((h) => ({ x: h.recordedAt, y: h.avgQueryMs })))
const p95Points = computed(() => history.value.map((h) => ({ x: h.recordedAt, y: h.p95ResponseMs })))
const p99Points = computed(() => history.value.map((h) => ({ x: h.recordedAt, y: h.p99ResponseMs })))
const heapPoints = computed(() => history.value.map((h) => ({ x: h.recordedAt, y: h.processHeapUsedMb })))
const mariadbCpuPoints = computed(() => history.value.map((h) => ({ x: h.recordedAt, y: h.mariadbCpuPct })))

function selectHours(h) {
  historyHours.value = h
  loadHistory()
}

const ghostAudit = ref(null)
const ghostAuditLoading = ref(false)
const ghostCleaning = ref(false)

async function runGhostAudit() {
  ghostAuditLoading.value = true
  try {
    const res = await fetchWithAuth('/api/protected/server-health/ghost-audit')
    if (!res.ok) throw new Error(await parseError(res, `HTTP ${res.status}`))
    ghostAudit.value = await res.json()
  } catch (err) {
    console.error('Greška pri proveri ghost referenci:', err)
    showToast(t('serverHealth.errorGhostAudit'), { kind: 'error', duration: 3000 })
  } finally {
    ghostAuditLoading.value = false
  }
}

async function cleanGhostReferences() {
  const ok = await askConfirm(
    t('serverHealth.confirmCleanMessage', { count: ghostAudit.value?.totalOrphans ?? 0 }),
    { title: t('serverHealth.confirmCleanTitle') },
  )
  if (!ok) return

  ghostCleaning.value = true
  try {
    const res = await fetchWithAuth('/api/protected/server-health/ghost-cleanup', { method: 'POST' })
    if (!res.ok) throw new Error(await parseError(res, `HTTP ${res.status}`))
    const data = await res.json()
    const total = data.cleaned.reduce((sum, c) => sum + (c.deleted || c.fixed || 0), 0)
    showToast(total ? t('serverHealth.cleanedCount', { count: total }) : t('serverHealth.nothingToClean'))
    await runGhostAudit()
  } catch (err) {
    console.error('Greška pri čišćenju baze:', err)
    showToast(t('serverHealth.errorCleanDb'), { kind: 'error', duration: 3000 })
  } finally {
    ghostCleaning.value = false
  }
}

let liveTimer = null
onMounted(() => {
  loadLive()
  loadHistory()
  runGhostAudit()
  liveTimer = setInterval(loadLive, LIVE_POLL_MS)
})
onBeforeUnmount(() => {
  if (liveTimer) clearInterval(liveTimer)
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">{{ t('nav.server') }}</h1>
        <p class="text-sm text-ink-muted mt-1">
          {{ t('serverHealth.subtitle') }}
        </p>
      </div>
    </div>

    <div v-if="liveError" class="rounded-lg border border-bad/40 bg-bad-subtle px-4 py-3 text-bad text-sm">
      {{ liveError }}
    </div>

    <template v-if="live">
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="CPU"
          :value="live.system.cpuLoadPct != null ? live.system.cpuLoadPct + '%' : '—'"
          :warn="live.system.cpuLoadPct > 85"
        />
        <KpiCard
          title="RAM"
          :value="live.system.ramUsedPct != null ? live.system.ramUsedPct + '%' : '—'"
          :sub="`${live.system.ramUsedMb} / ${live.system.ramTotalMb} MB`"
          :warn="live.system.ramUsedPct > 85"
        />
        <KpiCard
          :title="t('serverHealth.diskMainVolume')"
          :value="live.system.diskUsedPct != null ? live.system.diskUsedPct + '%' : '—'"
          :warn="live.system.diskUsedPct > 90"
        />
        <KpiCard
          :title="t('serverHealth.nodeProcess')"
          :value="live.process.rssMb + ' MB'"
          :sub="t('serverHealth.nodeProcessSub', { heap: live.process.heapUsedMb, hours: Math.floor(live.process.uptimeSeconds / 3600) })"
        />
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          :title="t('serverHealth.requestsPerMin')"
          :value="live.requests.requestsPerMin"
        />
        <KpiCard
          :title="t('serverHealth.avgResponseTime')"
          :value="live.requests.avgResponseMs + ' ms'"
          :sub="t('serverHealth.avgResponseSub')"
          :warn="live.requests.avgResponseMs > 100"
        />
        <KpiCard
          :title="t('serverHealth.p95ResponseTime')"
          :value="live.requests.p95ResponseMs + ' ms'"
          :sub="t('serverHealth.p95Sub')"
          :warn="live.requests.p95ResponseMs > 300"
        />
        <KpiCard
          :title="t('serverHealth.p99ResponseTime')"
          :value="live.requests.p99ResponseMs + ' ms'"
          :sub="t('serverHealth.p99Sub')"
          :warn="live.requests.p99ResponseMs > 1000"
        />
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          :title="t('serverHealth.errorRate')"
          :value="live.requests.errorRatePct + '%'"
          :warn="live.requests.errorRatePct > 5"
        />
        <KpiCard
          :title="t('serverHealth.dbSize')"
          :value="live.db.size.totalSizeMb + ' MB'"
        />
        <KpiCard
          :title="t('serverHealth.mariadbCpu')"
          :value="live.db.process.found ? live.db.process.cpuPct + '%' : t('serverHealth.notFound')"
          :warn="live.db.process.found && live.db.process.cpuPct > 80"
        />
        <KpiCard
          :title="t('serverHealth.mariadbRam')"
          :value="live.db.process.found ? live.db.process.memMb + ' MB' : t('serverHealth.notFound')"
        />
      </div>

      <div class="rounded-xl border border-line bg-surface p-4 shadow-sm overflow-x-auto">
        <h2 class="font-semibold text-ink mb-3">
          {{ t('serverHealth.topRoutesTitle') }}
        </h2>
        <div v-if="!live.requests.topRoutes.length" class="text-sm text-ink-muted">
          {{ t('serverHealth.noRequestsLastMinute') }}
        </div>
        <table v-else class="min-w-full text-left text-sm">
          <thead class="table-head-row">
            <tr>
              <th class="px-3 py-2 font-medium whitespace-nowrap">{{ t('serverHealth.colRoute') }}</th>
              <th class="px-3 py-2 font-medium whitespace-nowrap">{{ t('serverHealth.colCount') }}</th>
              <th class="px-3 py-2 font-medium whitespace-nowrap">{{ t('serverHealth.colAvgMs') }}</th>
              <th class="px-3 py-2 font-medium whitespace-nowrap">{{ t('serverHealth.colErrors') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in live.requests.topRoutes" :key="r.route" class="border-b border-line last:border-0">
              <td class="px-3 py-2 font-mono text-xs whitespace-nowrap text-ink-secondary">{{ r.route }}</td>
              <td class="px-3 py-2 whitespace-nowrap font-mono text-ink-secondary">{{ r.count }}</td>
              <td class="px-3 py-2 whitespace-nowrap font-mono text-ink-secondary">{{ r.avgMs }}</td>
              <td class="px-3 py-2 whitespace-nowrap font-mono" :class="r.errors ? 'text-bad font-medium' : 'text-ink-secondary'">
                {{ r.errors }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ================= BAZA ================= -->
      <h2 class="text-sm font-semibold uppercase tracking-wide text-ink-muted pt-2" style="font-family: var(--font-display)">{{ t('serverHealth.databaseSection') }}</h2>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          :title="t('serverHealth.dbConnections')"
          :value="`${live.db.threadsConnected} / ${live.db.maxConnections}`"
        />
        <KpiCard
          :title="t('serverHealth.queriesPerMin')"
          :value="live.db.queriesPerMin"
        />
        <KpiCard
          :title="t('serverHealth.avgQueryDuration')"
          :value="live.db.avgQueryMs + ' ms'"
        />
        <KpiCard
          :title="t('serverHealth.slowQueries')"
          :value="live.db.slowQueryCount"
          :warn="live.db.slowQueryCount > 0"
        />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm overflow-x-auto">
          <h3 class="font-semibold text-ink mb-3">{{ t('serverHealth.biggestTables') }}</h3>
          <table class="min-w-full text-left text-sm">
            <thead class="table-head-row">
              <tr>
                <th class="px-3 py-2 font-medium whitespace-nowrap">{{ t('serverHealth.colTable') }}</th>
                <th class="px-3 py-2 font-medium whitespace-nowrap">{{ t('downloads.colSize') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tbl in live.db.size.topTables" :key="tbl.table" class="border-b border-line last:border-0">
                <td class="px-3 py-2 font-mono text-xs whitespace-nowrap text-ink-secondary">{{ tbl.table }}</td>
                <td class="px-3 py-2 whitespace-nowrap font-mono text-ink-secondary">{{ tbl.sizeMb }} MB</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm overflow-x-auto">
          <h3 class="font-semibold text-ink mb-3">{{ t('serverHealth.slowestQueries') }}</h3>
          <div v-if="!live.db.slowestQueries.length" class="text-sm text-ink-muted">
            {{ t('serverHealth.noQueriesLastMinute') }}
          </div>
          <table v-else class="min-w-full text-left text-sm">
            <thead class="table-head-row">
              <tr>
                <th class="px-3 py-2 font-medium whitespace-nowrap">{{ t('serverHealth.colQuery') }}</th>
                <th class="px-3 py-2 font-medium whitespace-nowrap">ms</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(q, idx) in live.db.slowestQueries" :key="idx" class="border-b border-line last:border-0">
                <td class="px-3 py-2 font-mono text-xs text-ink-secondary">{{ q.sql }}</td>
                <td class="px-3 py-2 whitespace-nowrap font-mono" :class="q.durationMs >= 200 ? 'text-bad font-medium' : 'text-ink-secondary'">
                  {{ q.durationMs }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div>
            <h3 class="font-semibold text-ink">{{ t('serverHealth.ghostRefsTitle') }}</h3>
            <p class="text-xs text-ink-muted mt-1">
              {{ t('serverHealth.ghostRefsDescription') }}
            </p>
          </div>
          <div class="flex gap-2 shrink-0">
            <AppButton variant="secondary" :disabled="ghostAuditLoading" @click="runGhostAudit">
              {{ ghostAuditLoading ? t('serverHealth.checking') : t('serverHealth.checkAgain') }}
            </AppButton>
            <AppButton
              v-if="isAdmin && ghostAudit && ghostAudit.totalOrphans > 0"
              variant="danger"
              :disabled="ghostCleaning"
              @click="cleanGhostReferences"
            >
              {{ ghostCleaning ? t('serverHealth.cleaning') : t('serverHealth.cleanCount', { count: ghostAudit.totalOrphans }) }}
            </AppButton>
          </div>
        </div>

        <div v-if="ghostAudit">
          <div
            v-if="ghostAudit.totalOrphans === 0"
            class="text-sm text-good bg-good-subtle border border-good/40 rounded-lg px-3 py-2"
          >
            ✓ {{ t('serverHealth.dbClean') }}
          </div>
          <table v-else class="min-w-full text-left text-sm">
            <thead class="table-head-row">
              <tr>
                <th class="px-3 py-2 font-medium whitespace-nowrap">{{ t('serverHealth.colTableColumn') }}</th>
                <th class="px-3 py-2 font-medium whitespace-nowrap">{{ t('serverHealth.colReferences') }}</th>
                <th class="px-3 py-2 font-medium whitespace-nowrap">{{ t('serverHealth.colCount') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in ghostAudit.results.filter((r) => r.orphanCount > 0)"
                :key="r.table + r.column"
                class="border-b border-line last:border-0"
              >
                <td class="px-3 py-2 font-mono text-xs whitespace-nowrap text-ink-secondary">{{ r.table }}.{{ r.column }}</td>
                <td class="px-3 py-2 font-mono text-xs whitespace-nowrap text-ink-secondary">{{ r.references }}</td>
                <td class="px-3 py-2 whitespace-nowrap font-mono text-bad font-medium">{{ r.orphanCount }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <div v-else-if="!liveError" class="text-ink-secondary text-sm">{{ t('common.loading') }}</div>

    <div class="flex items-center justify-between">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-ink-muted pt-2" style="font-family: var(--font-display)">{{ t('serverHealth.historyTitle') }}</h2>
      <div class="flex gap-2">
        <AppButton
          v-for="opt in [{ h: 6, label: '6h' }, { h: 24, label: '24h' }, { h: 168, label: '7d' }]"
          :key="opt.h"
          :variant="historyHours === opt.h ? 'primary' : 'secondary'"
          @click="selectHours(opt.h)"
        >
          {{ opt.label }}
        </AppButton>
      </div>
    </div>

    <div v-if="historyLoading" class="text-ink-secondary text-sm">{{ t('serverHealth.loadingHistory') }}</div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <h3 class="font-semibold text-ink mb-3">{{ t('serverHealth.cpuPercent') }}</h3>
        <TrendLine :points="cpuPoints" unit="%" />
      </div>
      <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <h3 class="font-semibold text-ink mb-3">{{ t('serverHealth.ramPercent') }}</h3>
        <TrendLine :points="ramPoints" unit="%" />
      </div>
      <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <h3 class="font-semibold text-ink mb-3">{{ t('serverHealth.requestsPerMin') }}</h3>
        <TrendLine :points="reqPoints" />
      </div>
      <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <h3 class="font-semibold text-ink mb-3">{{ t('serverHealth.avgResponseMsChart') }}</h3>
        <TrendLine :points="respPoints" unit="ms" />
      </div>
      <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <h3 class="font-semibold text-ink mb-3">{{ t('serverHealth.p95Ms') }}</h3>
        <TrendLine :points="p95Points" unit="ms" />
      </div>
      <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <h3 class="font-semibold text-ink mb-3">{{ t('serverHealth.p99Ms') }}</h3>
        <TrendLine :points="p99Points" unit="ms" />
      </div>
      <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <h3 class="font-semibold text-ink mb-3">{{ t('serverHealth.dbSizeMb') }}</h3>
        <TrendLine :points="dbSizePoints" unit="MB" />
      </div>
      <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <h3 class="font-semibold text-ink mb-3">{{ t('serverHealth.avgQueryMsChart') }}</h3>
        <TrendLine :points="queryMsPoints" unit="ms" />
      </div>
      <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <h3 class="font-semibold text-ink mb-3">{{ t('serverHealth.mariadbCpuPercent') }}</h3>
        <TrendLine :points="mariadbCpuPoints" unit="%" />
      </div>
      <div class="rounded-xl border border-line bg-surface p-4 shadow-sm lg:col-span-2">
        <h3 class="font-semibold text-ink mb-3">
          {{ t('serverHealth.nodeHeapTitle') }}
          <span class="text-xs font-normal text-ink-muted">{{ t('serverHealth.nodeHeapSub') }}</span>
        </h3>
        <TrendLine :points="heapPoints" unit="MB" />
      </div>
    </div>

    <ToastNotification :message="toast" />

    <ConfirmDialog
      :open="confirmState.open"
      :title="confirmState.title"
      :message="confirmState.message"
      @confirm="resolveConfirm(true)"
      @cancel="resolveConfirm(false)"
    />
  </div>
</template>
