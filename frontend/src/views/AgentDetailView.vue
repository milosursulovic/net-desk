<template>
  <div class="glass-container w-full max-w-4xl mx-auto space-y-4">
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0 flex items-baseline gap-2 flex-wrap">
        <h1 class="text-2xl font-bold text-slate-800 truncate">
          {{ agent?.hostname || agent?.agentUid || 'Agent' }}
        </h1>
        <span v-if="agent?.department" class="text-sm font-medium text-slate-500">
          — {{ agent.department }}
        </span>
      </div>
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

          <button v-if="agent.status === 'active' && isAdmin" @click="confirmRevoke" class="ml-auto text-red-600 hover:underline text-sm">
            Povuci pristup
          </button>
          <button v-if="agent.status === 'revoked' && isAdmin" @click="confirmDelete" class="ml-auto text-red-600 hover:underline text-sm">
            Obriši agenta
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
            <template v-if="agent.ipEntryId">
              <RouterLink :to="`/ip/${agent.ipEntryId}/meta`" class="text-blue-600 hover:underline">
                Otvori
              </RouterLink>
              <RouterLink
                v-if="agent.computerIp && agent.site"
                :to="{ path: '/', query: { search: agent.computerIp, site: agent.site } }"
                class="ml-2 text-blue-600 hover:underline"
              >
                Na početnoj
              </RouterLink>
            </template>
            <span v-else>—</span>
          </div>
        </div>

        <div v-if="agent.description" class="rounded-lg bg-slate-50 px-3 py-2">
          <div class="text-xs text-slate-500 mb-1">Opis</div>
          <p class="text-sm text-slate-800 whitespace-pre-wrap break-words">{{ agent.description }}</p>
        </div>

        <div class="flex flex-col gap-2 pt-2 border-t">
          <label class="text-sm font-medium">Deployment grupe</label>
          <div class="flex flex-wrap items-center gap-1.5">
            <span
              v-for="g in agent.deploymentGroups"
              :key="g"
              class="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
            >
              {{ g }}
              <button
                v-if="isAdmin"
                type="button"
                @click="removeDeploymentGroup(g)"
                class="text-blue-400 hover:text-red-600"
                aria-label="Ukloni deployment grupu"
              >✖️</button>
            </span>
            <span v-if="!agent.deploymentGroups?.length" class="text-sm text-slate-400">rest (podrazumevano)</span>
          </div>
          <GroupSelect
            v-if="isAdmin"
            :model-value="''"
            :options="deploymentGroupOptions"
            :is-admin="isAdmin"
            :allow-empty="true"
            create-endpoint="/api/protected/deployment-groups"
            class="min-w-0 max-w-xs"
            @update:model-value="addDeploymentGroup"
            @group-added="(name) => { if (!deploymentGroupOptions.includes(name)) deploymentGroupOptions.push(name) }"
            @error="(msg) => showToast(msg, { prefix: '❌ ', duration: 3000 })"
          />
        </div>

        <div class="flex items-center gap-2 pt-2 border-t">
          <label class="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input type="checkbox" v-model="processKillExemptInput" @change="saveProcessKillExempt" class="rounded" />
            Izuzet od ubijanja sumnjivih procesa (whitelist)
          </label>
        </div>
        <p class="text-xs text-slate-500 -mt-2">
          Watched procesi (npr. AnyDesk/TeamViewer) se i dalje detektuju i loguju na ovom računaru, ali se nikad ne ubijaju.
        </p>
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
            <button
              v-if="agent.monitoring.antivirusStatus !== 'enabled' && isAdmin"
              :disabled="fixingPresetId === 'fix-antivirus-defender'"
              @click="sendFixJob('fix-antivirus-defender')"
              class="mt-1 text-xs text-blue-600 hover:underline disabled:opacity-50"
            >
              {{ fixingPresetId === 'fix-antivirus-defender' ? 'Šalje se…' : '🔧 Popravi' }}
            </button>
          </div>
          <div class="rounded-lg bg-slate-50 border p-2">
            <div class="text-xs text-slate-500">Firewall</div>
            <div class="font-semibold">{{ agent.monitoring.firewallStatus || '—' }}</div>
            <button
              v-if="agent.monitoring.firewallStatus !== 'enabled' && isAdmin"
              :disabled="fixingPresetId === 'fix-firewall'"
              @click="sendFixJob('fix-firewall')"
              class="mt-1 text-xs text-blue-600 hover:underline disabled:opacity-50"
            >
              {{ fixingPresetId === 'fix-firewall' ? 'Šalje se…' : '🔧 Popravi' }}
            </button>
          </div>
          <div class="rounded-lg bg-slate-50 border p-2">
            <div class="text-xs text-slate-500">BitLocker</div>
            <div class="font-semibold">{{ agent.monitoring.bitlockerStatus || '—' }}</div>
          </div>
          <div class="rounded-lg bg-slate-50 border p-2">
            <div class="text-xs text-slate-500">Windows Update</div>
            <div class="font-semibold">{{ agent.windowsUpdateStatus || '—' }}</div>
            <button
              v-if="agent.windowsUpdateStatus && agent.windowsUpdateStatus !== 'Running' && isAdmin"
              :disabled="fixingPresetId === 'fix-windows-update-service'"
              @click="sendFixJob('fix-windows-update-service')"
              class="mt-1 text-xs text-blue-600 hover:underline disabled:opacity-50"
            >
              {{ fixingPresetId === 'fix-windows-update-service' ? 'Šalje se…' : '🔧 Popravi' }}
            </button>
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
          class="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition"
          :class="tab === t ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'"
        >
          {{ TAB_LABELS[t] }}
        </button>
      </div>

      <!-- Ekran -->
      <div v-if="tab === 'screen'" class="space-y-4">
        <VncViewer :agent-id="route.params.id" />
      </div>

      <!-- Komande -->
      <div v-else-if="tab === 'jobs'" class="space-y-4">
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
          <div v-if="jobForm.commandType === 'run_powershell_script'" class="space-y-2">
            <div>
              <label class="text-sm text-slate-600">Gotova skripta (opciono)</label>
              <select v-model="selectedPresetId" class="app-input w-full" @change="applyPreset">
                <option value="">— Prilagođena skripta —</option>
                <option v-for="p in POWERSHELL_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
              </select>
            </div>
            <div>
              <label class="text-sm text-slate-600">PowerShell skripta</label>
              <textarea v-model="jobForm.script" rows="6" class="app-input w-full font-mono text-xs" placeholder="Get-Service | Where-Object ..."></textarea>
            </div>
          </div>
          <div class="flex justify-end">
            <AppButton variant="success" :disabled="creatingJob" @click="createJob">
              {{ creatingJob ? 'Šaljem…' : 'Pošalji komandu' }}
            </AppButton>
          </div>
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <div class="font-medium">
              Istorija komandi
              <span v-if="jobsPolling" class="text-blue-600 text-xs font-normal">· automatski se osvežava…</span>
            </div>
            <button v-if="jobs.length && isAdmin" @click="confirmClearJobs" class="text-red-600 hover:underline text-sm">
              Očisti logove
            </button>
          </div>
          <div v-if="jobsLoading" class="text-slate-600 text-sm">Učitavanje…</div>
          <div v-else-if="!jobs.length" class="text-slate-500 text-sm">Nema poslatih komandi.</div>
          <div v-for="j in jobs" :key="j.id" class="rounded-lg border bg-white p-3 text-sm">
            <div class="flex items-start justify-between gap-3">
              <div class="font-medium">{{ COMMAND_LABELS[j.commandType] || j.commandType }}</div>
              <div class="flex items-center gap-2 shrink-0">
                <button
                  v-if="j.status === 'pending' || j.status === 'sent'"
                  :disabled="cancellingJobId === j.id"
                  @click="cancelJob(j)"
                  class="text-red-600 hover:underline text-xs whitespace-nowrap"
                >
                  {{ cancellingJobId === j.id ? 'Otkazujem…' : 'Otkaži' }}
                </button>
                <span class="rounded-full border px-2 py-0.5 text-xs" :class="jobStatusClass(j.status)">
                  {{ j.status }}
                </span>
              </div>
            </div>
            <div class="text-xs text-slate-500 mt-1">
              Kreirano: {{ fmtDate(j.createdAt) }}
              <span v-if="j.completedAt"> · Završeno: {{ fmtDate(j.completedAt) }}</span>
              <span v-if="j.exitCode !== null"> · Exit code: {{ j.exitCode }}</span>
              <span v-if="j.durationMs !== null"> · {{ j.durationMs }}ms</span>
            </div>
            <div v-if="j.output" class="relative mt-1">
              <button @click="copyToClipboard(j.output, 'Izlaz kopiran!')"
                class="absolute top-1 right-1 text-xs text-blue-600 hover:underline" title="Kopiraj izlaz">📋</button>
              <div class="text-xs bg-slate-50 rounded p-2 pr-7 whitespace-pre-wrap break-all">{{ j.output }}</div>
            </div>
            <div v-if="j.errorOutput" class="relative mt-1">
              <button @click="copyToClipboard(j.errorOutput, 'Izlaz greške kopiran!')"
                class="absolute top-1 right-1 text-xs text-blue-600 hover:underline" title="Kopiraj izlaz greške">📋</button>
              <div class="text-xs bg-red-50 text-red-700 rounded p-2 pr-7 whitespace-pre-wrap break-all">{{ j.errorOutput }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Update log -->
      <div v-else-if="tab === 'updates'" class="space-y-3">
        <div class="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
          <div class="text-sm font-medium text-amber-900">Instaliraj određenu verziju na ovaj agent</div>
          <p class="text-xs text-amber-800">
            Zamenjuje fajlove čak i ako je agent već na toj verziji (radi i za stariju verziju od trenutne - vraćanje unazad).
          </p>
          <div class="flex flex-col sm:flex-row gap-2">
            <select v-model="selectedReleaseId" class="app-input w-full sm:w-64 text-sm">
              <option value="">— Izaberi verziju —</option>
              <option v-for="r in activeReleaseOptions" :key="r.id" :value="r.id">{{ r.version }}</option>
            </select>
            <AppButton
              variant="neutral"
              :disabled="!selectedReleaseId || installingRelease"
              @click="installSelectedRelease"
            >
              {{ installingRelease ? 'Šaljem…' : 'Instaliraj ovu verziju' }}
            </AppButton>
          </div>
        </div>

        <!-- Netdesk Agent Manager - nezavisni kanal, radi i kad je NetdeskAgent ugašen -->
        <div class="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-2">
          <div class="text-sm font-medium text-indigo-900">Netdesk Agent Manager (nezavisni kanal)</div>
          <p class="text-xs text-indigo-800">
            Radi nezavisno od NetdeskAgent servisa - dostupno čak i kad je on ugašen ili onemogućen.
          </p>

          <div v-if="managerStatusLoading" class="text-xs text-indigo-800">Učitavanje…</div>
          <div v-else-if="!managerStatus" class="text-xs text-indigo-800">
            Manager nije registrovan na ovoj mašini.
          </div>
          <template v-else>
            <div class="flex flex-wrap items-center gap-2 text-xs text-indigo-900">
              <span class="rounded-full border px-2 py-0.5" :class="managerConnectivityBadgeClass">
                {{ managerConnectivityLabel }}
              </span>
              <span>Manager v{{ managerStatus.managerVersion || '—' }}</span>
              <span>
                NetdeskAgent: <strong>{{ managerStatus.netdeskAgentServiceStatus || 'Nepoznato' }}</strong>,
                startup: <strong>{{ managerStatus.netdeskAgentStartMode || 'Nepoznato' }}</strong>
              </span>
            </div>

            <div class="flex flex-wrap gap-2">
              <AppButton variant="neutral" :disabled="sendingManagerAction" @click="sendManagerServiceAction('start_service')">
                Pokreni
              </AppButton>
              <AppButton variant="neutral" :disabled="sendingManagerAction" @click="sendManagerServiceAction('stop_service')">
                Zaustavi
              </AppButton>
              <AppButton variant="neutral" :disabled="sendingManagerAction" @click="sendManagerServiceAction('restart_service')">
                Restartuj
              </AppButton>
            </div>

            <div class="flex flex-col sm:flex-row gap-2">
              <select v-model="selectedStartMode" class="app-input w-full sm:w-40 text-sm">
                <option value="Automatic">Automatic</option>
                <option value="Manual">Manual</option>
                <option value="Disabled">Disabled</option>
              </select>
              <AppButton variant="neutral" :disabled="sendingManagerAction" @click="setManagerStartMode">
                Postavi startup tip
              </AppButton>
            </div>

            <div class="flex flex-col sm:flex-row gap-2">
              <AppButton
                variant="neutral"
                :disabled="!selectedReleaseId || installingViaManager"
                @click="installViaManager"
              >
                {{ installingViaManager ? 'Šaljem…' : 'Instaliraj preko Manager-a (kad Agent nije dostupan)' }}
              </AppButton>
            </div>
          </template>
        </div>

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

      <!-- DNS -->
      <div v-else-if="tab === 'dns'" class="space-y-2">
        <div v-if="!agent.ipEntryId" class="text-slate-500 text-sm">
          Računar još nije povezan (nema inventory sync-a).
        </div>
        <template v-else>
          <label class="inline-flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" v-model="dnsBlacklistedOnly" @change="loadDnsLogs" />
            Samo domeni sa crne liste
          </label>

          <div v-if="dnsLogsLoading" class="text-slate-600 text-sm">Učitavanje…</div>
          <div v-else-if="!dnsLogs.length" class="text-slate-500 text-sm">
            {{ dnsBlacklistedOnly ? 'Nema DNS upita ka domenima sa crne liste.' : 'Nema DNS upita.' }}
          </div>
          <div v-for="d in dnsLogs" :key="d.id"
            class="rounded-lg border bg-white p-3 text-sm"
            :class="d.isBlacklisted ? 'border-red-200 bg-red-50' : ''">
            <div class="flex items-center justify-between gap-2">
              <div class="font-medium font-mono">
                {{ d.domain }}
                <span v-if="d.isBlacklisted" class="ml-1 text-red-600" title="Domen je na crnoj listi">🚫</span>
              </div>
              <span class="text-xs text-slate-500 tabular-nums shrink-0">{{ d.queryCount }}×</span>
            </div>
            <div class="text-xs text-slate-400 mt-1">
              Prvi put viđen: {{ fmtDate(d.firstSeen) }} · Poslednji put viđen: {{ fmtDate(d.lastSeen) }}
            </div>
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
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { fmtDate as formatDate, fmtRelative } from '@/utils/format.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import { useToast } from '@/composables/useToast.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import { POWERSHELL_PRESETS } from '@/constants/powershellPresets.js'
import { COMMAND_TYPES, COMMAND_LABELS, SERVICE_COMMANDS } from '@/constants/agentCommands.js'
import FormInput from '@/components/FormInput.vue'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import GroupSelect from '@/components/GroupSelect.vue'
import VncViewer from '@/components/VncViewer.vue'

const fmtDate = (d) => formatDate(d, 'sr-RS')
const fmtPct = (v) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(1)}%`)
const fmtGb = (v) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(1)} GB`)

