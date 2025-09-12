<template>
  <div class="w-full px-4 sm:px-6 py-6 space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <h1 class="text-3xl font-bold text-slate-800">🧾 Metapodaci — Analitika</h1>
      <div class="flex flex-wrap items-center gap-2">
        <button @click="refreshAll" class="bg-indigo-600 text-white px-4 py-2 rounded-lg shadow hover:bg-indigo-700">
          🔄 Osveži
        </button>
        <button @click="exportXlsx" class="bg-emerald-600 text-white px-4 py-2 rounded-lg shadow hover:bg-emerald-700">
          📤 Izvezi XLSX
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <KpiCard title="Ukupno mašina" :value="stats.totalWithMeta" :sub="fmtPct(stats.coveragePct) + ' pokrivenost'"
        icon="💻" />
      <KpiCard title="Bez metapodataka" :value="Math.max(totalIpEntries - stats.totalWithMeta, 0)"
        :sub="'od ' + totalIpEntries" icon="🚫" />
      <KpiCard title="Pros. RAM" :value="fmtGb(stats.avgRamGb)" :sub="'med.: ' + fmtGb(stats.medRamGb)" icon="🧠" />
      <KpiCard title="SSD/HDD" :value="stats.ssdCount + ' / ' + stats.hddCount"
        :sub="fmtTb(stats.totalStorageTb) + ' ukupno'" icon="💽" />
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <KpiCard title="Jedinstvenih korisnika" :value="stats.uniqueUsers" :sub="'od ' + stats.totalWithMeta + ' mašina'"
        icon="👤" />
      <KpiCard title="Pros. # diskova" :value="stats.avgDisks" :sub="'med.: ' + stats.medDisks" icon="🗄️" />
      <KpiCard title="Pros. # NIC-ova" :value="stats.avgNics" :sub="'med.: ' + stats.medNics" icon="🌐" />
      <KpiCard title="Medijana starosti OS" :value="stats.medOsAgeDays + ' dana'"
        :sub="'prosek: ' + stats.avgOsAgeDays + ' dana'" icon="⏳" />
    </div>

    <!-- NOVO: KPI za Lexar red-flag -->
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <KpiCard title="Lexar SSD (red-flag)" :value="serverFlags?.lexarCount ?? (displayTables.lexarFlag?.length || 0)"
        sub="problematični uređaji" icon="🚩" />
    </div>

    <div class="grid grid-cols-1 xl-grid-cols-3 xl:grid-cols-3 gap-4">
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
              <div class="h-2 bg-blue-500 rounded" :style="{
                width: ((row.count / (stats.totalWithMeta || 1)) * 100).toFixed(1) + '%',
              }" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 class="font-semibold text-slate-800 mb-3">🏭 Proizvođači sistema (Top 6)</h2>
        <div class="space-y-2">
          <BarRow v-for="row in topManufacturers" :key="row.key" :label="row.key || '—'" :value="row.count"
            :total="stats.totalWithMeta" />
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
          <BarRow v-for="row in topNicSpeeds" :key="row.key" :label="fmtMbps(Number(row.key))" :value="row.count"
            :total="stats.totalWithMeta" />
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 class="font-semibold text-slate-800 mb-3">🧮 CPU modeli (Top 5)</h2>
        <div class="space-y-2">
          <BarRow v-for="row in topCpuModels" :key="row.key" :label="row.key || '—'" :value="row.count"
            :total="stats.totalWithMeta" />
        </div>
        <div class="grid grid-cols-3 gap-3 mt-3">
          <InfoPill label="Pros. jezgra" :value="stats.avgCpuCores" />
          <InfoPill label="Pros. niti" :value="stats.avgCpuThreads" />
          <InfoPill label="Pros. takt" :value="stats.avgCpuClockGHz + ' GHz'" />
        </div>
      </div>

      <div class="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 class="font-semibold text-slate-800 mb-3">💾 Broj diskova po mašini</h2>
        <div class="space-y-2">
          <BarRow label="1 disk" :value="diskBuckets.eq1" :total="stats.totalWithMeta" />
          <BarRow label="2 diska" :value="diskBuckets.eq2" :total="stats.totalWithMeta" />
          <BarRow label="3+ diska" :value="diskBuckets.ge3" :total="stats.totalWithMeta" />
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div class="rounded-2xl border bg-white p-4 shadow-sm overflow-hidden">
        <h2 class="font-semibold text-slate-800 mb-3">🔍 Najmanje RAM-a (Top 10)</h2>
        <DataTable :rows="tables.lowRam" :cols="['ComputerName', 'TotalRAM_GB', 'OS/Caption', 'CollectedAt']" />
      </div>
      <div class="rounded-2xl border bg-white p-4 shadow-sm overflow-hidden">
        <h2 class="font-semibold text-slate-800 mb-3">📅 Najstarija instalacija OS-a (Top 10)</h2>
        <DataTable :rows="tables.oldOs" :cols="['ComputerName', 'OS/Caption', 'OS/InstallDate', 'CollectedAt']" />
      </div>
      <div class="rounded-2xl border bg-white p-4 shadow-sm overflow-hidden">
        <h2 class="font-semibold text-slate-800 mb-3">🧱 Najveći ukupni storage (Top 10)</h2>
        <DataTable :rows="tables.topStorage"
          :cols="['ComputerName', 'DisksCount', 'Storage_Total_GB', 'CollectedAt']" />
      </div>
    </div>

    <div class="grid grid-cols-1 gap-4">
      <div class="rounded-2xl border border-red-200 bg-white p-4 shadow-sm overflow-hidden">
        <h2 class="font-semibold text-red-700 mb-1">🚩 Lexar SSD detektovani (red-flag)</h2>
        <p class="text-sm text-slate-600 mb-3">
          Diskovi sa modelom koji sadrži "Lexar" (SSD) — skloni restartima i lošem radu.
        </p>
        <DataTable :rows="(displayTables.lexarFlag || []).map((r) => ({
          ComputerName: r.ComputerName,
          Storage: {
            Model: r.Storage?.Model ?? r['Storage.Model'],
            Serial: r.Storage?.Serial ?? r['Storage.Serial'],
            SizeGB: r.Storage?.SizeGB ?? r['Storage.SizeGB'],
          },
          CollectedAt: r.CollectedAt,
        }))
          " :cols="['ComputerName', 'Storage/Model', 'Storage/Serial', 'Storage/SizeGB', 'CollectedAt']" />

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, h, defineComponent } from 'vue'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import * as XLSX from 'xlsx'

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
          h('div', { class: 'h-2 bg-indigo-600 rounded', style: { width: `${pct.value}%` } }),
        ]),
      ])
  },
})

