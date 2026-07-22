<template>
  <div class="glass-container w-full max-w-4xl mx-auto space-y-4">
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-2xl font-bold text-slate-800 truncate">
        {{ agent?.hostname || agent?.agentUid || 'Agent' }}
      </h1>
      <AppButton variant="neutral" @click="goBack">Nazad</AppButton>
    </div>

    <div v-if="loading" class="text-slate-600">Učitavanje…</div>
    <div v-else-if="loadError" class="text-red-600">{{ loadError }}</div>

    <div v-else-if="agent" class="space-y-4">
      <!-- Info kartica -->
      <div class="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <span
            class="inline-flex items-center px-2 py-0.5 rounded-full text-xs border"
            :class="agent.status === 'active'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-slate-100 text-slate-500 border-slate-200'"
          >
            {{ agent.status === 'active' ? 'Aktivan' : 'Povučen' }}
          </span>
          <span
            class="inline-flex items-center px-2 py-0.5 rounded-full text-xs border"
            :class="connectivityBadgeClass"
          >
            {{ connectivityLabel }}
          </span>
          <span class="text-xs text-slate-500">{{ agent.agentUid }}</span>
          <button @click="copy(agent.agentUid)" class="text-xs text-slate-400 hover:text-slate-600">📋</button>

          <button v-if="agent.status === 'active'" @click="confirmRevoke" class="ml-auto text-red-600 hover:underline text-sm">
            Povuci pristup
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          <div><span class="font-medium">OS:</span> {{ agent.osCaption || '—' }} {{ agent.osVersion || '' }}</div>
          <div><span class="font-medium">Verzija agenta:</span> {{ agent.agentVersion || '—' }}</div>
          <div><span class="font-medium">Poslednji heartbeat:</span> {{ fmtRelative(agent.lastHeartbeatAt) }}</div>
          <div><span class="font-medium">Poslednji IP:</span> {{ agent.lastIp || '—' }}</div>
          <div><span class="font-medium">Enroll:</span> {{ fmtDate(agent.enrolledAt) }}</div>
          <div>
            <span class="font-medium">Povezan računar:</span>
            <RouterLink v-if="agent.ipEntryId" :to="`/ip/${agent.ipEntryId}/meta`" class="text-blue-600 hover:underline">
              Otvori
            </RouterLink>
            <span v-else>—</span>
          </div>
        </div>

        <div class="flex items-center gap-2 pt-2 border-t">
          <label class="text-sm font-medium">Deployment grupa</label>
          <select v-model="deploymentGroupInput" @change="saveDeploymentGroup" class="app-input w-auto text-sm py-1">
            <option v-for="g in DEPLOYMENT_GROUPS" :key="g" :value="g">{{ g }}</option>
          </select>
        </div>
      </div>

      <!-- Monitoring -->
      <div v-if="agent.monitoring" class="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
        <div class="font-medium mb-2">Monitoring</div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div class="rounded-lg bg-slate-50 border p-2">
            <div class="text-xs text-slate-500">CPU</div>
            <div class="font-semibold">{{ fmtPct(agent.monitoring.cpuLoadPct) }}</div>
          </div>
          <div class="rounded-lg bg-slate-50 border p-2">
            <div class="text-xs text-slate-500">RAM</div>
            <div class="font-semibold">{{ fmtPct(agent.monitoring.ramLoadPct) }}</div>
          </div>
          <div class="rounded-lg bg-slate-50 border p-2">
            <div class="text-xs text-slate-500">Disk</div>
            <div class="font-semibold">{{ fmtPct(agent.monitoring.diskUsedPct) }}</div>
          </div>
          <div class="rounded-lg bg-slate-50 border p-2">
            <div class="text-xs text-slate-500">Slobodno (disk)</div>
            <div class="font-semibold">{{ fmtGb(agent.monitoring.diskFreeGb) }}</div>
          </div>
          <div class="rounded-lg bg-slate-50 border p-2">
            <div class="text-xs text-slate-500">Mreža</div>
            <div class="font-semibold">{{ agent.monitoring.networkConnected ? 'Povezan' : 'Nepovezan' }}</div>
          </div>
          <div class="rounded-lg bg-slate-50 border p-2">
            <div class="text-xs text-slate-500">Antivirus</div>
            <div class="font-semibold">{{ agent.monitoring.antivirusStatus || '—' }}</div>
          </div>
          <div class="rounded-lg bg-slate-50 border p-2">
            <div class="text-xs text-slate-500">Firewall</div>
            <div class="font-semibold">{{ agent.monitoring.firewallStatus || '—' }}</div>
          </div>
          <div class="rounded-lg bg-slate-50 border p-2">
            <div class="text-xs text-slate-500">BitLocker</div>
            <div class="font-semibold">{{ agent.monitoring.bitlockerStatus || '—' }}</div>
          </div>
        </div>
        <div class="text-xs text-slate-400 mt-2">Prikupljeno: {{ fmtDate(agent.monitoring.collectedAt) }}</div>
      </div>

      <!-- Tabovi -->
      <div class="flex flex-nowrap gap-2 overflow-x-auto border-b pb-3 no-scrollbar sm:flex-wrap sm:overflow-visible">
        <button
          v-for="t in TAB_NAMES"
          :key="t"
          type="button"
          @click="selectTab(t)"
          class="shrink-0 px-3 py-2 rounded-md text-sm font-medium transition"
          :class="tab === t ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'"
        >
          {{ TAB_LABELS[t] }}
        </button>
      </div>

      <!-- Komande -->
      <div v-if="tab === 'jobs'" class="space-y-4">
        <div class="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-3">
          <div class="font-medium">Nova komanda</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-sm text-slate-600">Tip komande</label>
              <select v-model="jobForm.commandType" class="app-input w-full">
                <option v-for="c in COMMAND_TYPES" :key="c" :value="c">{{ COMMAND_LABELS[c] }}</option>
              </select>
            </div>
            <FormInput v-if="isServiceCommand" v-model.trim="jobForm.serviceName" label="Naziv servisa" placeholder="Spooler" />
          </div>
          <div v-if="jobForm.commandType === 'run_powershell_script'">
            <label class="text-sm text-slate-600">PowerShell skripta</label>
            <textarea v-model="jobForm.script" rows="4" class="app-input w-full font-mono text-xs" placeholder="Get-Service | Where-Object ..."></textarea>
          </div>
          <div class="flex justify-end">
            <AppButton variant="success" :disabled="creatingJob" @click="createJob">
              {{ creatingJob ? 'Šaljem…' : 'Pošalji komandu' }}
            </AppButton>
          </div>
        </div>

        <div class="space-y-2">
          <div v-if="jobsLoading" class="text-slate-600 text-sm">Učitavanje…</div>
          <div v-else-if="!jobs.length" class="text-slate-500 text-sm">Nema poslatih komandi.</div>
          <div v-for="j in jobs" :key="j.id" class="rounded-lg border bg-white p-3 text-sm">
            <div class="flex items-start justify-between gap-3">
              <div class="font-medium">{{ COMMAND_LABELS[j.commandType] || j.commandType }}</div>
              <span class="rounded-full border px-2 py-0.5 text-xs" :class="jobStatusClass(j.status)">
                {{ j.status }}
              </span>
            </div>
            <div class="text-xs text-slate-500 mt-1">
              Kreirano: {{ fmtDate(j.createdAt) }}
              <span v-if="j.completedAt"> · Završeno: {{ fmtDate(j.completedAt) }}</span>
              <span v-if="j.exitCode !== null"> · Exit code: {{ j.exitCode }}</span>
              <span v-if="j.durationMs !== null"> · {{ j.durationMs }}ms</span>
            </div>
            <div v-if="j.output" class="mt-1 text-xs bg-slate-50 rounded p-2 whitespace-pre-wrap break-all">{{ j.output }}</div>
            <div v-if="j.errorOutput" class="mt-1 text-xs bg-red-50 text-red-700 rounded p-2 whitespace-pre-wrap break-all">{{ j.errorOutput }}</div>
          </div>
        </div>
      </div>

      <!-- Update log -->
      <div v-else-if="tab === 'updates'" class="space-y-2">
        <div v-if="updateLogLoading" class="text-slate-600 text-sm">Učitavanje…</div>
        <div v-else-if="!updateLog.length" class="text-slate-500 text-sm">Nema pokušaja ažuriranja.</div>
        <div v-for="u in updateLog" :key="u.id" class="rounded-lg border bg-white p-3 text-sm">
          <div class="flex items-center justify-between">
            <div>{{ u.fromVersion || '—' }} → {{ u.toVersion || '—' }}</div>
            <span class="rounded-full border px-2 py-0.5 text-xs" :class="u.success ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'">
              {{ u.success ? 'Uspešno' : 'Neuspešno' }}
            </span>
          </div>
          <div v-if="u.reason" class="text-xs text-slate-600 mt-1">{{ u.reason }}</div>
          <div class="text-xs text-slate-400 mt-1">{{ fmtDate(u.reportedAt) }}</div>
        </div>
      </div>

      <!-- Event log -->
      <div v-else-if="tab === 'events'" class="space-y-2">
        <div v-if="!agent.ipEntryId" class="text-slate-500 text-sm">
          Računar još nije povezan (nema inventory sync-a).
        </div>
        <template v-else>
          <div v-if="eventLogsLoading" class="text-slate-600 text-sm">Učitavanje…</div>
          <div v-else-if="!eventLogs.length" class="text-slate-500 text-sm">Nema event log unosa.</div>
          <div v-for="e in eventLogs" :key="e.id" class="rounded-lg border bg-white p-3 text-sm">
            <div class="flex items-center justify-between gap-2">
              <div class="font-medium">{{ e.source || '—' }} <span class="text-xs text-slate-400">({{ e.log_name }})</span></div>
              <span class="rounded-full border px-2 py-0.5 text-xs" :class="eventLevelClass(e.level)">{{ e.level || '—' }}</span>
            </div>
            <div class="text-xs text-slate-600 mt-1">{{ e.message || '—' }}</div>
            <div class="text-xs text-slate-400 mt-1">Event ID: {{ e.event_id ?? '—' }} · {{ fmtDate(e.logged_at) }}</div>
          </div>
        </template>
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

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { fmtDate as formatDate, fmtRelative } from '@/utils/format.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import { useToast } from '@/composables/useToast.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import FormInput from '@/components/FormInput.vue'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const fmtDate = (d) => formatDate(d, 'sr-RS')
const fmtPct = (v) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(1)}%`)
const fmtGb = (v) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(1)} GB`)

