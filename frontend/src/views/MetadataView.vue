<template>
  <div class="w-full px-4 sm:px-6 py-6 space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <h1 class="text-3xl font-bold text-slate-800">🧾 Metapodaci — Analitika</h1>
      <div class="flex flex-wrap items-center gap-2">
        <button
          @click="refreshAll"
          class="bg-indigo-600 text-white px-4 py-2 rounded-lg shadow hover:bg-indigo-700"
        >
          🔄 Osveži
        </button>
        <button
          @click="exportCsv"
          class="bg-emerald-600 text-white px-4 py-2 rounded-lg shadow hover:bg-emerald-700"
        >
          📤 Izvezi CSV
        </button>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <KpiCard
        title="Ukupno mašina"
        :value="stats.totalWithMeta"
        :sub="fmtPct(stats.coveragePct) + ' pokrivenost'"
        icon="💻"
      />
      <KpiCard
        title="Bez metapodataka"
        :value="Math.max(totalIpEntries - stats.totalWithMeta, 0)"
        :sub="'od ' + totalIpEntries"
        icon="🚫"
      />
      <KpiCard
        title="Pros. RAM"
        :value="fmtGb(stats.avgRamGb)"
        :sub="'med.: ' + fmtGb(stats.medRamGb)"
        icon="🧠"
      />
      <KpiCard
        title="SSD/HDD"
        :value="stats.ssdCount + ' / ' + stats.hddCount"
        :sub="fmtTb(stats.totalStorageTb) + ' ukupno'"
        icon="💽"
      />
    </div>

    <!-- Coverage + Recency -->
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div class="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 class="font-semibold text-slate-800 mb-3">📈 Pokrivenost metapodacima</h2>
        <div class="space-y-2">
          <div class="text-sm text-slate-600">
            {{ stats.totalWithMeta }} / {{ totalIpEntries }} mašina sa metapodacima
          </div>
          <div class="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full bg-indigo-600" :style="{ width: stats.coveragePct + '%' }"></div>
          </div>
        </div>
      </div>

      <div class="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 class="font-semibold text-slate-800 mb-3">⏱️ Svežina prikupljanja</h2>
        <div class="text-sm text-slate-600 mb-2">Broj mašina po danu (poslednjih 14 dana)</div>
        <Sparkline :series="recencySeries" :max="maxOf(recencySeries)" />
      </div>

      <div class="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 class="font-semibold text-slate-800 mb-3">🪟 Distribucija OS verzija (Top 5)</h2>
        <div class="space-y-2">
          <div v-for="row in topOs" :key="row.key" class="text-sm">
            <div class="flex items-center justify-between">
              <div class="truncate pr-2">{{ row.key || 'Nepoznato' }}</div>
              <div class="tabular-nums text-slate-600">{{ row.count }}</div>
            </div>
            <div class="w-full h-2 bg-slate-100 rounded">
              <div
                class="h-2 bg-blue-500 rounded"
                :style="{
                  width: ((row.count / (stats.totalWithMeta || 1)) * 100).toFixed(1) + '%',
                }"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Hardware breakdowns -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 class="font-semibold text-slate-800 mb-3">🏭 Proizvođači sistema (Top 6)</h2>
        <div class="space-y-2">
          <BarRow
            v-for="row in topManufacturers"
            :key="row.key"
            :label="row.key || '—'"
            :value="row.count"
            :total="stats.totalWithMeta"
          />
        </div>
      </div>

      <div class="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 class="font-semibold text-slate-800 mb-3">🎮 GPU prisutnost</h2>
        <div class="grid grid-cols-2 gap-3">
          <InfoPill label="Sa dedikovanom GPU" :value="stats.withGpu" />
          <InfoPill label="Bez GPU / iGPU samo" :value="stats.withoutGpu" />
          <InfoPill label="Prosečan VRAM" :value="fmtGb(stats.avgVramGb)" />
          <InfoPill label="Top GPU (model)" :value="topGpuName || '—'" />
        </div>
      </div>

      <div class="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 class="font-semibold text-slate-800 mb-3">🧩 RAM raspodela</h2>
        <div class="grid grid-cols-2 gap-3">
          <InfoPill label="≤ 8 GB" :value="bucketRam.le8" />
          <InfoPill label="16 GB" :value="bucketRam.eq16" />
          <InfoPill label="> 16 GB" :value="bucketRam.gt16" />
          <InfoPill label="Max RAM" :value="fmtGb(stats.maxRamGb)" />
        </div>
      </div>

      <div class="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 class="font-semibold text-slate-800 mb-3">🌐 Brzine mreže (Top 5)</h2>
        <div class="space-y-2">
          <BarRow
            v-for="row in topNicSpeeds"
            :key="row.key"
            :label="fmtMbps(Number(row.key))"
            :value="row.count"
            :total="stats.totalWithMeta"
          />
        </div>
      </div>
    </div>

    <!-- Tables: outliers / watchlist -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div class="rounded-2xl border bg-white p-4 shadow-sm overflow-hidden">
        <h2 class="font-semibold text-slate-800 mb-3">🔍 Najmanje RAM-a (Top 10)</h2>
        <DataTable
          :rows="tables.lowRam"
          :cols="['ComputerName', 'TotalRAM_GB', 'OS/Caption', 'CollectedAt']"
        />
      </div>
      <div class="rounded-2xl border bg-white p-4 shadow-sm overflow-hidden">
        <h2 class="font-semibold text-slate-800 mb-3">📅 Najstarija instalacija OS-a (Top 10)</h2>
        <DataTable
          :rows="tables.oldOs"
          :cols="['ComputerName', 'OS/Caption', 'OS/InstallDate', 'CollectedAt']"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, h, defineComponent } from 'vue'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'