const Sparkline = defineComponent({
  name: 'Sparkline',
  props: { series: { type: Array, default: () => [] }, max: Number },
  setup(props) {
    return () => {
      const width = 280,
        height = 60,
        pad = 6
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
            (props.rows || []).map((r, i) =>
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

const meta = ref([])
const totalIpEntries = ref(0)
const loading = ref(false)

// NOVO: server tables & flags
const serverTables = ref(null)
const serverFlags = ref(null)

// helper koji vraća prioritetno server tabele, inače lokalno izračunate
const displayTables = computed(() => serverTables.value || tables.value)

async function fetchStatsPreferServer() {
  try {
    const r = await fetchWithAuth('/api/protected/metadata/stats')
    if (r.ok) {
      const payload = await r.json()

      // NOVO: pokupi tables i flags sa servera (ako postoje)
      if (payload?.tables) serverTables.value = payload.tables
      if (payload?.flags) serverFlags.value = payload.flags

      if (Array.isArray(payload.meta)) meta.value = payload.meta
      totalIpEntries.value =
        Number(payload.cover?.totalIpEntries) ??
        Number(payload.totalIpEntries) ??
        Number(totalIpEntries.value) ??
        0

      if (Array.isArray(payload.meta)) return
    }
  } catch { }
  try {
    const r1 = await fetchWithAuth('/api/protected/ip-addresses?limit=1&page=1')
    if (r1.ok) {
      const d = await r1.json()
      totalIpEntries.value = Number(d.total) || 0
    }
  } catch { }
  try {
    let page = 1,
      all = []
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
  serverTables.value = null
  serverFlags.value = null
  await fetchStatsPreferServer()
  loading.value = false
}

onMounted(async () => {
  document.title = 'Metapodaci — Analitika'
  await refreshAll()
})

function cpuNameOf(x) {
  return (
    x?.CPU?.Name ||
    x?.Processor?.Name ||
    x?.System?.CPUName ||
    x?.System?.Processor ||
    x?.CPUName ||
    ''
  )
}
function cpuCoresOf(x) {
  return (
    Number(x?.CPU?.Cores) ||
    Number(x?.Processor?.Cores) ||
    Number(x?.System?.CPUCores) ||
    Number(x?.CPU?.NumberOfCores) ||
    0
  )
}
function cpuThreadsOf(x) {
  return (
    Number(x?.CPU?.LogicalCPUs) ||
    Number(x?.CPU?.LogicalProcessors) ||
    Number(x?.Processor?.LogicalProcessors) ||
    Number(x?.System?.CPULogicalProcessors) ||
    Number(x?.CPU?.Threads) ||
    0
  )
}
function cpuClockGHzOf(x) {
  const ghz =
    Number(x?.CPU?.MaxClockGHz) ||
    Number(x?.Processor?.MaxClockGHz) ||
    Number(x?.System?.CPU_MaxClockGHz)
  if (Number.isFinite(ghz) && ghz > 0) return ghz
  const mhz =
    Number(x?.CPU?.MaxClockMHz) ||
    Number(x?.Processor?.MaxClockMHz) ||
    Number(x?.System?.CPU_MaxClockMHz)
  return Number.isFinite(mhz) && mhz > 0 ? Math.round((mhz / 1000) * 10) / 10 : 0
}

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

const recencySeries = computed(() => {
  const days = 14,
    counts = Array(days).fill(0),
    now = new Date()
  for (const x of meta.value) {
    const d = new Date(x?.CollectedAt)
    if (isNaN(d)) continue
    const diff = Math.floor((now - d) / (24 * 3600 * 1000))
    if (diff >= 0 && diff < days) counts[days - 1 - diff]++
  }
  return counts
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

  const ramTotals = m.map(
    (x) =>
      Number(x?.System?.TotalRAM_GB) ||
      sum((x?.RAMModules || []).map((r) => Number(r?.CapacityGB) || 0))
  )
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
  }
})

const tables = computed(() => {
  const m = meta.value

  const withTotals = m.map((x) => ({
    ComputerName: x?.ComputerName || '—',
    TotalRAM_GB:
      Number(x?.System?.TotalRAM_GB) ||
      sum((x?.RAMModules || []).map((r) => Number(r?.CapacityGB) || 0)) ||
      0,
    OS: { Caption: x?.OS?.Caption },
    CollectedAt: x?.CollectedAt,
  }))
  const lowRam = [...withTotals].sort((a, b) => a.TotalRAM_GB - b.TotalRAM_GB).slice(0, 10)

  const oldOs = m
    .map((x) => ({
      ComputerName: x?.ComputerName || '—',
      OS: { Caption: x?.OS?.Caption, InstallDate: x?.OS?.InstallDate },
      CollectedAt: x?.CollectedAt,
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
    }
  })
  const topStorage = storageRows
    .sort((a, b) => b.Storage_Total_GB - a.Storage_Total_GB)
    .slice(0, 10)

  return { lowRam: lowRam || [], oldOs: oldOs || [], topStorage: topStorage || [] }
})

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

function exportXlsx() {
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