const route = useRoute()
const router = useRouter()
const { toast, showToast, copyToClipboard } = useToast()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()
const { isAdmin } = useCurrentUser()

// Deployment grupe se biraju iz SVOJE predefinisane liste
// (backend/routes/deploymentGroups.routes.js) - odvojena od odeljenja
// (groups_list, koja ostaje samo za Home).
const deploymentGroupOptions = ref([])

async function fetchDeploymentGroupOptions() {
  try {
    const res = await fetchWithAuth('/api/protected/deployment-groups')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    deploymentGroupOptions.value = await res.json()
  } catch (err) {
    console.error('Neuspešno dohvatanje predloga deployment grupa', err)
  }
}

const TAB_NAMES = ['screen', 'jobs', 'updates', 'events', 'dns']
const TAB_LABELS = { screen: 'Ekran', jobs: 'Komande', updates: 'Update log', events: 'Event Log', dns: 'DNS' }

const { tab } = usePaginatedRoute({
  fields: { tab: { type: 'string', default: 'jobs', oneOf: TAB_NAMES } },
  useReplace: true,
})

const agent = ref(null)
const loading = ref(false)
const loadError = ref('')
const processKillExemptInput = ref(false)

const jobs = ref([])
const jobsLoading = ref(false)
const jobsLoaded = ref(false)
const jobsPolling = ref(false)
const cancellingJobId = ref(null)
const fixingPresetId = ref('')

