<template>
  <div class="space-y-4">
    <ToastNotification :message="toast" />
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <div class="flex items-center gap-2">
          <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">Dnevni izveštaj</h1>
          <StatusPill v-if="report" :status="report.openedAt ? 'neutral' : 'info'" :label="report.openedAt ? `Pročitano ${fmtDate(report.openedAt)}` : 'Nepročitano'" :dot="false" />
        </div>
        <p v-if="report" class="text-sm text-ink-muted mt-1">
          Period: {{ fmtDate(report.periodStart) }} — {{ fmtDate(report.periodEnd) }}
        </p>
      </div>
      <div class="flex gap-2 no-print">
        <AppButton v-if="report" variant="neutral" :disabled="downloadingPdf" @click="downloadPdf">
          <span v-if="downloadingPdf">Pripremam…</span>
          <span v-else class="inline-flex items-center gap-1"><NavIcon name="file" />Preuzmi PDF</span>
        </AppButton>
      </div>
    </div>

    <div v-if="loading" class="text-ink-secondary">Učitavanje…</div>
    <div v-else-if="error" class="text-bad">{{ error }}</div>

    <template v-else-if="report">
      <!-- Fleet snapshot -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <div class="text-ink-muted text-sm">Agenata ukupno</div>
          <div class="text-3xl font-semibold tracking-tight font-mono text-ink">{{ report.content.fleet.totalAgents }}</div>
          <div class="text-ink-muted text-sm mt-1">
            {{ report.content.fleet.onlineAgents }} online / {{ report.content.fleet.staleAgents }}
            neaktivno / {{ report.content.fleet.offlineAgents }} offline
          </div>
        </div>
        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <div class="text-ink-muted text-sm">IP unosa ukupno</div>
          <div class="text-3xl font-semibold tracking-tight font-mono text-ink">{{ report.content.fleet.totalIpEntries }}</div>
          <div class="text-ink-muted text-sm mt-1">{{ report.content.fleet.offlineIpEntries }} offline</div>
        </div>
        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <div class="text-ink-muted text-sm">Status promene (period)</div>
          <div class="text-3xl font-semibold tracking-tight font-mono text-ink">
            {{ report.content.sinceLastReport.statusTransitions.wentOffline
              + report.content.sinceLastReport.statusTransitions.cameOnline }}
          </div>
          <div class="text-ink-muted text-sm mt-1">
            {{ report.content.sinceLastReport.statusTransitions.wentOffline }} otišlo offline /
            {{ report.content.sinceLastReport.statusTransitions.cameOnline }} vratilo se online
          </div>
        </div>
        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <div class="text-ink-muted text-sm">Aktivnih upozorenja</div>
          <div class="text-3xl font-semibold tracking-tight font-mono text-ink">{{ report.content.alerts.length }}</div>
          <div class="text-ink-muted text-sm mt-1">videti listu ispod</div>
        </div>
      </div>

      <!-- Trendovi - stariji izveštaji (pre nego što je ovo dodato) nemaju
           content.trends u sačuvanom JSON-u, otud opciono ulančavanje. -->
      <div
        v-for="group in trendGroups"
        :key="group.key"
        class="rounded-xl border border-warn/40 bg-warn-subtle p-4 shadow-sm"
      >
        <h2 class="font-semibold text-warn mb-1 inline-flex items-center gap-1.5"><NavIcon name="trending-up" /> {{ group.label }}</h2>
        <p class="text-sm text-ink-secondary mb-3">
          Na osnovu poslednjih {{ TREND_WINDOW_DAYS }} dana - ne znači da će se trend nastaviti
          istom brzinom, samo da vredi proveriti.
        </p>
        <ul class="space-y-1 text-sm text-ink-secondary">
          <li v-for="(t, idx) in group.items" :key="idx">
            <span class="font-medium text-ink">{{ t.hostname || '—' }}</span>
            — trenutno {{ t.currentPct.toFixed(1) }}%, raste ~{{ t.slopePctPerDay.toFixed(2) }}%/dan,
            stiže do {{ group.threshold }}% za <span class="font-semibold text-ink">~{{ t.daysUntilThreshold }} dana</span>
          </li>
        </ul>
      </div>

      <!-- Posete crnolistiranim domenima -->
      <div
        v-if="blacklistedDomainHits.length"
        class="rounded-xl border border-bad/40 bg-bad-subtle p-4 shadow-sm"
      >
        <h2 class="font-semibold text-bad mb-1 inline-flex items-center gap-1.5"><NavIcon name="ban" /> Posete domenima sa crne liste (24h)</h2>
        <p class="text-sm text-ink-secondary mb-3">
          Računari koji su u poslednjih 24h upitivali domen sa crne liste (uključujući poddomene).
        </p>
        <ul class="space-y-1 text-sm text-ink-secondary">
          <li v-for="(d, idx) in blacklistedDomainHits" :key="idx">
            <span class="font-medium text-ink">{{ d.computerName || d.ip || '—' }}</span>
            <span v-if="d.department" class="text-ink-muted"> ({{ d.department }})</span>
            — <code class="font-mono">{{ d.domain }}</code>
            <span class="text-ink-muted"> (poslednji put {{ fmtDate(d.lastSeen) }}, {{ d.queryCount }}× upit)</span>
          </li>
        </ul>
      </div>

      <!-- Alerts -->
      <div v-if="report.content.alerts.length" class="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <h2 class="font-semibold text-ink mb-3">Aktivna upozorenja</h2>
        <div class="space-y-2">
          <RouterLink
            v-for="a in report.content.alerts"
            :key="a.id"
            :to="a.to || '/'"
            class="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:brightness-95"
            :class="levelClass[a.level] || levelClass.info"
          >
            <NavIcon :name="levelIcon[a.level] || levelIcon.info" />
            <span>{{ a.message }}</span>
          </RouterLink>
        </div>
      </div>

      <!-- Since last report -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <h2 class="font-semibold text-ink mb-3">
            Novi agenti ({{ report.content.sinceLastReport.newAgentsCount }})
          </h2>
          <div v-if="!report.content.sinceLastReport.newAgents.length" class="text-sm text-ink-muted">
            Nema novih agenata u ovom periodu.
          </div>
          <ul v-else class="space-y-1 text-sm text-ink-secondary">
            <li v-for="a in report.content.sinceLastReport.newAgents" :key="a.agentUid">
              {{ a.hostname || '—' }} <span class="text-ink-muted">({{ fmtDate(a.enrolledAt) }})</span>
            </li>
          </ul>
        </div>

        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <h2 class="font-semibold text-ink mb-3">
            Nove IP adrese ({{ report.content.sinceLastReport.newIpEntriesCount }})
          </h2>
          <div v-if="!report.content.sinceLastReport.newIpEntries.length" class="text-sm text-ink-muted">
            Nema novih unosa u ovom periodu.
          </div>
          <ul v-else class="space-y-1 text-sm text-ink-secondary">
            <li v-for="e in report.content.sinceLastReport.newIpEntries" :key="e.id">
              {{ e.ip }} — {{ e.computerName || '—' }}
              <span class="text-ink-muted">({{ fmtDate(e.createdAt) }})</span>
            </li>
          </ul>
        </div>

        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <h2 class="font-semibold text-ink mb-3">
            Novi štampači ({{ report.content.sinceLastReport.newPrintersCount }})
          </h2>
          <div v-if="!report.content.sinceLastReport.newPrinters.length" class="text-sm text-ink-muted">
            Nema novih štampača u ovom periodu.
          </div>
          <ul v-else class="space-y-1 text-sm text-ink-secondary">
            <li v-for="p in report.content.sinceLastReport.newPrinters" :key="p.id">
              {{ p.name || '—' }} <span class="text-ink-muted">({{ p.ip || '—' }})</span>
            </li>
          </ul>
        </div>

        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <h2 class="font-semibold text-ink mb-3">
            Neuspešne komande ({{ report.content.sinceLastReport.failedJobsCount }})
          </h2>
          <div v-if="!report.content.sinceLastReport.failedJobs.length" class="text-sm text-ink-muted">
            Nema neuspešnih komandi u ovom periodu.
          </div>
          <ul v-else class="space-y-1 text-sm text-ink-secondary">
            <li v-for="(j, idx) in report.content.sinceLastReport.failedJobs" :key="idx">
              {{ j.hostname || '—' }} — {{ j.commandType }}
              <span class="text-ink-muted">({{ fmtDate(j.completedAt) }})</span>
            </li>
          </ul>
        </div>

        <div class="rounded-xl border border-line bg-surface p-4 shadow-sm lg:col-span-2">
          <h2 class="font-semibold text-ink mb-3">
            Neuspešna ažuriranja agenta ({{ report.content.sinceLastReport.failedUpdatesCount }})
          </h2>
          <div v-if="!report.content.sinceLastReport.failedUpdates.length" class="text-sm text-ink-muted">
            Nema neuspešnih ažuriranja u ovom periodu.
          </div>
          <ul v-else class="space-y-1 text-sm text-ink-secondary">
            <li v-for="(u, idx) in report.content.sinceLastReport.failedUpdates" :key="idx" class="wrap-break-word">
              {{ u.hostname || '—' }} — {{ u.fromVersion || '—' }} → {{ u.toVersion || '—' }}
              <span v-if="u.reason" class="text-ink-muted">({{ u.reason }})</span>
            </li>
          </ul>
        </div>
      </div>
    </template>

    <div v-else class="text-ink-secondary">Još nema generisanih izveštaja.</div>

    <!-- Istorija -->
    <div class="rounded-xl border border-line bg-surface p-4 shadow-sm no-print">
      <h2 class="font-semibold text-ink mb-3">Istorija izveštaja</h2>
      <div v-if="!history.length" class="text-sm text-ink-muted">Nema prethodnih izveštaja.</div>
      <div v-else class="space-y-1">
        <RouterLink
          v-for="h in history"
          :key="h.id"
          :to="`/reports/${h.id}`"
          class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-sunken"
          :class="report && report.id === h.id ? 'bg-accent-subtle text-accent-emphasis' : 'text-ink-secondary'"
        >
          <span
            class="h-2 w-2 shrink-0 rounded-full"
            :class="h.openedAt ? 'bg-transparent' : 'bg-accent'"
            :title="h.openedAt ? 'Pročitano' : 'Nepročitano'"
          />
          {{ fmtDate(h.periodStart) }} — {{ fmtDate(h.periodEnd) }}
          <span class="text-ink-muted font-mono">(generisano {{ fmtDate(h.generatedAt) }})</span>
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
import { useCurrentSite } from '@/composables/useCurrentSite.js'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import StatusPill from '@/components/StatusPill.vue'
import NavIcon from '@/components/NavIcon.vue'

