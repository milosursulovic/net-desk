<script setup>
import { ref, computed, h, defineComponent, onMounted, onBeforeUnmount } from 'vue'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import AppButton from '@/components/AppButton.vue'

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

function selectHours(h) {
  historyHours.value = h
  loadHistory()
}

let liveTimer = null
onMounted(() => {
  loadLive()
  loadHistory()
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
          title="DB konekcije"
          :value="`${live.db.threadsConnected} / ${live.db.maxConnections}`"
        />
        <KpiCard
          title="Requestova/min"
          :value="live.requests.requestsPerMin"
        />
        <KpiCard
          title="Prosečno vreme odgovora"
          :value="live.requests.avgResponseMs + ' ms'"
        />
        <KpiCard
          title="Stopa grešaka (5xx)"
          :value="live.requests.errorRatePct + '%'"
          :warn="live.requests.errorRatePct > 5"
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
    </div>
  </div>
</template>