const updateLog = ref([])
const updateLogLoading = ref(false)
const updateLogLoaded = ref(false)

const releaseOptions = ref([])
// Boolean(...) namerno - backend vraća mysql2-ovu sirovu TINYINT(1)
// vrednost (0/1) za is_active, ne pravi JS boolean.
const activeReleaseOptions = computed(() => releaseOptions.value.filter((r) => Boolean(r.isActive)))
const selectedReleaseId = ref('')
const installingRelease = ref(false)

const managerStatus = ref(null)
const managerStatusLoading = ref(false)
const sendingManagerAction = ref(false)
const installingViaManager = ref(false)
const selectedStartMode = ref('Automatic')

async function fetchReleaseOptions() {
  try {
    const res = await fetchWithAuth('/api/protected/agent-releases?limit=100')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    releaseOptions.value = data.items || []
  } catch (err) {
    console.error('Neuspešno dohvatanje verzija', err)
  }
}

const eventLogs = ref([])
const eventLogsLoading = ref(false)
const eventLogsLoaded = ref(false)

const dnsLogs = ref([])
const dnsLogsLoading = ref(false)
const dnsLogsLoaded = ref(false)
const dnsBlacklistedOnly = ref(false)

const jobForm = ref({ commandType: 'collect_inventory', serviceName: '', script: '' })
const creatingJob = ref(false)
const isServiceCommand = computed(() => SERVICE_COMMANDS.has(jobForm.value.commandType))

