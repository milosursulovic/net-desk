<template>
  <div class="w-full max-w-4xl mx-auto space-y-4">
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl font-bold text-ink truncate" style="font-family: var(--font-display)">
          {{ agent?.hostname || agent?.agentUid || 'Agent' }}
        </h1>
        <p v-if="agent?.department" class="mt-0.5 text-sm text-ink-muted">{{ agent.department }}</p>
      </div>
      <AppButton variant="neutral" @click="goBack">Nazad</AppButton>
    </div>

    <div v-if="loading" class="text-ink-secondary">Učitavanje…</div>
    <div v-else-if="loadError" class="text-bad">{{ loadError }}</div>

    <div v-else-if="agent" class="space-y-4">
      <!-- Info kartica -->
      <div class="rounded-xl border border-line bg-surface shadow-sm p-4 space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <StatusPill :status="agentStatusTone(agent.status)" :label="agentStatusLabel(agent.status)" />
          <StatusPill :status="connectivityTone(agent.connectivityStatus)" :label="connectivityLabel(agent.connectivityStatus)" />
          <StatusPill
            v-if="managerStatus"
            status="info"
            label="MANAGER"
            :title="`Novi (nezavisni) Manager kanal registrovan - ${managerStatus.connectivityStatus}`"
          />
          <span class="font-mono text-xs text-ink-muted">{{ agent.agentUid }}</span>
          <button @click="copy(agent.agentUid)" class="text-xs text-ink-muted hover:text-ink"><NavIcon name="copy" /></button>

          <button v-if="agent.status === 'active' && isAdmin" @click="confirmRevoke" class="ml-auto inline-flex items-center gap-1.5 text-bad hover:underline text-sm">
            <NavIcon name="ban" />
            Povuci pristup
          </button>
          <button v-if="agent.status === 'revoked' && isAdmin" @click="confirmDelete" class="ml-auto inline-flex items-center gap-1.5 text-bad hover:underline text-sm">
            <NavIcon name="trash" />
            Obriši agenta
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-ink-secondary">
          <div><span class="font-medium text-ink">OS:</span> {{ agent.osCaption || '—' }} {{ agent.osVersion || '' }}</div>
          <div><span class="font-medium text-ink">Verzija agenta:</span> <span class="font-mono">{{ agent.agentVersion || '—' }}</span></div>
          <div><span class="font-medium text-ink">Poslednji heartbeat:</span> {{ fmtRelative(agent.lastHeartbeatAt) }}</div>
          <div><span class="font-medium text-ink">Poslednji IP:</span> <span class="font-mono">{{ agent.lastIp || '—' }}</span></div>
          <div><span class="font-medium text-ink">Enroll:</span> <span class="font-mono">{{ fmtDate(agent.enrolledAt) }}</span></div>
          <div>
            <span class="font-medium text-ink">Povezan računar:</span>
            <template v-if="agent.ipEntryId">
              <RouterLink :to="`/ip/${agent.ipEntryId}/meta`" class="text-accent hover:underline">
                Otvori
              </RouterLink>
              <RouterLink
                v-if="agent.computerIp && agent.site"
                :to="{ path: '/', query: { search: agent.computerIp, site: agent.site } }"
                class="ml-2 text-accent hover:underline"
              >
                Na početnoj
              </RouterLink>
            </template>
            <span v-else>—</span>
          </div>
        </div>

        <div v-if="agent.description" class="rounded-lg bg-surface-sunken px-3 py-2">
          <div class="text-xs text-ink-muted mb-1">Opis</div>
          <p class="text-sm text-ink whitespace-pre-wrap wrap-break-word">{{ agent.description }}</p>
        </div>

        <div class="flex flex-col gap-2 pt-2 border-t border-line">
          <label class="text-sm font-medium text-ink">Deployment grupe</label>
          <div class="flex flex-wrap items-center gap-1.5">
            <TagChip
              v-for="g in agent.deploymentGroups"
              :key="g"
              :label="g"
              variant="accent"
              :removable="isAdmin"
              @remove="removeDeploymentGroup(g)"
            />
            <span v-if="!agent.deploymentGroups?.length" class="text-sm text-ink-muted">rest (podrazumevano)</span>
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
            @error="(msg) => showToast(msg, { kind: 'error', duration: 3000 })"
          />
        </div>

        <div class="flex items-center gap-2 pt-2 border-t border-line">
          <label class="flex items-center gap-2 text-sm font-medium text-ink cursor-pointer">
            <input type="checkbox" v-model="processKillExemptInput" @change="saveProcessKillExempt" class="rounded" />
            Izuzet od ubijanja sumnjivih procesa (whitelist)
          </label>
        </div>
        <p class="text-xs text-ink-muted -mt-2">
          Watched procesi (npr. AnyDesk/TeamViewer) se i dalje detektuju i loguju na ovom računaru, ali se nikad ne ubijaju.
        </p>
      </div>

      <!-- Monitoring -->
      <div v-if="agent.monitoring" class="rounded-xl border border-line bg-surface shadow-sm p-4">
        <div class="font-medium text-ink mb-2">Monitoring</div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div class="rounded-lg bg-surface-sunken border border-line p-2">
            <div class="text-xs text-ink-muted">CPU</div>
            <div class="font-mono font-semibold tabular-nums text-ink">{{ fmtPct(agent.monitoring.cpuLoadPct) }}</div>
          </div>
          <div class="rounded-lg bg-surface-sunken border border-line p-2">
            <div class="text-xs text-ink-muted">RAM</div>
            <div class="font-mono font-semibold tabular-nums text-ink">{{ fmtPct(agent.monitoring.ramLoadPct) }}</div>
          </div>
          <div class="rounded-lg bg-surface-sunken border border-line p-2">
            <div class="text-xs text-ink-muted">Disk</div>
            <div class="font-mono font-semibold tabular-nums text-ink">{{ fmtPct(agent.monitoring.diskUsedPct) }}</div>
          </div>
          <div class="rounded-lg bg-surface-sunken border border-line p-2">
            <div class="text-xs text-ink-muted">Slobodno (disk)</div>
            <div class="font-mono font-semibold tabular-nums text-ink">{{ fmtGb(agent.monitoring.diskFreeGb) }}</div>
          </div>
          <div class="rounded-lg bg-surface-sunken border border-line p-2">
            <div class="text-xs text-ink-muted">Mreža</div>
            <div class="font-semibold text-ink">{{ agent.monitoring.networkConnected ? 'Povezan' : 'Nepovezan' }}</div>
          </div>
          <div class="rounded-lg bg-surface-sunken border border-line p-2">
            <div class="text-xs text-ink-muted">Antivirus</div>
            <div class="font-semibold text-ink">{{ agent.monitoring.antivirusStatus || '—' }}</div>
            <button
              v-if="agent.monitoring.antivirusStatus !== 'enabled' && isAdmin"
              :disabled="fixingPresetId === 'fix-antivirus-defender'"
              @click="sendFixJob('fix-antivirus-defender')"
              class="mt-1 text-xs text-accent hover:underline disabled:opacity-50"
            >
              <span v-if="fixingPresetId === 'fix-antivirus-defender'">Šalje se…</span>
              <span v-else class="inline-flex items-center gap-1"><NavIcon name="wrench" />Popravi</span>
            </button>
          </div>
          <div class="rounded-lg bg-surface-sunken border border-line p-2">
            <div class="text-xs text-ink-muted">Firewall</div>
            <div class="font-semibold text-ink">{{ agent.monitoring.firewallStatus || '—' }}</div>
            <button
              v-if="agent.monitoring.firewallStatus !== 'enabled' && isAdmin"
              :disabled="fixingPresetId === 'fix-firewall'"
              @click="sendFixJob('fix-firewall')"
              class="mt-1 text-xs text-accent hover:underline disabled:opacity-50"
            >
              <span v-if="fixingPresetId === 'fix-firewall'">Šalje se…</span>
              <span v-else class="inline-flex items-center gap-1"><NavIcon name="wrench" />Popravi</span>
            </button>
          </div>
          <div class="rounded-lg bg-surface-sunken border border-line p-2">
            <div class="text-xs text-ink-muted">BitLocker</div>
            <div class="font-semibold text-ink">{{ agent.monitoring.bitlockerStatus || '—' }}</div>
          </div>
          <div class="rounded-lg bg-surface-sunken border border-line p-2">
            <div class="text-xs text-ink-muted">Windows Update</div>
            <div class="font-semibold text-ink">{{ agent.windowsUpdateStatus || '—' }}</div>
            <button
              v-if="agent.windowsUpdateStatus && agent.windowsUpdateStatus !== 'Running' && isAdmin"
              :disabled="fixingPresetId === 'fix-windows-update-service'"
              @click="sendFixJob('fix-windows-update-service')"
              class="mt-1 text-xs text-accent hover:underline disabled:opacity-50"
            >
              <span v-if="fixingPresetId === 'fix-windows-update-service'">Šalje se…</span>
              <span v-else class="inline-flex items-center gap-1"><NavIcon name="wrench" />Popravi</span>
            </button>
          </div>
        </div>
        <div class="text-xs text-ink-muted mt-2">Prikupljeno: {{ fmtDate(agent.monitoring.collectedAt) }}</div>
      </div>

      <!-- Tabovi -->
      <div class="flex flex-nowrap gap-2 overflow-x-auto border-b border-line pb-3 no-scrollbar sm:flex-wrap sm:overflow-visible">
        <button
          v-for="t in TAB_NAMES"
          :key="t"
          type="button"
          @click="selectTab(t)"
          class="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition"
          :class="tabButtonClass(t)"
          style="font-family: var(--font-display)"
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
        <div class="rounded-xl border border-line bg-surface shadow-sm p-4 space-y-3">
          <div class="font-medium text-ink">Nova komanda</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-sm text-ink-secondary">Tip komande</label>
              <select v-model="jobForm.commandType" class="app-input w-full">
                <option v-for="c in COMMAND_TYPES" :key="c" :value="c">{{ COMMAND_LABELS[c] }}</option>
              </select>
            </div>
            <FormInput v-if="isServiceCommand" v-model.trim="jobForm.serviceName" label="Naziv servisa" placeholder="Spooler" />
          </div>
          <div v-if="jobForm.commandType === 'run_powershell_script'" class="space-y-2">
            <div>
              <label class="text-sm text-ink-secondary">Gotova skripta (opciono)</label>
              <select v-model="selectedPresetId" class="app-input w-full" @change="applyPreset">
                <option value="">— Prilagođena skripta —</option>
                <option v-for="p in POWERSHELL_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
              </select>
            </div>
            <div>
              <label class="text-sm text-ink-secondary">PowerShell skripta</label>
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
            <div class="font-medium text-ink">
              Istorija komandi
              <span v-if="jobsPolling" class="text-accent text-xs font-normal">· automatski se osvežava…</span>
            </div>
            <button v-if="jobs.length && isAdmin" @click="confirmClearJobs" class="text-bad hover:underline text-sm">
              Očisti logove
            </button>
          </div>
          <div v-if="jobsLoading" class="text-ink-secondary text-sm">Učitavanje…</div>
          <div v-else-if="!jobs.length" class="text-ink-muted text-sm">Nema poslatih komandi.</div>
          <div v-for="j in jobs" :key="j.id" class="rounded-lg border border-line bg-surface p-3 text-sm">
            <div class="flex items-start justify-between gap-3">
              <div class="font-medium text-ink">{{ COMMAND_LABELS[j.commandType] || j.commandType }}</div>
              <div class="flex items-center gap-2 shrink-0">
                <button
                  v-if="j.status === 'pending' || j.status === 'sent'"
                  :disabled="cancellingJobId === j.id"
                  @click="cancelJob(j)"
                  class="text-bad hover:underline text-xs whitespace-nowrap"
                >
                  {{ cancellingJobId === j.id ? 'Otkazujem…' : 'Otkaži' }}
                </button>
                <StatusPill :status="jobStatusTone(j.status)" :label="j.status" :dot="false" />
              </div>
            </div>
            <div class="text-xs text-ink-muted mt-1 font-mono">
              Kreirano: {{ fmtDate(j.createdAt) }}
              <span v-if="j.completedAt"> · Završeno: {{ fmtDate(j.completedAt) }}</span>
              <span v-if="j.exitCode !== null"> · Exit code: {{ j.exitCode }}</span>
              <span v-if="j.durationMs !== null"> · {{ j.durationMs }}ms</span>
            </div>
            <div v-if="j.output" class="relative mt-1">
              <button @click="copyToClipboard(j.output, 'Izlaz kopiran!')"
                class="absolute top-1 right-1 text-xs text-accent hover:underline" title="Kopiraj izlaz"><NavIcon name="copy" /></button>
              <div class="text-xs font-mono bg-surface-sunken rounded p-2 pr-7 whitespace-pre-wrap break-all">{{ j.output }}</div>
            </div>
            <div v-if="j.errorOutput" class="relative mt-1">
              <button @click="copyToClipboard(j.errorOutput, 'Izlaz greške kopiran!')"
                class="absolute top-1 right-1 text-xs text-accent hover:underline" title="Kopiraj izlaz greške"><NavIcon name="copy" /></button>
              <div class="text-xs font-mono bg-bad-subtle text-bad rounded p-2 pr-7 whitespace-pre-wrap break-all">{{ j.errorOutput }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Update log -->
      <div v-else-if="tab === 'updates'" class="space-y-3">
        <p class="text-xs text-ink-muted">
          Za instalaciju određene verzije na ovaj agent, koristi tab "Manager" - jedini put koji sad ostaje,
          radi bez obzira na to da li je NetdeskAgent servis dostupan.
        </p>

        <div v-if="updateLogLoading" class="text-ink-secondary text-sm">Učitavanje…</div>
        <div v-else-if="!updateLog.length" class="text-ink-muted text-sm">Nema pokušaja ažuriranja.</div>
        <div v-for="u in updateLog" :key="u.id" class="rounded-lg border border-line bg-surface p-3 text-sm">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="font-mono text-ink-secondary">{{ u.fromVersion || '—' }} → {{ u.toVersion || '—' }}</span>
              <StatusPill status="info" :label="u.channel === 'manager' ? 'Manager' : 'Agent'" :dot="false" />
            </div>
            <StatusPill :status="u.success ? 'good' : 'bad'" :label="u.success ? 'Uspešno' : 'Neuspešno'" />
          </div>
          <div v-if="u.reason" class="text-xs text-ink-secondary mt-1">{{ u.reason }}</div>
          <div class="text-xs text-ink-muted mt-1 font-mono">{{ fmtDate(u.reportedAt) }}</div>
        </div>
      </div>

      <!-- Netdesk Agent Manager - nezavisni kanal, radi i kad je NetdeskAgent ugašen -->
      <div v-else-if="tab === 'manager'" class="space-y-3">
        <div class="rounded-lg border border-info/30 bg-info-subtle p-3 space-y-2">
          <div class="text-sm font-medium text-info">Netdesk Agent Manager (nezavisni kanal)</div>
          <p class="text-xs text-ink-secondary">
            Radi nezavisno od NetdeskAgent servisa - dostupno čak i kad je on ugašen ili onemogućen.
          </p>

          <div v-if="managerStatusLoading" class="text-xs text-ink-secondary">Učitavanje…</div>
          <div v-else-if="!managerStatus" class="text-xs text-ink-secondary">
            Manager nije registrovan na ovoj mašini.
          </div>
          <template v-else>
            <div class="flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
              <StatusPill :status="connectivityTone(managerStatus.connectivityStatus)" :label="connectivityLabel(managerStatus.connectivityStatus)" />
              <span class="font-mono">Manager v{{ managerStatus.managerVersion || '—' }}</span>
              <span>
                NetdeskAgent: <strong class="text-ink">{{ managerStatus.netdeskAgentServiceStatus || 'Nepoznato' }}</strong>,
                startup: <strong class="text-ink">{{ managerStatus.netdeskAgentStartMode || 'Nepoznato' }}</strong>
              </span>
            </div>

            <div v-if="managerJobStatusText" class="text-xs text-info italic">
              {{ managerJobStatusText }}
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

            <div class="flex flex-col sm:flex-row sm:items-center gap-2">
              <span class="text-xs font-medium text-ink">Startup tip servisa:</span>
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
              <select v-model="selectedReleaseId" class="app-input w-full sm:w-64 text-sm">
                <option value="">— Izaberi verziju —</option>
                <option v-for="r in activeReleaseOptions" :key="r.id" :value="r.id">{{ r.version }}</option>
              </select>
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

        <div v-if="managerStatus" class="space-y-2">
          <div class="text-sm font-medium text-ink">Istorija Manager poslova</div>
          <div v-if="managerJobHistoryLoading" class="text-ink-secondary text-sm">Učitavanje…</div>
          <div v-else-if="!managerJobHistory.length" class="text-ink-muted text-sm">Nema poslova za ovaj Manager.</div>
          <div v-for="j in managerJobHistory" :key="j.id" class="rounded-lg border border-line bg-surface p-3 text-sm">
            <div class="flex items-center justify-between gap-2">
              <div class="text-ink">{{ MANAGER_COMMAND_LABELS[j.commandType] || j.commandType }}</div>
              <StatusPill :status="jobStatusTone(j.status)" :label="MANAGER_JOB_STATUS_LABELS[j.status] || j.status" :dot="false" />
            </div>
            <div v-if="j.errorOutput" class="text-xs text-ink-secondary mt-1">{{ j.errorOutput }}</div>
            <div class="text-xs text-ink-muted mt-1 font-mono">{{ fmtDate(j.completedAt || j.sentAt || j.createdAt) }}</div>
          </div>
        </div>
      </div>

      <!-- Event log -->
      <div v-else-if="tab === 'events'" class="space-y-2">
        <div v-if="!agent.ipEntryId" class="text-ink-muted text-sm">
          Računar još nije povezan (nema inventory sync-a).
        </div>
        <template v-else>
          <div v-if="eventLogsLoading" class="text-ink-secondary text-sm">Učitavanje…</div>
          <div v-else-if="!eventLogs.length" class="text-ink-muted text-sm">Nema event log unosa.</div>
          <div v-for="e in eventLogs" :key="e.id" class="rounded-lg border border-line bg-surface p-3 text-sm">
            <div class="flex items-center justify-between gap-2">
              <div class="font-medium text-ink">{{ e.source || '—' }} <span class="text-xs text-ink-muted">({{ e.log_name }})</span></div>
              <StatusPill :status="eventLevelTone(e.level)" :label="e.level || '—'" :dot="false" />
            </div>
            <div class="text-xs text-ink-secondary mt-1">{{ e.message || '—' }}</div>
            <div class="text-xs text-ink-muted mt-1 font-mono">Event ID: {{ e.event_id ?? '—' }} · {{ fmtDate(e.logged_at) }}</div>
          </div>
        </template>
      </div>

      <!-- DNS -->
      <div v-else-if="tab === 'dns'" class="space-y-2">
        <div v-if="!agent.ipEntryId" class="text-ink-muted text-sm">
          Računar još nije povezan (nema inventory sync-a).
        </div>
        <template v-else>
          <label class="inline-flex items-center gap-1.5 text-sm text-ink-secondary">
            <input type="checkbox" v-model="dnsBlacklistedOnly" @change="loadDnsLogs" />
            Samo domeni sa crne liste
          </label>

          <div v-if="dnsLogsLoading" class="text-ink-secondary text-sm">Učitavanje…</div>
          <div v-else-if="!dnsLogs.length" class="text-ink-muted text-sm">
            {{ dnsBlacklistedOnly ? 'Nema DNS upita ka domenima sa crne liste.' : 'Nema DNS upita.' }}
          </div>
          <div v-for="d in dnsLogs" :key="d.id"
            class="rounded-lg border bg-surface p-3 text-sm"
            :class="d.isBlacklisted ? 'border-bad/40 bg-bad-subtle' : 'border-line'">
            <div class="flex items-center justify-between gap-2">
              <div class="font-medium font-mono text-ink">
                {{ d.domain }}
                <span v-if="d.isBlacklisted" class="ml-1 inline-flex text-bad" title="Domen je na crnoj listi"><NavIcon name="ban" /></span>
              </div>
              <span class="text-xs font-mono text-ink-muted tabular-nums shrink-0">{{ d.queryCount }}×</span>
            </div>
            <div class="text-xs text-ink-muted mt-1 font-mono">
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
import {
  agentStatusTone,
  agentStatusLabel,
  connectivityTone,
  connectivityLabel,
  jobStatusTone,
  eventLevelTone,
} from '@/utils/statusTones.js'
import FormInput from '@/components/FormInput.vue'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import GroupSelect from '@/components/GroupSelect.vue'
import NavIcon from '@/components/NavIcon.vue'
import VncViewer from '@/components/VncViewer.vue'
import StatusPill from '@/components/StatusPill.vue'
import TagChip from '@/components/TagChip.vue'

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

const TAB_NAMES = ['screen', 'jobs', 'updates', 'manager', 'events', 'dns']
const TAB_LABELS = { screen: 'Ekran', jobs: 'Komande', updates: 'Update log', manager: 'Manager', events: 'Event Log', dns: 'DNS' }

// "manager" tab koristi "info" ton (isti kao Manager bedž/panel) umesto
// generičkog akcenta - vizuelna veza sa panelom koji taj tab otvara. Drži
// se u istom skupu od 4 semantičke boje umesto posebne indigo palete.
function tabButtonClass(t) {
  if (t === 'manager') {
    return tab.value === t ? 'bg-info text-white' : 'bg-info-subtle text-info hover:brightness-95'
  }
  return tab.value === t ? 'bg-accent text-white' : 'bg-surface-sunken text-ink-secondary hover:bg-line'
}

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

const managerStatus = ref(null)
const managerStatusLoading = ref(false)
const sendingManagerAction = ref(false)
const installingViaManager = ref(false)
const selectedStartMode = ref('Automatic')
const managerJobHistory = ref([])
const managerJobHistoryLoading = ref(false)
const managerJobHistoryLoaded = ref(false)

const MANAGER_COMMAND_LABELS = {
  start_service: 'Pokreni servis',
  stop_service: 'Zaustavi servis',
  restart_service: 'Restartuj servis',
  set_service_start_mode: 'Promena startup tipa',
  install_update: 'Instalacija update-a',
}

const MANAGER_JOB_STATUS_LABELS = {
  pending: 'Na čekanju',
  sent: 'Poslato Manager-u',
  completed: 'Uspešno',
  failed: 'Neuspešno',
  cancelled: 'Otkazano',
}

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
    showToast(err.message || 'Greška pri dodavanju deployment grupe', { kind: 'error', duration: 3000 })
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
    showToast(err.message || 'Greška pri uklanjanju deployment grupe', { kind: 'error', duration: 3000 })
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
    showToast('Greška pri čuvanju whitelist-e', { kind: 'error', duration: 3000 })
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
    showToast('Greška pri povlačenju agenta', { kind: 'error', duration: 3000 })
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
    showToast(err?.message || 'Greška pri brisanju agenta', { kind: 'error', duration: 3000 })
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
    showToast(err?.message || 'Greška pri otkazivanju komande', { kind: 'error', duration: 3000 })
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
    showToast('Greška pri čišćenju logova', { kind: 'error', duration: 3000 })
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
    showToast(err?.message || 'Greška pri slanju komande za popravku', { kind: 'error', duration: 3000 })
  } finally {
    fixingPresetId.value = ''
  }
}