const route = useRoute()
const site = useCurrentSite()
const { toast, showToast } = useToast()

const TREND_WINDOW_DAYS = 90

const fmtDate = (d) => formatDate(d, 'sr-RS')

const levelClass = {
  critical: 'bg-bad-subtle text-bad border-bad/40',
  warning: 'bg-warn-subtle text-warn border-warn/40',
  info: 'bg-info-subtle text-info border-info/40',
}
const levelIcon = {
  critical: 'ban',
  warning: 'alert-triangle',
  info: 'info',
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
].filter((g) => g.items.length))
// Optional chaining namerno - stariji izveštaji (pre nego što je ovo dodato)
// nemaju content.blacklistedDomainHits u sačuvanom JSON-u.
const blacklistedDomainHits = computed(() => report.value?.content?.blacklistedDomainHits || [])
const loading = ref(false)
const error = ref('')
const downloadingPdf = ref(false)

async function loadReport() {
  loading.value = true
  error.value = ''
  try {
    const url = route.params.id
      ? `/api/protected/reports/${route.params.id}`
      : `/api/protected/reports/latest?site=${site.value}`
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
    showToast('Neuspešno preuzimanje PDF-a', { kind: 'error', duration: 3000 })
  } finally {
    downloadingPdf.value = false
  }
}

async function loadHistory() {
  try {
    const res = await fetchWithAuth(`/api/protected/reports?limit=30&site=${site.value}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    history.value = data.items || []
  } catch (err) {
    console.error('Neuspešno učitavanje istorije izveštaja:', err)
  }
}

watch(() => route.params.id, loadReport)
watch(site, () => {
  loadHistory()
  if (!route.params.id) loadReport()
})

onMounted(() => {
  loadReport()
  loadHistory()
})
</script>