const selectedPresetId = ref('')
function applyPreset() {
  const preset = POWERSHELL_PRESETS.find((p) => p.id === selectedPresetId.value)
  jobForm.value.script = preset ? preset.script : ''
}

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

const managerConnectivityLabel = computed(() => {
  const map = { online: 'Online', stale: 'Neaktivan', offline: 'Offline', unknown: 'Nepoznato' }
  return map[managerStatus.value?.connectivityStatus] || 'Nepoznato'
})
const managerConnectivityBadgeClass = computed(() => {
  const s = managerStatus.value?.connectivityStatus
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
    // Boolean(...) namerno - backend vraća mysql2-ovu sirovu TINYINT(1)
    // vrednost (0/1) za ovo polje, ne pravi JSON boolean.
    processKillExemptInput.value = Boolean(agent.value.processKillExempt)
  } catch (err) {
    console.error(err)
    loadError.value = 'Neuspešno učitan agent'
  } finally {
    loading.value = false
  }
}

async function addDeploymentGroup(name) {
  if (!name) return
  try {
    const res = await fetchWithAuth(`/api/protected/agents/${route.params.id}/deployment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupName: name }),
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri dodavanju deployment grupe'))
    agent.value = await res.json()
  } catch (err) {
    console.error(err)
    showToast(err.message || 'Greška pri dodavanju deployment grupe', { prefix: '❌ ', duration: 3000 })
  }
}

async function removeDeploymentGroup(name) {
  try {
    const res = await fetchWithAuth(
      `/api/protected/agents/${route.params.id}/deployment-groups/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    )
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri uklanjanju deployment grupe'))
    agent.value = await res.json()
  } catch (err) {
    console.error(err)
    showToast(err.message || 'Greška pri uklanjanju deployment grupe', { prefix: '❌ ', duration: 3000 })
  }
}