async function createJob() {
  const payload = {}
  if (isServiceCommand.value) {
    if (!jobForm.value.serviceName.trim()) {
      showToast('Naziv servisa je obavezan', { kind: 'error', duration: 3000 })
      return
    }
    payload.serviceName = jobForm.value.serviceName.trim()
  }
  if (jobForm.value.commandType === 'run_powershell_script') {
    if (!jobForm.value.script.trim()) {
      showToast('Skripta je obavezna', { kind: 'error', duration: 3000 })
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
    showToast(err?.message || 'Greška pri slanju komande', { kind: 'error', duration: 3000 })
  } finally {
    creatingJob.value = false
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

// Trajna istorija SVIH Manager poslova (ne samo poslednjeg poslatog) - bez
// ovoga, ishod komande (posebno install_update) je bio vidljiv SAMO u
// trenutku dispečovanja (jednokratan toast u reportManagerJobOutcome), i
// zauvek nestaje čim se izađe sa stranice ili se posao završi dok niko ne
// gleda - uživo potvrđeno kao pravi problem (manager_jobs ima stvarne
// install_update redove, uključujući neuspehe, koje niko nikad nije video u
// UI-u).
async function loadManagerJobHistory() {
  if (!managerStatus.value?.managerId) {
    managerJobHistory.value = []
    return
  }
  managerJobHistoryLoading.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/managers/${managerStatus.value.managerId}/jobs?limit=20`)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    managerJobHistory.value = data.items || []
    managerJobHistoryLoaded.value = true
  } catch (err) {
    console.error('Neuspešno dohvatanje istorije Manager poslova', err)
  } finally {
    managerJobHistoryLoading.value = false
  }
}

// Manager svoj job-poll ciklus radi na sopstvenom tajmeru (podrazumevano
// do 30s, JobsPollIntervalSeconds u config.json), plus stvarno vreme
// izvršavanja - poll ovde traje dovoljno dugo (do ~60s) da pokrije taj
// realan najgori slučaj pre nego što odustane i prizna da ne zna ishod.
const MANAGER_JOB_POLL_INTERVAL_MS = 3000
const MANAGER_JOB_POLL_MAX_ATTEMPTS = 20
const managerJobStatusText = ref('')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Vraća ceo job red kad pređe u završno stanje (completed/failed/cancelled),
// ili null ako Manager ne potvrdi izvršenje u očekivanom roku (i dalje
// pending/sent - npr. Manager trenutno offline). Bez ovoga, dugmad su samo
// javljala da je komanda POSLATA, ne da li je STVARNO uspela.
async function waitForManagerJobResult(managerId, jobId, maxAttempts = MANAGER_JOB_POLL_MAX_ATTEMPTS) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(MANAGER_JOB_POLL_INTERVAL_MS)
    try {
      const res = await fetchWithAuth(`/api/protected/managers/${managerId}/jobs?limit=20`)
      if (!res.ok) continue
      const data = await res.json()
      const job = (data.items || []).find((j) => j.id === jobId)
      if (job && ['completed', 'failed', 'cancelled'].includes(job.status)) {
        return job
      }
    } catch {
      // Best-effort - probaj ponovo sledeći ciklus umesto da odmah odustaneš.
    }
  }
  return null
}

async function reportManagerJobOutcome(job) {
  if (!job) {
    showToast('Manager nije potvrdio izvršenje u očekivanom roku - proveri da li je online.', {
      kind: 'warning',
      duration: 4000,
    })
  } else if (job.status === 'completed') {
    showToast('Komanda uspešno izvršena.')
  } else {
    showToast(job.errorOutput || 'Komanda nije uspela.', { kind: 'error', duration: 4000 })
  }
  await loadManagerStatus()
  await loadManagerJobHistory()
}

async function sendManagerServiceAction(commandType) {
  if (!managerStatus.value?.managerId) return
  sendingManagerAction.value = true
  managerJobStatusText.value = 'Šaljem komandu…'
  try {
    const res = await fetchWithAuth(`/api/protected/managers/${managerStatus.value.managerId}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandType, payload: {} }),
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri slanju komande'))
    const job = await res.json()
    managerJobStatusText.value = 'Čekam da Manager izvrši komandu…'
    const result = await waitForManagerJobResult(managerStatus.value.managerId, job.id)
    await reportManagerJobOutcome(result)
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri slanju komande', { kind: 'error', duration: 3000 })
  } finally {
    sendingManagerAction.value = false
    managerJobStatusText.value = ''
  }
}