/* =========================
   Mini komponente (render)
   ========================= */
const KpiCard = defineComponent({
  name: 'KpiCard',
  props: { title: String, value: [String, Number], sub: String, icon: String },
  setup(props) {
    return () =>
      h('div', { class: 'rounded-2xl border bg-white p-4 shadow-sm' }, [
        h('div', { class: 'text-2xl' }, props.icon),
        h('div', { class: 'text-slate-600 text-sm mt-1' }, props.title),
        h('div', { class: 'text-3xl font-semibold tracking-tight' }, props.value ?? '—'),
        h('div', { class: 'text-slate-500 text-sm' }, props.sub),
      ])
  },
})

const InfoPill = defineComponent({
  name: 'InfoPill',
  props: { label: String, value: [String, Number] },
  setup(props) {
    return () =>
      h('div', { class: 'rounded-xl border bg-slate-50 px-3 py-2' }, [
        h('div', { class: 'text-xs text-slate-500' }, props.label),
        h('div', { class: 'text-lg font-semibold' }, props.value ?? '—'),
      ])
  },
})

const BarRow = defineComponent({
  name: 'BarRow',
  props: { label: String, value: Number, total: Number },
  setup(props) {
    const pct = computed(() => Math.min(100, Math.round((props.value / (props.total || 1)) * 100)))
    return () =>
      h('div', { class: 'text-sm' }, [
        h('div', { class: 'flex items-center justify-between' }, [
          h('span', { class: 'truncate pr-2' }, props.label),
          h('span', { class: 'tabular-nums text-slate-600' }, String(props.value ?? 0)),
        ]),
        h('div', { class: 'w-full h-2 bg-slate-100 rounded' }, [
          h('div', {
            class: 'h-2 bg-indigo-600 rounded',
            style: { width: `${pct.value}%` },
          }),
        ]),
      ])
  },
})

const Sparkline = defineComponent({
  name: 'Sparkline',
  props: { series: { type: Array, default: () => [] }, max: Number },
  setup(props) {
    return () => {
      const width = 280
      const height = 60
      const pad = 6
      const n = props.series.length
      const max = Math.max(1, props.max ?? Math.max(0, ...props.series, 1))
      const step = (width - pad * 2) / Math.max(1, n - 1)
      const points = props.series
        .map((v, i) => {
          const x = pad + i * step
          const y = height - pad - (v / max) * (height - pad * 2)
          return `${x},${y}`
        })
        .join(' ')
      return h('svg', { width, height, class: 'w-full' }, [
        h('polyline', {
          points,
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 2,
          class: 'text-indigo-600',
        }),
      ])
    }
  },
})

const DataTable = defineComponent({
  name: 'DataTable',
  props: { rows: { type: Array, default: () => [] }, cols: Array },
  setup(props) {
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
          h('thead', { class: 'bg-slate-100 text-slate-700' }, [
            h(
              'tr',
              {},
              props.cols.map((c) =>
                h('th', { class: 'px-3 py-2 font-medium whitespace-nowrap' }, c)
              )
            ),
          ]),
          h(
            'tbody',
            {},
            props.rows.map((r, i) =>
              h(
                'tr',
                { key: i, class: 'border-b hover:bg-slate-50' },
                props.cols.map((c) =>
                  h('td', { class: 'px-3 py-2 whitespace-nowrap' }, formatCell(get(r, c)))
                )
              )
            )
          ),
        ]),
      ])
  },
})

