<template>
  <div class="glass-container space-y-4">
    <ToastNotification :message="toast" />
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <div class="flex items-center gap-2">
          <h1 class="text-2xl font-bold text-slate-800">Dnevni izveštaj</h1>
          <span
            v-if="report"
            class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs"
            :class="report.openedAt
              ? 'bg-slate-100 text-slate-500 border-slate-200'
              : 'bg-blue-50 text-blue-700 border-blue-200'"
          >
            {{ report.openedAt ? `Pročitano ${fmtDate(report.openedAt)}` : 'Nepročitano' }}
          </span>
        </div>
        <p v-if="report" class="text-sm text-slate-500 mt-1">
          Period: {{ fmtDate(report.periodStart) }} — {{ fmtDate(report.periodEnd) }}
        </p>
      </div>
      <div class="flex gap-2 no-print">
        <AppButton v-if="report" variant="neutral" :disabled="downloadingPdf" @click="downloadPdf">
          {{ downloadingPdf ? 'Pripremam…' : '📄 Preuzmi PDF' }}
        </AppButton>
        <AppButton variant="secondary" :disabled="generating" @click="generateNow">
          {{ generating ? 'Generišem…' : 'Generiši sada' }}
        </AppButton>
      </div>
    </div>

    <div v-if="loading" class="text-slate-600">Učitavanje…</div>
    <div v-else-if="error" class="text-red-600">{{ error }}</div>

    <template v-else-if="report">
      <!-- Fleet snapshot -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div class="rounded-xl border bg-white p-4 shadow-sm">
          <div class="text-slate-500 text-sm">Agenata ukupno</div>
          <div class="text-3xl font-semibold tracking-tight">{{ report.content.fleet.totalAgents }}</div>
          <div class="text-slate-500 text-sm mt-1">
            {{ report.content.fleet.onlineAgents }} online / {{ report.content.fleet.staleAgents }}
            neaktivno / {{ report.content.fleet.offlineAgents }} offline
          </div>
        </div>
        <div class="rounded-xl border bg-white p-4 shadow-sm">
          <div class="text-slate-500 text-sm">IP unosa ukupno</div>
          <div class="text-3xl font-semibold tracking-tight">{{ report.content.fleet.totalIpEntries }}</div>
          <div class="text-slate-500 text-sm mt-1">{{ report.content.fleet.offlineIpEntries }} offline</div>
        </div>
        <div class="rounded-xl border bg-white p-4 shadow-sm">
          <div class="text-slate-500 text-sm">Status promene (period)</div>
          <div class="text-3xl font-semibold tracking-tight">
            {{ report.content.sinceLastReport.statusTransitions.wentOffline
              + report.content.sinceLastReport.statusTransitions.cameOnline }}
          </div>
          <div class="text-slate-500 text-sm mt-1">
            {{ report.content.sinceLastReport.statusTransitions.wentOffline }} otišlo offline /
            {{ report.content.sinceLastReport.statusTransitions.cameOnline }} vratilo se online
          </div>
        </div>
        <div class="rounded-xl border bg-white p-4 shadow-sm">
          <div class="text-slate-500 text-sm">Aktivnih upozorenja</div>
          <div class="text-3xl font-semibold tracking-tight">{{ report.content.alerts.length }}</div>
          <div class="text-slate-500 text-sm mt-1">videti listu ispod</div>
        </div>
      </div>

      <!-- Trendovi - stariji izveštaji (pre nego što je ovo dodato) nemaju
           content.trends u sačuvanom JSON-u, otud opciono ulančavanje. -->
      <div
        v-for="group in trendGroups"
        :key="group.key"
        class="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm"
      >
        <h2 class="font-semibold text-amber-900 mb-1">📈 {{ group.label }}</h2>
        <p class="text-sm text-amber-800 mb-3">
          Na osnovu poslednjih {{ TREND_WINDOW_DAYS }} dana - ne znači da će se trend nastaviti
          istom brzinom, samo da vredi proveriti.
        </p>
        <ul class="space-y-1 text-sm">
          <li v-for="(t, idx) in group.items" :key="idx">
            <span class="font-medium">{{ t.hostname || '—' }}</span>
            — trenutno {{ t.currentPct.toFixed(1) }}%, raste ~{{ t.slopePctPerDay.toFixed(2) }}%/dan,
            stiže do {{ group.threshold }}% za <span class="font-semibold">~{{ t.daysUntilThreshold }} dana</span>
          </li>
        </ul>
      </div>

      <div
        v-if="anomalies.length"
        class="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm"
      >
        <h2 class="font-semibold text-red-900 mb-1">🚨 Anomalije</h2>
        <p class="text-sm text-red-800 mb-3">
          Vrednosti koje značajno odstupaju od uobičajenog obrasca agenta (poslednjih
          {{ TREND_WINDOW_DAYS }} dana), bez obzira na trend — može biti jednokratni skok,
          ne mora značiti trajni problem.
        </p>
        <ul class="space-y-1 text-sm">
          <li v-for="(a, idx) in anomalies" :key="idx">
            <span class="font-medium">{{ a.hostname || '—' }}</span>
            — {{ metricLabel[a.metric] || a.metric }}: {{ a.currentValue.toFixed(1) }}%
            (uobičajeno ~{{ a.baselineMean.toFixed(1) }}%, odstupanje {{ a.zScore.toFixed(1) }}σ)
          </li>
        </ul>
      </div>

      <!-- Alerts -->
      <div v-if="report.content.alerts.length" class="rounded-xl border bg-white p-4 shadow-sm">
        <h2 class="font-semibold text-slate-800 mb-3">Aktivna upozorenja</h2>
        <div class="space-y-2">
          <RouterLink
            v-for="a in report.content.alerts"
            :key="a.id"
            :to="a.to || '/'"
            class="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
            :class="levelClass[a.level] || levelClass.info"
          >
            <span>{{ levelIcon[a.level] || levelIcon.info }}</span>
            <span>{{ a.message }}</span>
          </RouterLink>
        </div>
      </div>

      <!-- Since last report -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="rounded-xl border bg-white p-4 shadow-sm">
          <h2 class="font-semibold text-slate-800 mb-3">
            Novi agenti ({{ report.content.sinceLastReport.newAgentsCount }})
          </h2>
          <div v-if="!report.content.sinceLastReport.newAgents.length" class="text-sm text-slate-500">
            Nema novih agenata u ovom periodu.
          </div>
          <ul v-else class="space-y-1 text-sm">
            <li v-for="a in report.content.sinceLastReport.newAgents" :key="a.agentUid">
              {{ a.hostname || '—' }} <span class="text-slate-400">({{ fmtDate(a.enrolledAt) }})</span>
            </li>
          </ul>
        </div>

        <div class="rounded-xl border bg-white p-4 shadow-sm">
          <h2 class="font-semibold text-slate-800 mb-3">
            Nove IP adrese ({{ report.content.sinceLastReport.newIpEntriesCount }})
          </h2>
          <div v-if="!report.content.sinceLastReport.newIpEntries.length" class="text-sm text-slate-500">
            Nema novih unosa u ovom periodu.
          </div>
          <ul v-else class="space-y-1 text-sm">
            <li v-for="e in report.content.sinceLastReport.newIpEntries" :key="e.id">
              {{ e.ip }} — {{ e.computerName || '—' }}
              <span class="text-slate-400">({{ fmtDate(e.createdAt) }})</span>
            </li>
          </ul>
        </div>

        <div class="rounded-xl border bg-white p-4 shadow-sm">
          <h2 class="font-semibold text-slate-800 mb-3">
            Novi štampači ({{ report.content.sinceLastReport.newPrintersCount }})
          </h2>
          <div v-if="!report.content.sinceLastReport.newPrinters.length" class="text-sm text-slate-500">
            Nema novih štampača u ovom periodu.
          </div>
          <ul v-else class="space-y-1 text-sm">
            <li v-for="p in report.content.sinceLastReport.newPrinters" :key="p.id">
              {{ p.name || '—' }} <span class="text-slate-400">({{ p.ip || '—' }})</span>
            </li>
          </ul>
        </div>

        <div class="rounded-xl border bg-white p-4 shadow-sm">
          <h2 class="font-semibold text-slate-800 mb-3">
            Neuspešne komande ({{ report.content.sinceLastReport.failedJobsCount }})
          </h2>
          <div v-if="!report.content.sinceLastReport.failedJobs.length" class="text-sm text-slate-500">
            Nema neuspešnih komandi u ovom periodu.
          </div>
          <ul v-else class="space-y-1 text-sm">
            <li v-for="(j, idx) in report.content.sinceLastReport.failedJobs" :key="idx">
              {{ j.hostname || '—' }} — {{ j.commandType }}
              <span class="text-slate-400">({{ fmtDate(j.completedAt) }})</span>
            </li>
          </ul>
        </div>

        <div class="rounded-xl border bg-white p-4 shadow-sm lg:col-span-2">
          <h2 class="font-semibold text-slate-800 mb-3">
            Neuspešna ažuriranja agenta ({{ report.content.sinceLastReport.failedUpdatesCount }})
          </h2>
          <div v-if="!report.content.sinceLastReport.failedUpdates.length" class="text-sm text-slate-500">
            Nema neuspešnih ažuriranja u ovom periodu.
          </div>
          <ul v-else class="space-y-1 text-sm">
            <li v-for="(u, idx) in report.content.sinceLastReport.failedUpdates" :key="idx">
              {{ u.hostname || '—' }} — {{ u.fromVersion || '—' }} → {{ u.toVersion || '—' }}
              <span v-if="u.reason" class="text-slate-400">({{ u.reason }})</span>
            </li>
          </ul>
        </div>
      </div>
    </template>

    <div v-else class="text-slate-600">Još nema generisanih izveštaja.</div>

    <!-- Istorija -->
    <div class="rounded-xl border bg-white p-4 shadow-sm no-print">
      <h2 class="font-semibold text-slate-800 mb-3">Istorija izveštaja</h2>
      <div v-if="!history.length" class="text-sm text-slate-500">Nema prethodnih izveštaja.</div>
      <div v-else class="space-y-1">
        <RouterLink
          v-for="h in history"
          :key="h.id"
          :to="`/reports/${h.id}`"
          class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
          :class="report && report.id === h.id ? 'bg-blue-50 text-blue-700' : 'text-slate-700'"
        >
          <span
            class="h-2 w-2 shrink-0 rounded-full"
            :class="h.openedAt ? 'bg-transparent' : 'bg-blue-600'"
            :title="h.openedAt ? 'Pročitano' : 'Nepročitano'"
          />
          {{ fmtDate(h.periodStart) }} — {{ fmtDate(h.periodEnd) }}
          <span class="text-slate-400">(generisano {{ fmtDate(h.generatedAt) }})</span>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { fmtDate as formatDate } from '@/utils/format.js'