const route = useRoute()
const router = useRouter()
const { toast, showToast, copyToClipboard } = useToast()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()

// Duplicated in AgentReleasesView.vue (no shared constants module for this
// yet) - also must match the backend's implicit "rest" default fallback in
// agentReleases.service.js. Keep all three in sync if groups ever change.
const DEPLOYMENT_GROUPS = ['test', 'it', 'pilot', 'rest']

const COMMAND_TYPES = [
  'restart_computer',
  'shutdown_computer',
  'logoff_user',
  'restart_service',
  'start_service',
  'stop_service',
  'run_powershell_script',
  'collect_inventory',
  'refresh_software_list',
  'delete_temp_files',
]

const COMMAND_LABELS = {
  restart_computer: 'Restart računara',
  shutdown_computer: 'Gašenje računara',
  logoff_user: 'Odjava korisnika',
  restart_service: 'Restart servisa',
  start_service: 'Pokretanje servisa',
  stop_service: 'Zaustavljanje servisa',
  run_powershell_script: 'PowerShell skripta',
  collect_inventory: 'Prikupljanje inventara',
  refresh_software_list: 'Osvežavanje softverske liste',
  delete_temp_files: 'Brisanje privremenih fajlova',
}

const SERVICE_COMMANDS = new Set(['restart_service', 'start_service', 'stop_service'])