async function saveProcessKillExempt() {
  const value = processKillExemptInput.value
  try {
    const res = await fetchWithAuth(`/api/protected/agents/${route.params.id}/process-kill-exempt`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ processKillExempt: value }),
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri čuvanju whitelist-e'))
    agent.value = { ...agent.value, processKillExempt: value }
    showToast(value ? 'Računar dodat na whitelist' : 'Računar uklonjen sa whitelist-e')
  } catch (err) {
    console.error(err)
    processKillExemptInput.value = !value
    showToast('Greška pri čuvanju whitelist-e', { prefix: '❌ ', duration: 3000 })
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

async function confirmDelete() {
  const ok = await askConfirm(
    `Trajno obrisati agenta "${agent.value?.hostname || agent.value?.agentUid}"? Ova radnja se ne može poništiti - briše i istoriju komandi, monitoring i deployment grupe ovog agenta.`,
    { title: 'Brisanje agenta' },
  )
  if (!ok) return
  try {
    const res = await fetchWithAuth(`/api/protected/agents/${route.params.id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri brisanju agenta'))
    showToast('Agent obrisan')
    router.push('/agents')
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri brisanju agenta', { prefix: '❌ ', duration: 3000 })
  }
}

let jobsPollTimer = null

function stopJobsPolling() {
  clearTimeout(jobsPollTimer)
  jobsPollTimer = null
  jobsPolling.value = false
}

// isBackgroundPoll=true (automatski osvežavanje dok ima pending/sent komandi,
// isti obrazac kao BatchJobDetailView.vue) namerno ne dira jobsLoading - inače
// bi se "Učitavanje…" tekst treperio na svakih 4s dok se čeka rezultat.
async function loadJobs(isBackgroundPoll = false) {
  stopJobsPolling()
  if (!isBackgroundPoll) jobsLoading.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/agents/${route.params.id}/jobs?limit=50`)
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri učitavanju komandi'))
    const data = await res.json()
    jobs.value = data.items || []
    jobsLoaded.value = true

    const stillGoing = jobs.value.some((j) => j.status === 'pending' || j.status === 'sent')
    if (stillGoing && tab.value === 'jobs') {
      jobsPolling.value = true
      jobsPollTimer = setTimeout(() => loadJobs(true), 4000)
    } else {
      jobsPolling.value = false
    }
  } catch (err) {
    console.error(err)
  } finally {
    if (!isBackgroundPoll) jobsLoading.value = false
  }
}

// Otkazuje pojedinačnu komandu koja još nije Završena/Neuspešna (pending
// ili sent) - isti backend endpoint kao "Otkaži" na Batch Job Detail strani.
async function cancelJob(job) {
  const ok = await askConfirm(
    `Otkazati komandu "${COMMAND_LABELS[job.commandType] || job.commandType}"?`,
    { title: 'Otkazivanje komande' },
  )
  if (!ok) return

  cancellingJobId.value = job.id
  try {
    const res = await fetchWithAuth(`/api/protected/agents/jobs/${job.id}/cancel`, { method: 'POST' })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri otkazivanju komande'))
    showToast('Komanda otkazana')
    await loadJobs()
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri otkazivanju komande', { prefix: '❌ ', duration: 3000 })
  } finally {
    cancellingJobId.value = null
  }
}

async function confirmClearJobs() {
  const ok = await askConfirm('Očistiti istoriju komandi za ovaj agent? Ova radnja se ne može poništiti.', {
    title: 'Čišćenje logova komandi',
  })
  if (!ok) return
  try {
    const res = await fetchWithAuth(`/api/protected/agents/${route.params.id}/jobs`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri čišćenju logova'))
    await loadJobs()
    showToast('Logovi komandi očišćeni')
  } catch (err) {
    console.error(err)
    showToast('Greška pri čišćenju logova', { prefix: '❌ ', duration: 3000 })
  }
}

// "Popravi" dugmad pored Antivirus/Firewall/Windows Update statusa u
// Monitoring kartici - šalju fiksan run_powershell_script preset po id-ju
// (vidi fix-antivirus-defender/fix-firewall/fix-windows-update-service u
// powershellPresets.js), isti /jobs endpoint kao ručni "Nova komanda" forma,
// samo bez ulaska u tab. Best-effort popravka, ne garantovana - detalji
// zašto u samim skriptama.
async function sendFixJob(presetId) {
  const preset = POWERSHELL_PRESETS.find((p) => p.id === presetId)
  if (!preset) return

  fixingPresetId.value = presetId
  try {
    const res = await fetchWithAuth(`/api/protected/agents/${route.params.id}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandType: 'run_powershell_script', payload: { script: preset.script } }),
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri slanju komande za popravku'))
    if (jobsLoaded.value) await loadJobs()
    showToast('Komanda za popravku poslata - proveri rezultat u tabu "Komande".')
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri slanju komande za popravku', { prefix: '❌ ', duration: 3000 })
  } finally {
    fixingPresetId.value = ''
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

async function installSelectedRelease() {
  const release = activeReleaseOptions.value.find((r) => r.id === selectedReleaseId.value)
  if (!release) return

  const ok = await askConfirm(
    `Instalirati verziju ${release.version} na ovaj agent? Zamenjuje fajlove čak i ako je agent već na ovoj verziji.`,
    { title: 'Instalacija verzije' },
  )
  if (!ok) return

  installingRelease.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/agents/${route.params.id}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commandType: 'force_reinstall_agent',
        payload: { releaseId: release.id, version: release.version, sha256: release.sha256 },
      }),
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri slanju komande'))
    showToast(`Komanda za instalaciju verzije ${release.version} poslata - prati status u tabu "Komande"`)
    selectedReleaseId.value = ''
    await loadJobs()
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri slanju komande', { prefix: '❌ ', duration: 3000 })
  } finally {
    installingRelease.value = false
  }
}

async function loadManagerStatus() {
  managerStatusLoading.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/agents/${route.params.id}/manager-status`)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    managerStatus.value = data.manager || null
  } catch (err) {
    console.error('Neuspešno dohvatanje Manager statusa', err)
    managerStatus.value = null
  } finally {
    managerStatusLoading.value = false
  }
}

async function sendManagerServiceAction(commandType) {
  if (!managerStatus.value?.managerId) return
  sendingManagerAction.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/managers/${managerStatus.value.managerId}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandType, payload: {} }),
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri slanju komande'))
    showToast('Komanda poslata Manager-u')
    await loadManagerStatus()
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri slanju komande', { prefix: '❌ ', duration: 3000 })
  } finally {
    sendingManagerAction.value = false
  }
}