import { downloadFromResponse } from '@/utils/download.js'
import { useToast } from '@/composables/useToast.js'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'

const route = useRoute()
const { toast, showToast } = useToast()

const TREND_WINDOW_DAYS = 90

const fmtDate = (d) => formatDate(d, 'sr-RS')

const levelClass = {
  critical: 'bg-red-50 text-red-700 border-red-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
}
const levelIcon = {
  critical: '⛔',
  warning: '⚠️',
  info: 'ℹ️',
}
const metricLabel = {
  disk: 'Disk',
  cpu: 'CPU',
  ram: 'RAM',
}

const report = ref(null)
const history = ref([])
const trendGroups = computed(() => [
  {
    key: 'disk',
    label: 'Trend punjenja diska',
    threshold: 90,
    items: report.value?.content?.trends?.diskFillProjections || [],
  },
  {
    key: 'cpu',
    label: 'Trend CPU opterećenja',
    threshold: 90,
    items: report.value?.content?.trends?.cpuLoadProjections || [],
  },
  {
    key: 'ram',
    label: 'Trend RAM opterećenja',
    threshold: 90,
    items: report.value?.content?.trends?.ramLoadProjections || [],
  },
].filter((g) => g.items.length))
const anomalies = computed(() => report.value?.content?.trends?.anomalies || [])
const loading = ref(false)
const error = ref('')
const generating = ref(false)
const downloadingPdf = ref(false)