const TAB_NAMES = ['jobs', 'updates', 'events']
const TAB_LABELS = { jobs: 'Komande', updates: 'Update log', events: 'Event Log' }

const { tab } = usePaginatedRoute({
  fields: { tab: { type: 'string', default: 'jobs', oneOf: TAB_NAMES } },
  useReplace: true,
})

const agent = ref(null)
const loading = ref(false)
const loadError = ref('')
const deploymentGroupInput = ref('rest')

const jobs = ref([])
const jobsLoading = ref(false)
const jobsLoaded = ref(false)

const updateLog = ref([])
const updateLogLoading = ref(false)
const updateLogLoaded = ref(false)

const eventLogs = ref([])
const eventLogsLoading = ref(false)
const eventLogsLoaded = ref(false)

const jobForm = ref({ commandType: 'collect_inventory', serviceName: '', script: '' })
const creatingJob = ref(false)
const isServiceCommand = computed(() => SERVICE_COMMANDS.has(jobForm.value.commandType))

const connectivityLabel = computed(() => {
  const map = { online: 'Online', stale: 'Neaktivan', offline: 'Offline', unknown: 'Nepoznato' }
  return map[agent.value?.connectivityStatus] || 'Nepoznato'
})
const connectivityBadgeClass = computed(() => {
  const s = agent.value?.connectivityStatus
  if (s === 'online') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (s === 'stale') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (s === 'offline') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-slate-100 text-slate-500 border-slate-200'
})