async function setManagerStartMode() {
  if (!managerStatus.value?.managerId) return
  sendingManagerAction.value = true
  managerJobStatusText.value = 'Šaljem komandu…'
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
    const job = await res.json()
    managerJobStatusText.value = 'Čekam da Manager izvrši komandu…'
    const result = await waitForManagerJobResult(managerStatus.value.managerId, job.id)
    await reportManagerJobOutcome(result)
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri slanju komande', { kind: 'error', duration: 3000 })
  } finally {
    sendingManagerAction.value = false
    managerJobStatusText.value = ''
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
  managerJobStatusText.value = 'Šaljem komandu…'
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
    const job = await res.json()
    // Duži rok od servisnih akcija - preuzimanje+raspakivanje paketa realno
    // može trajati duže od jednostavnog start/stop/restart poziva.
    managerJobStatusText.value = 'Čekam da Manager preuzme i instalira paket…'
    const result = await waitForManagerJobResult(managerStatus.value.managerId, job.id, 40)
    await reportManagerJobOutcome(result)
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri slanju komande', { kind: 'error', duration: 3000 })
  } finally {
    installingViaManager.value = false
    managerJobStatusText.value = ''
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
    else if (name === 'manager' && !managerJobHistoryLoaded.value) loadManagerJobHistory()
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