async function setManagerStartMode() {
  if (!managerStatus.value?.managerId) return
  sendingManagerAction.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/managers/${managerStatus.value.managerId}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commandType: 'set_service_start_mode',
        payload: { startMode: selectedStartMode.value },
      }),
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri slanju komande'))
    showToast(`Startup tip postavljen na ${selectedStartMode.value}`)
    await loadManagerStatus()
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri slanju komande', { prefix: '❌ ', duration: 3000 })
  } finally {
    sendingManagerAction.value = false
  }
}

async function installViaManager() {
  const release = activeReleaseOptions.value.find((r) => r.id === selectedReleaseId.value)
  if (!release || !managerStatus.value?.managerId) return

  const ok = await askConfirm(
    `Instalirati verziju ${release.version} preko Manager-a? Koristi se kad NetdeskAgent nije dostupan da sam preuzme update.`,
    { title: 'Instalacija preko Manager-a' },
  )
  if (!ok) return

  installingViaManager.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/managers/${managerStatus.value.managerId}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commandType: 'install_update',
        payload: { releaseId: release.id },
      }),
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri slanju komande'))
    showToast(`Komanda za instalaciju verzije ${release.version} poslata Manager-u`)
    await loadManagerStatus()
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri slanju komande', { prefix: '❌ ', duration: 3000 })
  } finally {
    installingViaManager.value = false
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

async function loadDnsLogs() {
  if (!agent.value?.ipEntryId) return
  dnsLogsLoading.value = true
  try {
    const params = new URLSearchParams({
      ipEntryId: agent.value.ipEntryId,
      limit: 50,
      sortBy: 'lastSeen',
      sortOrder: 'desc',
    })
    if (dnsBlacklistedOnly.value) params.set('blacklistedOnly', 'true')
    const res = await fetchWithAuth(`/api/protected/dns-logs?${params.toString()}`)
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri učitavanju DNS logova'))
    const data = await res.json()
    dnsLogs.value = data.items || []
    dnsLogsLoaded.value = true
  } catch (err) {
    console.error(err)
  } finally {
    dnsLogsLoading.value = false
  }
}

function selectTab(name) {
  tab.value = name
  if (name === 'jobs') {
    if (!jobsLoaded.value) {
      loadJobs()
    } else if (!jobsPollTimer) {
      // Vraćanje na tab dok nešto još čeka - nastavi osvežavanje umesto da
      // ostane zauvek na starom snimku.
      const stillGoing = jobs.value.some((j) => j.status === 'pending' || j.status === 'sent')
      if (stillGoing) {
        jobsPolling.value = true
        jobsPollTimer = setTimeout(() => loadJobs(true), 4000)
      }
    }
  } else {
    // Ne osvežavaj u pozadini dok korisnik ne gleda ovaj tab.
    stopJobsPolling()
    if (name === 'updates' && !updateLogLoaded.value) loadUpdateLog()
    else if (name === 'events' && !eventLogsLoaded.value) loadEventLogs()
    else if (name === 'dns' && !dnsLogsLoaded.value) loadDnsLogs()
  }
}

onMounted(async () => {
  fetchDeploymentGroupOptions()
  fetchReleaseOptions()
  loadManagerStatus()
  await loadAgent()
  if (!loadError.value) selectTab(tab.value)
})

onBeforeUnmount(() => {
  stopJobsPolling()
})
</script>