/* =============
   State
   ============= */
const meta = ref([]) // list of ComputerMetadata
const totalIpEntries = ref(0)
const loading = ref(false)

/* =============
   Fetch
   ============= */
async function fetchStatsPreferServer() {
  // 1) probaj agregatnu rutu
  try {
    const r = await fetchWithAuth('/api/protected/metadata/stats')
    if (r.ok) {
      const payload = await r.json()
      if (Array.isArray(payload.meta)) meta.value = payload.meta
      totalIpEntries.value =
        Number(payload.cover?.totalIpEntries) ??
        Number(payload.totalIpEntries) ??
        Number(totalIpEntries.value) ??
        0
      if (Array.isArray(payload.meta)) return
    }
  } catch {}

  // 2) fallback: povuci total sa ip-addresses rute
  try {
    const r1 = await fetchWithAuth('/api/protected/ip-addresses?limit=1&page=1')
    if (r1.ok) {
      const d = await r1.json()
      totalIpEntries.value = Number(d.total) || 0
    }
  } catch {}

  // 3) fetchuj sve metadata (paginirano)
  try {
    let page = 1
    let all = []
    while (true) {
      const r = await fetchWithAuth(`/api/protected/metadata?page=${page}&limit=200`)
      if (!r.ok) break
      const d = await r.json()
      if (Array.isArray(d.items)) {
        all.push(...d.items)
        if (d.items.length < 200) break
        page++
      } else if (Array.isArray(d)) {
        all = d
        break
      } else break
    }
    if (all.length === 0) {
      // 4) poslednji fallback: ip-entries sa populate("metadata")
      const r2 = await fetchWithAuth('/api/protected/ip-addresses?limit=10000&page=1')
      if (r2.ok) {
        const d2 = await r2.json()
        const list = (d2.entries || []).map((e) => e.metadata).filter(Boolean)
        meta.value = list
        totalIpEntries.value = Number(d2.total) || list.length
        return
      }
    }
    meta.value = all
  } catch (e) {
    console.error(e)
  }
}

async function refreshAll() {
  loading.value = true
  meta.value = []
  await fetchStatsPreferServer()
  loading.value = false
}

onMounted(async () => {
  document.title = 'Metapodaci — Analitika'
  await refreshAll()
})

/* =============
   Derived
   ============= */
const stats = computed(() => {
  const m = meta.value
  const n = m.length
  const ramTotals = m.map(
    (x) =>
      Number(x?.System?.TotalRAM_GB) ||
      sum((x?.RAMModules || []).map((r) => Number(r?.CapacityGB) || 0))
  )
  const avgRam = avg(ramTotals)
  const medRam = median(ramTotals)
  const maxRam = Math.max(0, ...ramTotals)

  // storage
  const stor = m.flatMap((x) => x?.Storage || [])
  const ssd = stor.filter((s) => (s?.MediaType || '').toUpperCase().includes('SSD'))
  const hdd = stor.filter((s) => (s?.MediaType || '').toUpperCase().includes('HDD'))
  const totalGb = sum(stor.map((s) => Number(s?.SizeGB) || 0))

  // gpu
  const withGpu = m.filter((x) => (x?.GPUs || []).length > 0).length
  const vramAll = m
    .map((x) => avg((x?.GPUs || []).map((g) => Number(g?.VRAM_GB) || 0)))
    .filter(Boolean)
  const avgVram = avg(vramAll)

  // coverage
  const coverage = totalIpEntries.value ? Math.round((n / totalIpEntries.value) * 100) : 100

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
  }
})

// OS distribucija (Top 5)
const osDist = computed(() =>
  groupCount(meta.value.map((x) => joinNonEmpty([x?.OS?.Caption, x?.OS?.Version], ' ')))
)
const topOs = computed(() => osDist.value.slice(0, 5))

// Proizvođači sistema (Top 6)
const manufacturers = computed(() =>
  groupCount(meta.value.map((x) => x?.System?.Manufacturer || x?.Motherboard?.Manufacturer))
)
const topManufacturers = computed(() => manufacturers.value.slice(0, 6))