async function loadReport() {
  loading.value = true
  error.value = ''
  try {
    const url = route.params.id
      ? `/api/protected/reports/${route.params.id}`
      : '/api/protected/reports/latest'
    const res = await fetchWithAuth(url)
    if (res.status === 404) {
      report.value = null
      return
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    report.value = await res.json()
    if (!report.value.openedAt) markAsRead(report.value.id)
  } catch (err) {
    console.error('Neuspešno učitavanje izveštaja:', err)
    error.value = 'Neuspešno učitavanje izveštaja.'
  } finally {
    loading.value = false
  }
}

// Odvojeno od loadReport (GET) - eksplicitna akcija koja se zove tek pošto je
// izveštaj stvarno prikazan korisniku, ne pri svakom fetch-u (npr. da neki
// budući indikator na navigaciji može da proveri status bez da ga time i
// označi kao pročitan).
async function markAsRead(id) {
  try {
    const res = await fetchWithAuth(`/api/protected/reports/${id}/mark-read`, { method: 'POST' })
    if (!res.ok) return
    const updated = await res.json()
    if (report.value?.id === id) report.value = updated
    const historyItem = history.value.find((h) => h.id === id)
    if (historyItem) historyItem.openedAt = updated.openedAt
  } catch (err) {
    console.error('Neuspešno obeležavanje izveštaja kao pročitanog:', err)
  }
}

async function downloadPdf() {
  if (!report.value) return
  downloadingPdf.value = true
  try {
    await downloadFromResponse(
      await fetchWithAuth(`/api/protected/reports/${report.value.id}/pdf`),
      `netdesk-izvestaj-${report.value.id}.pdf`,
    )
  } catch (err) {
    console.error('Neuspešno preuzimanje PDF-a:', err)
    showToast('Neuspešno preuzimanje PDF-a', { prefix: '❌ ', duration: 3000 })
  } finally {
    downloadingPdf.value = false
  }
}

async function loadHistory() {
  try {
    const res = await fetchWithAuth('/api/protected/reports?limit=30')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    history.value = data.items || []
  } catch (err) {
    console.error('Neuspešno učitavanje istorije izveštaja:', err)
  }
}

async function generateNow() {
  generating.value = true
  try {
    const res = await fetchWithAuth('/api/protected/reports/generate', { method: 'POST' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    await loadHistory()
    await loadReport()
  } catch (err) {
    console.error('Neuspešno generisanje izveštaja:', err)
  } finally {
    generating.value = false
  }
}

watch(() => route.params.id, loadReport)

onMounted(() => {
  loadReport()
  loadHistory()
})
</script>
