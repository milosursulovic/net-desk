<script setup>
import { ref, computed, h, defineComponent, onMounted, onBeforeUnmount } from 'vue'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { useToast } from '@/composables/useToast.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const { toast, showToast } = useToast()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()

const LIVE_POLL_MS = 4000

const KpiCard = defineComponent({
  name: 'KpiCard',
  props: { title: String, value: [String, Number], sub: String, warn: Boolean },
  setup(props) {
    return () =>
      h('div', { class: 'rounded-xl border bg-white p-4 shadow-sm' }, [
        h('div', { class: 'text-slate-500 text-sm' }, props.title),
        h(
          'div',
          { class: ['text-2xl font-semibold tracking-tight', props.warn ? 'text-red-600' : 'text-slate-800'] },
          props.value ?? '—',
        ),
        props.sub ? h('div', { class: 'text-slate-400 text-xs mt-1' }, props.sub) : null,
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
        return h('div', { class: 'text-sm text-slate-400 py-8 text-center' }, 'Nema dovoljno podataka još.')
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
          h('polygon', { points: areaPoints, class: 'fill-blue-100' }),
          h('polyline', { points: linePoints, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, class: 'text-blue-600' }),
          activePt ? h('circle', { cx: activePt[0], cy: activePt[1], r: 4, class: 'fill-blue-600' }) : null,
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
                  'absolute top-0 -translate-y-full rounded-lg border bg-white px-2 py-1 text-xs shadow-sm pointer-events-none whitespace-nowrap',
                style: { left: `${(activePt[0] / width) * 100}%`, transform: 'translate(-50%, -100%)' },
              },
              [
                h('div', { class: 'font-medium' }, `${props.points[hoverIdx.value].y ?? '—'}${props.unit}`),
                h('div', { class: 'text-slate-500' }, fmtHistTime(props.points[hoverIdx.value].x)),
              ],
            )
          : null,
      ])
    }
  },
})

function fmtHistTime(v) {
  const d = new Date(v)
  return isNaN(d) ? '—' : d.toLocaleString('sr-RS', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
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
    liveError.value = 'Neuspešno učitavanje live stanja.'
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
    showToast('Greška pri proveri baze.', { prefix: '❌ ', duration: 3000 })
  } finally {
    ghostAuditLoading.value = false
  }
}