// NIC brzine (Top 5)
const topNicSpeeds = computed(() => {
  const speeds = meta.value
    .flatMap((x) => (x?.NICs || []).map((n) => Number(n?.SpeedMbps) || 0))
    .filter(Boolean)
  const rounded = speeds.map((s) => (s >= 950 && s <= 1100 ? 1000 : s))
  return groupCount(rounded.map(String)).slice(0, 5)
})

// GPU top model
const topGpuName = computed(() => {
  const names = meta.value.flatMap((x) => (x?.GPUs || []).map((g) => g?.Name).filter(Boolean))
  const grouped = groupCount(names)
  return grouped[0]?.key
})

// RAM bucket-i
const bucketRam = computed(() => {
  const totals = meta.value.map(
    (x) =>
      Number(x?.System?.TotalRAM_GB) ||
      sum((x?.RAMModules || []).map((r) => Number(r?.CapacityGB) || 0))
  )
  return {
    le8: totals.filter((v) => v > 0 && v <= 8).length,
    eq16: totals.filter((v) => v === 16).length,
    gt16: totals.filter((v) => v > 16).length,
  }
})

// Recency series (14 dana)
const recencySeries = computed(() => {
  const days = 14
  const counts = Array(days).fill(0)
  const now = new Date()
  for (const x of meta.value) {
    const d = new Date(x?.CollectedAt)
    if (isNaN(d)) continue
    const diff = Math.floor((now - d) / (24 * 3600 * 1000))
    if (diff >= 0 && diff < days) counts[days - 1 - diff]++
  }
  return counts
})

const tables = computed(() => {
  // Low RAM top 10
  const withTotals = meta.value.map((x) => ({
    ComputerName: x?.ComputerName || '—',
    TotalRAM_GB:
      Number(x?.System?.TotalRAM_GB) ||
      sum((x?.RAMModules || []).map((r) => Number(r?.CapacityGB) || 0)) ||
      0,
    OS: { Caption: x?.OS?.Caption },
    CollectedAt: x?.CollectedAt,
  }))
  const lowRam = [...withTotals].sort((a, b) => a.TotalRAM_GB - b.TotalRAM_GB).slice(0, 10)

  // Oldest OS install top 10
  const oldOs = meta.value
    .map((x) => ({
      ComputerName: x?.ComputerName || '—',
      OS: { Caption: x?.OS?.Caption, InstallDate: x?.OS?.InstallDate },
      CollectedAt: x?.CollectedAt,
    }))
    .filter((r) => r?.OS?.InstallDate)
    .sort((a, b) => new Date(a.OS.InstallDate) - new Date(b.OS.InstallDate))
    .slice(0, 10)

  return { lowRam, oldOs }
})

/* =============
   Helpers
   ============= */
function sum(arr) {
  return arr.reduce((a, b) => a + (Number(b) || 0), 0)
}
function avg(arr) {
  return arr.length ? sum(arr) / arr.length : 0
}
function median(arr) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
function round1(n) {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0
}
function fmtGb(n) {
  return n || n === 0 ? `${n} GB` : '—'
}
function fmtTb(n) {
  return n || n === 0 ? `${n} TB` : '—'
}
function fmtPct(n) {
  return n || n === 0 ? `${n}%` : '—'
}
function fmtMbps(n) {
  return n || n === 0 ? `${n} Mbps` : '—'
}
function joinNonEmpty(arr, sep) {
  return arr.filter(Boolean).join(sep)
}
function maxOf(arr) {
  return arr.length ? Math.max(...arr) : 0
}
function groupCount(items) {
  const map = new Map()
  for (const it of items) {
    const k = it == null || it === '' ? '—' : String(it)
    map.set(k, (map.get(k) || 0) + 1)
  }
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
}

/* =============
   Export CSV
   ============= */
function exportCsv() {
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
    System_TotalRAM_GB:
      Number(x?.System?.TotalRAM_GB) ||
      sum((x?.RAMModules || []).map((r) => Number(r?.CapacityGB) || 0)) ||
      '',
    GPUs_Count: (x?.GPUs || []).length,
    Storage_Total_GB: sum((x?.Storage || []).map((s) => Number(s?.SizeGB) || 0)),
  }))
  const header = Object.keys(rows[0] || { dummy: '' })
  const csv = [
    header.join(','),
    ...rows.map((r) => header.map((k) => escapeCsv(r[k])).join(',')),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'metadata_stats.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
function escapeCsv(v) {
  const s = v == null ? '' : String(v)
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

/* =============
   Expose for template
   ============= */
</script>