function jobStatusClass(status) {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'failed') return 'bg-red-50 text-red-700 border-red-200'
  if (status === 'sent') return 'bg-blue-50 text-blue-700 border-blue-200'
  return 'bg-slate-50 text-slate-600 border-slate-200'
}

function eventLevelClass(level) {
  const l = String(level || '').toLowerCase()
  if (l === 'critical' || l === 'error') return 'bg-red-50 text-red-700 border-red-200'
  if (l === 'warning') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-slate-50 text-slate-600 border-slate-200'
}

function goBack() {
  router.push('/agents')
}

async function copy(text) {
  await copyToClipboard(text, 'Agent ID kopiran')
}

async function loadAgent() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetchWithAuth(`/api/protected/agents/${route.params.id}`)
    if (!res.ok) {
      loadError.value = await parseError(res, 'Agent nije pronađen')
      return
    }
    agent.value = await res.json()
    deploymentGroupInput.value = agent.value.deploymentGroup || 'rest'
  } catch (err) {
    console.error(err)
    loadError.value = 'Neuspešno učitan agent'
  } finally {
    loading.value = false
  }
}

async function saveDeploymentGroup() {
  try {
    const res = await fetchWithAuth(`/api/protected/agents/${route.params.id}/deployment-group`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deploymentGroup: deploymentGroupInput.value }),
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri čuvanju grupe'))
    agent.value = { ...agent.value, deploymentGroup: deploymentGroupInput.value }
    showToast('Deployment grupa sačuvana')
  } catch (err) {
    console.error(err)
    showToast('Greška pri čuvanju grupe', { prefix: '❌ ', duration: 3000 })
  }
}

async function confirmRevoke() {
  const ok = await askConfirm(`Povući pristup agentu "${agent.value?.hostname || agent.value?.agentUid}"?`, {
    title: 'Povlačenje agenta',
  })
  if (!ok) return
  try {
    const res = await fetchWithAuth(`/api/protected/agents/${route.params.id}/revoke`, { method: 'POST' })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri povlačenju'))
    await loadAgent()
    showToast('Agent povučen')
  } catch (err) {
    console.error(err)
    showToast('Greška pri povlačenju agenta', { prefix: '❌ ', duration: 3000 })
  }
}

async function loadJobs() {
  jobsLoading.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/agents/${route.params.id}/jobs?limit=50`)
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri učitavanju komandi'))
    const data = await res.json()
    jobs.value = data.items || []
    jobsLoaded.value = true
  } catch (err) {
    console.error(err)
  } finally {
    jobsLoading.value = false
  }
}

async function createJob() {
  const payload = {}
  if (isServiceCommand.value) {
    if (!jobForm.value.serviceName.trim()) {
      showToast('Naziv servisa je obavezan', { prefix: '❌ ', duration: 3000 })
      return
    }
    payload.serviceName = jobForm.value.serviceName.trim()
  }
  if (jobForm.value.commandType === 'run_powershell_script') {
    if (!jobForm.value.script.trim()) {
      showToast('Skripta je obavezna', { prefix: '❌ ', duration: 3000 })
      return
    }
    payload.script = jobForm.value.script.trim()
  }

  creatingJob.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/agents/${route.params.id}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandType: jobForm.value.commandType, payload }),
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri slanju komande'))
    await loadJobs()
    showToast('Komanda poslata')
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri slanju komande', { prefix: '❌ ', duration: 3000 })
  } finally {
    creatingJob.value = false
  }
}

async function loadUpdateLog() {
  updateLogLoading.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/agents/${route.params.id}/update-log?limit=50`)
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri učitavanju update log-a'))
    const data = await res.json()
    updateLog.value = data.items || []
    updateLogLoaded.value = true
  } catch (err) {
    console.error(err)
  } finally {
    updateLogLoading.value = false
  }
}

async function loadEventLogs() {
  if (!agent.value?.ipEntryId) return
  eventLogsLoading.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/pdsu/${agent.value.ipEntryId}/event-logs?limit=50`)
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri učitavanju event log-a'))
    const data = await res.json()
    eventLogs.value = data.items || []
    eventLogsLoaded.value = true
  } catch (err) {
    console.error(err)
  } finally {
    eventLogsLoading.value = false
  }
}

function selectTab(name) {
  tab.value = name
  if (name === 'jobs' && !jobsLoaded.value) loadJobs()
  else if (name === 'updates' && !updateLogLoaded.value) loadUpdateLog()
  else if (name === 'events' && !eventLogsLoaded.value) loadEventLogs()
}

onMounted(async () => {
  await loadAgent()
  if (!loadError.value) selectTab(tab.value)
})
</script>