async function cleanGhostReferences() {
  const ok = await askConfirm(
    `Nađeno je ${ghostAudit.value?.totalOrphans ?? 0} ghost referenci/desinhronizacija. Da li želiš da ih očistiš? Ova akcija se ne može poništiti.`,
    { title: 'Čišćenje baze' },
  )
  if (!ok) return

  ghostCleaning.value = true
  try {
    const res = await fetchWithAuth('/api/protected/server-health/ghost-cleanup', { method: 'POST' })
    if (!res.ok) throw new Error(await parseError(res, `HTTP ${res.status}`))
    const data = await res.json()
    const total = data.cleaned.reduce((sum, c) => sum + (c.deleted || c.fixed || 0), 0)
    showToast(total ? `Očišćeno/ispravljeno ${total} redova.` : 'Nije bilo šta da se očisti.')
    await runGhostAudit()
  } catch (err) {
    console.error('Greška pri čišćenju baze:', err)
    showToast('Greška pri čišćenju baze.', { prefix: '❌ ', duration: 3000 })
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
  <div class="glass-container space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">Server</h1>
        <p class="text-sm text-slate-500 mt-1">
          Live opterećenje backend servera (CPU/RAM/disk, baza, requestovi) — osvežava se automatski.
        </p>
      </div>
    </div>

    <div v-if="liveError" class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">
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
          title="Disk (glavni volumen)"
          :value="live.system.diskUsedPct != null ? live.system.diskUsedPct + '%' : '—'"
          :warn="live.system.diskUsedPct > 90"
        />
        <KpiCard
          title="Node proces"
          :value="live.process.rssMb + ' MB'"
          :sub="`heap: ${live.process.heapUsedMb} MB · uptime: ${Math.floor(live.process.uptimeSeconds / 3600)}h`"
        />
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Requestova/min"
          :value="live.requests.requestsPerMin"
        />
        <KpiCard
          title="Prosečno vreme odgovora"
          :value="live.requests.avgResponseMs + ' ms'"
          sub="idealno <50-100ms u internoj mreži"
          :warn="live.requests.avgResponseMs > 100"
        />
        <KpiCard
          title="P95 vreme odgovora"
          :value="live.requests.p95ResponseMs + ' ms'"
          sub="95% zahteva brže od ovoga"
          :warn="live.requests.p95ResponseMs > 300"
        />
        <KpiCard
          title="P99 vreme odgovora"
          :value="live.requests.p99ResponseMs + ' ms'"
          sub="najgori 1% zahteva"
          :warn="live.requests.p99ResponseMs > 1000"
        />
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Stopa grešaka (5xx)"
          :value="live.requests.errorRatePct + '%'"
          :warn="live.requests.errorRatePct > 5"
        />
        <KpiCard
          title="Veličina baze"
          :value="live.db.size.totalSizeMb + ' MB'"
        />
        <KpiCard
          title="MariaDB proces — CPU"
          :value="live.db.process.found ? live.db.process.cpuPct + '%' : 'nije pronađen'"
          :warn="live.db.process.found && live.db.process.cpuPct > 80"
        />
        <KpiCard
          title="MariaDB proces — RAM"
          :value="live.db.process.found ? live.db.process.memMb + ' MB' : 'nije pronađen'"
        />
      </div>

      <div class="rounded-xl border bg-white p-4 shadow-sm overflow-x-auto">
        <h2 class="font-semibold text-slate-800 mb-3">
          Najaktivnije rute (poslednji minut)
        </h2>
        <div v-if="!live.requests.topRoutes.length" class="text-sm text-slate-500">
          Nema zabeleženih requestova u poslednjem minutu.
        </div>
        <table v-else class="min-w-full text-left text-sm">
          <thead class="bg-slate-100 text-slate-700">
            <tr>
              <th class="px-3 py-2 font-medium whitespace-nowrap">Ruta</th>
              <th class="px-3 py-2 font-medium whitespace-nowrap">Broj</th>
              <th class="px-3 py-2 font-medium whitespace-nowrap">Pros. ms</th>
              <th class="px-3 py-2 font-medium whitespace-nowrap">Greške</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in live.requests.topRoutes" :key="r.route" class="border-b">
              <td class="px-3 py-2 font-mono text-xs whitespace-nowrap">{{ r.route }}</td>
              <td class="px-3 py-2 whitespace-nowrap">{{ r.count }}</td>
              <td class="px-3 py-2 whitespace-nowrap">{{ r.avgMs }}</td>
              <td class="px-3 py-2 whitespace-nowrap" :class="r.errors ? 'text-red-600 font-medium' : ''">
                {{ r.errors }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ================= BAZA ================= -->
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-400 pt-2">Baza</h2>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="DB konekcije"
          :value="`${live.db.threadsConnected} / ${live.db.maxConnections}`"
        />
        <KpiCard
          title="Upita/min"
          :value="live.db.queriesPerMin"
        />
        <KpiCard
          title="Prosečno trajanje upita"
          :value="live.db.avgQueryMs + ' ms'"
        />
        <KpiCard
          title="Spori upiti (≥200ms, poslednji minut)"
          :value="live.db.slowQueryCount"
          :warn="live.db.slowQueryCount > 0"
        />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="rounded-xl border bg-white p-4 shadow-sm overflow-x-auto">
          <h3 class="font-semibold text-slate-800 mb-3">Najveće tabele</h3>
          <table class="min-w-full text-left text-sm">
            <thead class="bg-slate-100 text-slate-700">
              <tr>
                <th class="px-3 py-2 font-medium whitespace-nowrap">Tabela</th>
                <th class="px-3 py-2 font-medium whitespace-nowrap">Veličina</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in live.db.size.topTables" :key="t.table" class="border-b">
                <td class="px-3 py-2 font-mono text-xs whitespace-nowrap">{{ t.table }}</td>
                <td class="px-3 py-2 whitespace-nowrap">{{ t.sizeMb }} MB</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="rounded-xl border bg-white p-4 shadow-sm overflow-x-auto">
          <h3 class="font-semibold text-slate-800 mb-3">Najsporiji upiti (poslednji minut)</h3>
          <div v-if="!live.db.slowestQueries.length" class="text-sm text-slate-500">
            Nema zabeleženih upita u poslednjem minutu.
          </div>
          <table v-else class="min-w-full text-left text-sm">
            <thead class="bg-slate-100 text-slate-700">
              <tr>
                <th class="px-3 py-2 font-medium whitespace-nowrap">Upit</th>
                <th class="px-3 py-2 font-medium whitespace-nowrap">ms</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(q, idx) in live.db.slowestQueries" :key="idx" class="border-b">
                <td class="px-3 py-2 font-mono text-xs">{{ q.sql }}</td>
                <td class="px-3 py-2 whitespace-nowrap" :class="q.durationMs >= 200 ? 'text-red-600 font-medium' : ''">
                  {{ q.durationMs }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="rounded-xl border bg-white p-4 shadow-sm">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div>
            <h3 class="font-semibold text-slate-800">Ghost reference / desinhronizacije</h3>
            <p class="text-xs text-slate-500 mt-1">
              Redovi koji pokazuju na obrisane zapise (npr. metapodaci vezani za obrisan IP unos), ili
              zapisi kojima je izgubljen pokazivač iako podatak postoji.
            </p>
          </div>
          <div class="flex gap-2 shrink-0">
            <AppButton variant="secondary" :disabled="ghostAuditLoading" @click="runGhostAudit">
              {{ ghostAuditLoading ? 'Proveravam…' : 'Proveri ponovo' }}
            </AppButton>
            <AppButton
              v-if="ghostAudit && ghostAudit.totalOrphans > 0"
              variant="danger"
              :disabled="ghostCleaning"
              @click="cleanGhostReferences"
            >
              {{ ghostCleaning ? 'Čistim…' : `Očisti (${ghostAudit.totalOrphans})` }}
            </AppButton>
          </div>
        </div>

        <div v-if="ghostAudit">
          <div
            v-if="ghostAudit.totalOrphans === 0"
            class="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2"
          >
            ✓ Baza je čista — nema ghost referenci ni desinhronizacija.
          </div>
          <table v-else class="min-w-full text-left text-sm">
            <thead class="bg-slate-100 text-slate-700">
              <tr>
                <th class="px-3 py-2 font-medium whitespace-nowrap">Tabela.kolona</th>
                <th class="px-3 py-2 font-medium whitespace-nowrap">Referencira</th>
                <th class="px-3 py-2 font-medium whitespace-nowrap">Broj</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in ghostAudit.results.filter((r) => r.orphanCount > 0)"
                :key="r.table + r.column"
                class="border-b"
              >
                <td class="px-3 py-2 font-mono text-xs whitespace-nowrap">{{ r.table }}.{{ r.column }}</td>
                <td class="px-3 py-2 font-mono text-xs whitespace-nowrap">{{ r.references }}</td>
                <td class="px-3 py-2 whitespace-nowrap text-red-600 font-medium">{{ r.orphanCount }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <div v-else-if="!liveError" class="text-slate-500 text-sm">Učitavanje…</div>

    <div class="flex items-center justify-between">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-400 pt-2">Istorija</h2>
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

    <div v-if="historyLoading" class="text-slate-500 text-sm">Učitavanje istorije…</div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="rounded-xl border bg-white p-4 shadow-sm">
        <h3 class="font-semibold text-slate-800 mb-3">CPU %</h3>
        <TrendLine :points="cpuPoints" unit="%" />
      </div>
      <div class="rounded-xl border bg-white p-4 shadow-sm">
        <h3 class="font-semibold text-slate-800 mb-3">RAM %</h3>
        <TrendLine :points="ramPoints" unit="%" />
      </div>
      <div class="rounded-xl border bg-white p-4 shadow-sm">
        <h3 class="font-semibold text-slate-800 mb-3">Requestova/min</h3>
        <TrendLine :points="reqPoints" />
      </div>
      <div class="rounded-xl border bg-white p-4 shadow-sm">
        <h3 class="font-semibold text-slate-800 mb-3">Prosečno vreme odgovora (ms)</h3>
        <TrendLine :points="respPoints" unit="ms" />
      </div>
      <div class="rounded-xl border bg-white p-4 shadow-sm">
        <h3 class="font-semibold text-slate-800 mb-3">P95 vreme odgovora (ms)</h3>
        <TrendLine :points="p95Points" unit="ms" />
      </div>
      <div class="rounded-xl border bg-white p-4 shadow-sm">
        <h3 class="font-semibold text-slate-800 mb-3">P99 vreme odgovora (ms)</h3>
        <TrendLine :points="p99Points" unit="ms" />
      </div>
      <div class="rounded-xl border bg-white p-4 shadow-sm">
        <h3 class="font-semibold text-slate-800 mb-3">Veličina baze (MB)</h3>
        <TrendLine :points="dbSizePoints" unit="MB" />
      </div>
      <div class="rounded-xl border bg-white p-4 shadow-sm">
        <h3 class="font-semibold text-slate-800 mb-3">Prosečno trajanje upita (ms)</h3>
        <TrendLine :points="queryMsPoints" unit="ms" />
      </div>
      <div class="rounded-xl border bg-white p-4 shadow-sm">
        <h3 class="font-semibold text-slate-800 mb-3">MariaDB proces — CPU (%)</h3>
        <TrendLine :points="mariadbCpuPoints" unit="%" />
      </div>
      <div class="rounded-xl border bg-white p-4 shadow-sm lg:col-span-2">
        <h3 class="font-semibold text-slate-800 mb-3">
          Node proces — heap (MB)
          <span class="text-xs font-normal text-slate-400">— stabilnost kroz vreme (očekivano ~50-70 MB)</span>
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
