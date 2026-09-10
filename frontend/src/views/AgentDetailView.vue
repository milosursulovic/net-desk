<template>
  <div class="agent-hud w-full max-w-4xl mx-auto">
    <div class="hud-scanlines" aria-hidden="true"></div>
    <div class="hud-shell space-y-4">
    <div class="flex items-center justify-between gap-3 hud-header">
      <div class="min-w-0">
        <div class="hud-eyebrow">
          <span class="hud-live-dot" aria-hidden="true"></span>
          UPLINK // AGENT TERMINAL
          <span class="hud-cursor" aria-hidden="true">_</span>
        </div>
        <h1 class="text-2xl font-bold text-ink truncate hud-glow-text" style="font-family: var(--font-display)">
          {{ agent?.hostname || agent?.agentUid || 'Agent' }}
        </h1>
        <p v-if="agent?.department" class="mt-0.5 text-sm text-ink-muted">{{ agent.department }}</p>
      </div>
      <AppButton variant="neutral" @click="goBack">{{ t('agentDetail.back') }}</AppButton>
    </div>

    <div v-if="loading" class="text-ink-secondary">{{ t('agentDetail.loading') }}</div>
    <div v-else-if="loadError" class="text-bad">{{ loadError }}</div>

    <div v-else-if="agent" class="space-y-4">
      <!-- Info kartica -->
      <div class="hud-panel rounded-xl border border-line bg-surface shadow-sm p-4 space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <StatusPill :status="agentStatusTone(agent.status)" :label="agentStatusLabel(agent.status, t)" />
          <StatusPill :status="connectivityTone(agent.connectivityStatus)" :label="connectivityLabel(agent.connectivityStatus, t)" />
          <StatusPill
            v-if="managerStatus"
            status="info"
            label="MANAGER"
            :title="t('agentDetail.managerChannelBadgeTitle', { status: managerStatus.connectivityStatus })"
          />
          <span class="font-mono text-xs text-ink-muted">{{ agent.agentUid }}</span>
          <button @click="copy(agent.agentUid)" class="text-xs text-ink-muted hover:text-ink"><NavIcon name="copy" /></button>

          <button v-if="agent.status === 'active' && isAdmin" @click="confirmRevoke" class="ml-auto inline-flex items-center gap-1.5 text-bad hover:underline text-sm">
            <NavIcon name="ban" />
            {{ t('agentDetail.revokeAccess') }}
          </button>
          <button v-if="agent.status === 'revoked' && isAdmin" @click="confirmDelete" class="ml-auto inline-flex items-center gap-1.5 text-bad hover:underline text-sm">
            <NavIcon name="trash" />
            {{ t('agentDetail.deleteAgent') }}
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-ink-secondary">
          <div><span class="font-medium text-ink">{{ t('agentDetail.osLabel') }}</span> {{ agent.osCaption || '—' }} {{ agent.osVersion || '' }}</div>
          <div><span class="font-medium text-ink">{{ t('agentDetail.agentVersionLabel') }}</span> <span class="font-mono">{{ agent.agentVersion || '—' }}</span></div>
          <div><span class="font-medium text-ink">{{ t('agentDetail.lastHeartbeatLabel') }}</span> {{ fmtRelative(agent.lastHeartbeatAt, locale) }}</div>
          <div><span class="font-medium text-ink">{{ t('agentDetail.lastIpLabel') }}</span> <span class="font-mono">{{ agent.lastIp || '—' }}</span></div>
          <div><span class="font-medium text-ink">{{ t('agentDetail.enrollLabel') }}</span> <span class="font-mono">{{ fmtDate(agent.enrolledAt) }}</span></div>
          <div>
            <span class="font-medium text-ink">{{ t('agentDetail.connectedComputerLabel') }}</span>
            <template v-if="agent.ipEntryId">
              <RouterLink :to="`/ip/${agent.ipEntryId}/meta`" class="text-accent hover:underline">
                {{ t('agentDetail.open') }}
              </RouterLink>
              <RouterLink
                v-if="agent.computerIp && agent.site"
                :to="{ path: '/', query: { search: agent.computerIp, site: agent.site } }"
                class="ml-2 text-accent hover:underline"
              >
                {{ t('agentDetail.goHome') }}
              </RouterLink>
            </template>
            <span v-else>—</span>
          </div>
        </div>

        <div v-if="agent.description" class="rounded-lg bg-surface-sunken px-3 py-2">
          <div class="text-xs text-ink-muted mb-1">{{ t('pdsu.colDescription') }}</div>
          <p class="text-sm text-ink whitespace-pre-wrap wrap-break-word">{{ agent.description }}</p>
        </div>

        <div class="flex flex-col gap-2 pt-2 border-t border-line">
          <label class="text-sm font-medium text-ink">{{ t('agentDetail.deploymentGroupsLabel') }}</label>
          <div class="flex flex-wrap items-center gap-1.5">
            <TagChip
              v-for="g in agent.deploymentGroups"
              :key="g"
              :label="g"
              variant="accent"
              :removable="isAdmin"
              @remove="removeDeploymentGroup(g)"
            />
            <span v-if="!agent.deploymentGroups?.length" class="text-sm text-ink-muted">{{ t('agentDetail.restDefault') }}</span>
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
            {{ t('agentDetail.processKillExemptLabel') }}
          </label>
        </div>
        <p class="text-xs text-ink-muted -mt-2">
          {{ t('agentDetail.processKillExemptHint') }}
        </p>
      </div>

      <!-- Monitoring -->
      <div v-if="agent.monitoring" class="hud-panel rounded-xl border border-line bg-surface shadow-sm p-4">
        <div class="font-medium text-ink mb-2 hud-section-title">Monitoring</div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div class="hud-tile hud-gauge-tile rounded-lg bg-surface-sunken border border-line p-2">
            <div class="text-xs text-ink-muted mb-1">CPU</div>
            <div class="hud-gauge" :style="{ '--gauge-deg': gaugeDeg(agent.monitoring.cpuLoadPct), '--gauge-color': gaugeColor(agent.monitoring.cpuLoadPct) }">
              <span class="hud-gauge-value">{{ fmtPct(agent.monitoring.cpuLoadPct) }}</span>
            </div>
          </div>
          <div class="hud-tile hud-gauge-tile rounded-lg bg-surface-sunken border border-line p-2">
            <div class="text-xs text-ink-muted mb-1">RAM</div>
            <div class="hud-gauge" :style="{ '--gauge-deg': gaugeDeg(agent.monitoring.ramLoadPct), '--gauge-color': gaugeColor(agent.monitoring.ramLoadPct) }">
              <span class="hud-gauge-value">{{ fmtPct(agent.monitoring.ramLoadPct) }}</span>
            </div>
          </div>
          <div class="hud-tile hud-gauge-tile rounded-lg bg-surface-sunken border border-line p-2">
            <div class="text-xs text-ink-muted mb-1">Disk</div>
            <div class="hud-gauge" :style="{ '--gauge-deg': gaugeDeg(agent.monitoring.diskUsedPct), '--gauge-color': gaugeColor(agent.monitoring.diskUsedPct) }">
              <span class="hud-gauge-value">{{ fmtPct(agent.monitoring.diskUsedPct) }}</span>
            </div>
          </div>
          <div class="hud-tile rounded-lg bg-surface-sunken border border-line p-2">
            <div class="text-xs text-ink-muted">{{ t('agentDetail.freeDisk') }}</div>
            <div class="hud-metric font-mono font-semibold tabular-nums text-ink">{{ fmtGb(agent.monitoring.diskFreeGb) }}</div>
          </div>
          <div class="hud-tile rounded-lg bg-surface-sunken border border-line p-2">
            <div class="text-xs text-ink-muted">{{ t('agentDetail.network') }}</div>
            <div class="font-semibold text-ink">{{ agent.monitoring.networkConnected ? t('agentDetail.networkConnected') : t('agentDetail.networkDisconnected') }}</div>
          </div>
          <div class="hud-tile rounded-lg bg-surface-sunken border border-line p-2">
            <div class="text-xs text-ink-muted">Antivirus</div>
            <div class="font-semibold text-ink">{{ agent.monitoring.antivirusStatus || '—' }}</div>
            <button
              v-if="agent.monitoring.antivirusStatus !== 'enabled' && isAdmin"
              :disabled="fixingPresetId === 'fix-antivirus-defender'"
              @click="sendFixJob('fix-antivirus-defender')"
              class="mt-1 text-xs text-accent hover:underline disabled:opacity-50"
            >
              <span v-if="fixingPresetId === 'fix-antivirus-defender'">{{ t('agentDetail.sending') }}</span>
              <span v-else class="inline-flex items-center gap-1"><NavIcon name="wrench" />{{ t('agentDetail.fix') }}</span>
            </button>
          </div>
          <div class="hud-tile rounded-lg bg-surface-sunken border border-line p-2">
            <div class="text-xs text-ink-muted">Firewall</div>
            <div class="font-semibold text-ink">{{ agent.monitoring.firewallStatus || '—' }}</div>
            <button
              v-if="agent.monitoring.firewallStatus !== 'enabled' && isAdmin"
              :disabled="fixingPresetId === 'fix-firewall'"
              @click="sendFixJob('fix-firewall')"
              class="mt-1 text-xs text-accent hover:underline disabled:opacity-50"
            >
              <span v-if="fixingPresetId === 'fix-firewall'">{{ t('agentDetail.sending') }}</span>
              <span v-else class="inline-flex items-center gap-1"><NavIcon name="wrench" />{{ t('agentDetail.fix') }}</span>
            </button>
          </div>
          <div class="hud-tile rounded-lg bg-surface-sunken border border-line p-2">
            <div class="text-xs text-ink-muted">BitLocker</div>
            <div class="font-semibold text-ink">{{ agent.monitoring.bitlockerStatus || '—' }}</div>
          </div>
          <div class="hud-tile rounded-lg bg-surface-sunken border border-line p-2">
            <div class="text-xs text-ink-muted">Windows Update</div>
            <div class="font-semibold text-ink">{{ agent.windowsUpdateStatus || '—' }}</div>
            <button
              v-if="agent.windowsUpdateStatus && agent.windowsUpdateStatus !== 'Running' && isAdmin"
              :disabled="fixingPresetId === 'fix-windows-update-service'"
              @click="sendFixJob('fix-windows-update-service')"
              class="mt-1 text-xs text-accent hover:underline disabled:opacity-50"
            >
              <span v-if="fixingPresetId === 'fix-windows-update-service'">{{ t('agentDetail.sending') }}</span>
              <span v-else class="inline-flex items-center gap-1"><NavIcon name="wrench" />{{ t('agentDetail.fix') }}</span>
            </button>
          </div>
        </div>
        <div class="text-xs text-ink-muted mt-2">{{ t('agentDetail.collectedAtLabel') }} {{ fmtDate(agent.monitoring.collectedAt) }}</div>
      </div>

      <!-- Tabovi -->
      <div class="hud-tabs flex flex-nowrap gap-2 overflow-x-auto border-b border-line pb-3 no-scrollbar sm:flex-wrap sm:overflow-visible">
        <button
          v-for="tabName in TAB_NAMES"
          :key="tabName"
          type="button"
          @click="selectTab(tabName)"
          class="hud-tab shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition"
          :class="tabButtonClass(tabName)"
          style="font-family: var(--font-display)"
        >
          {{ TAB_LABELS[tabName] }}
        </button>
      </div>

      <!-- Ekran -->
      <div v-if="tab === 'screen'" class="space-y-4">
        <VncViewer :agent-id="route.params.id" />
      </div>

      <!-- Komande -->
      <div v-else-if="tab === 'jobs'" class="space-y-4">
        <div class="hud-panel rounded-xl border border-line bg-surface shadow-sm p-4 space-y-3">
          <div class="font-medium text-ink hud-section-title">{{ t('agentDetail.newCommand') }}</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-sm text-ink-secondary">{{ t('agentDetail.commandTypeLabel') }}</label>
              <select v-model="jobForm.commandType" class="app-input w-full">
                <option v-for="c in COMMAND_TYPES" :key="c" :value="c">{{ commandLabel(c, t) }}</option>
              </select>
            </div>
            <FormInput v-if="isServiceCommand" v-model.trim="jobForm.serviceName" :label="t('agentDetail.serviceNameLabel')" placeholder="Spooler" />
          </div>
          <div v-if="jobForm.commandType === 'run_powershell_script'" class="space-y-2">
            <div>
              <label class="text-sm text-ink-secondary">{{ t('agentDetail.presetScriptLabel') }}</label>
              <select v-model="selectedPresetId" class="app-input w-full" @change="applyPreset">
                <option value="">{{ t('agentDetail.customScriptOption') }}</option>
                <option v-for="p in POWERSHELL_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
              </select>
            </div>
            <div>
              <label class="text-sm text-ink-secondary">{{ t('agentDetail.psScriptLabel') }}</label>
              <textarea v-model="jobForm.script" rows="6" class="app-input w-full font-mono text-xs" placeholder="Get-Service | Where-Object ..."></textarea>
            </div>
          </div>
          <div class="flex justify-end">
            <AppButton variant="success" :disabled="creatingJob" @click="createJob">
              {{ creatingJob ? t('agentDetail.sendingCommand') : t('agentDetail.sendCommand') }}
            </AppButton>
          </div>
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <div class="font-medium text-ink">
              {{ t('agentDetail.commandHistory') }}
              <span v-if="jobsPolling" class="text-accent text-xs font-normal">{{ t('agentDetail.autoRefreshing') }}</span>
            </div>
            <button v-if="jobs.length && isAdmin" @click="confirmClearJobs" class="text-bad hover:underline text-sm">
              {{ t('agentDetail.clearLogs') }}
            </button>
          </div>
          <div v-if="jobsLoading" class="text-ink-secondary text-sm">{{ t('agentDetail.loading') }}</div>
          <div v-else-if="!jobs.length" class="text-ink-muted text-sm">{{ t('agentDetail.noCommandsSent') }}</div>
          <div v-for="j in jobs" :key="j.id" class="hud-row rounded-lg border border-line bg-surface p-3 text-sm">
            <div class="flex items-start justify-between gap-3">
              <div class="font-medium text-ink">{{ commandLabel(j.commandType, t) }}</div>
              <div class="flex items-center gap-2 shrink-0">
                <button
                  v-if="j.status === 'pending' || j.status === 'sent'"
                  :disabled="cancellingJobId === j.id"
                  @click="cancelJob(j)"
                  class="text-bad hover:underline text-xs whitespace-nowrap"
                >
                  {{ cancellingJobId === j.id ? t('agentDetail.cancelling') : t('common.cancel') }}
                </button>
                <StatusPill :status="jobStatusTone(j.status)" :label="j.status" :dot="false" />
              </div>
            </div>
            <div class="text-xs text-ink-muted mt-1 font-mono">
              {{ t('agentDetail.createdLabel') }} {{ fmtDate(j.createdAt) }}
              <span v-if="j.completedAt"> · {{ t('agentDetail.completedLabel') }} {{ fmtDate(j.completedAt) }}</span>
              <span v-if="j.exitCode !== null"> · Exit code: {{ j.exitCode }}</span>
              <span v-if="j.durationMs !== null"> · {{ j.durationMs }}ms</span>
            </div>
            <div v-if="j.output" class="relative mt-1">
              <button @click="copyToClipboard(j.output, t('agentDetail.outputCopied'))"
                class="absolute top-1 right-1 text-xs text-accent hover:underline" :title="t('agentDetail.copyOutput')"><NavIcon name="copy" /></button>
              <div class="text-xs font-mono bg-surface-sunken rounded p-2 pr-7 whitespace-pre-wrap break-all">{{ j.output }}</div>
            </div>
            <div v-if="j.errorOutput" class="relative mt-1">
              <button @click="copyToClipboard(j.errorOutput, t('agentDetail.errorOutputCopied'))"
                class="absolute top-1 right-1 text-xs text-accent hover:underline" :title="t('agentDetail.copyErrorOutput')"><NavIcon name="copy" /></button>
              <div class="text-xs font-mono bg-bad-subtle text-bad rounded p-2 pr-7 whitespace-pre-wrap break-all">{{ j.errorOutput }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Update log -->
      <div v-else-if="tab === 'updates'" class="space-y-3">
        <p class="text-xs text-ink-muted">
          {{ t('agentDetail.updatesTabHint') }}
        </p>

        <div v-if="updateLogLoading" class="text-ink-secondary text-sm">{{ t('agentDetail.loading') }}</div>
        <div v-else-if="!updateLog.length" class="text-ink-muted text-sm">{{ t('agentDetail.noUpdateAttempts') }}</div>
        <div v-for="u in updateLog" :key="u.id" class="hud-row rounded-lg border border-line bg-surface p-3 text-sm">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="font-mono text-ink-secondary">{{ u.fromVersion || '—' }} → {{ u.toVersion || '—' }}</span>
              <StatusPill status="info" :label="u.channel === 'manager' ? 'Manager' : 'Agent'" :dot="false" />
            </div>
            <StatusPill :status="u.success ? 'good' : 'bad'" :label="u.success ? t('agentDetail.success') : t('agentDetail.failure')" />
          </div>
          <div v-if="u.reason" class="text-xs text-ink-secondary mt-1">{{ u.reason }}</div>
          <div class="text-xs text-ink-muted mt-1 font-mono">{{ fmtDate(u.reportedAt) }}</div>
        </div>
      </div>

      <!-- Netdesk Agent Manager - nezavisni kanal, radi i kad je NetdeskAgent ugašen -->
      <div v-else-if="tab === 'manager'" class="space-y-3">
        <div class="hud-panel rounded-lg border border-info/30 bg-info-subtle p-3 space-y-2">
          <div class="text-sm font-medium text-info">{{ t('agentDetail.managerChannelTitle') }}</div>
          <p class="text-xs text-ink-secondary">
            {{ t('agentDetail.managerChannelHint') }}
          </p>

          <div v-if="managerStatusLoading" class="text-xs text-ink-secondary">{{ t('agentDetail.loading') }}</div>
          <div v-else-if="!managerStatus" class="text-xs text-ink-secondary">
            {{ t('agentDetail.managerNotRegistered') }}
          </div>
          <template v-else>
            <div class="flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
              <StatusPill :status="connectivityTone(managerStatus.connectivityStatus)" :label="connectivityLabel(managerStatus.connectivityStatus, t)" />
              <span class="font-mono">Manager v{{ managerStatus.managerVersion || '—' }}</span>
              <span>
                {{ t('agentDetail.netdeskAgentStatusLabel') }} <strong class="text-ink">{{ managerStatus.netdeskAgentServiceStatus || t('pdsu.stateUnknown') }}</strong>,
                {{ t('agentDetail.startupLabel') }} <strong class="text-ink">{{ managerStatus.netdeskAgentStartMode || t('pdsu.stateUnknown') }}</strong>
              </span>
            </div>

            <div v-if="managerJobStatusText" class="text-xs text-info italic">
              {{ managerJobStatusText }}
            </div>

            <div class="flex flex-wrap gap-2">
              <AppButton variant="neutral" :disabled="sendingManagerAction" @click="sendManagerServiceAction('start_service')">
                {{ t('agentDetail.start') }}
              </AppButton>
              <AppButton variant="neutral" :disabled="sendingManagerAction" @click="sendManagerServiceAction('stop_service')">
                {{ t('agentDetail.stop') }}
              </AppButton>
              <AppButton variant="neutral" :disabled="sendingManagerAction" @click="sendManagerServiceAction('restart_service')">
                {{ t('agentDetail.restart') }}
              </AppButton>
            </div>

            <div class="flex flex-col sm:flex-row sm:items-center gap-2">
              <span class="text-xs font-medium text-ink">{{ t('agentDetail.startupTypeLabel') }}</span>
              <select v-model="selectedStartMode" class="app-input w-full sm:w-40 text-sm">
                <option value="Automatic">Automatic</option>
                <option value="Manual">Manual</option>
                <option value="Disabled">Disabled</option>
              </select>
              <AppButton variant="neutral" :disabled="sendingManagerAction" @click="setManagerStartMode">
                {{ t('agentDetail.setStartupType') }}
              </AppButton>
            </div>

            <div class="flex flex-col sm:flex-row gap-2">
              <select v-model="selectedReleaseId" class="app-input w-full sm:w-64 text-sm">
                <option value="">{{ t('agentDetail.selectVersionOption') }}</option>
                <option v-for="r in activeReleaseOptions" :key="r.id" :value="r.id">{{ r.version }}</option>
              </select>
              <AppButton
                variant="neutral"
                :disabled="!selectedReleaseId || installingViaManager"
                @click="installViaManager"
              >
                {{ installingViaManager ? t('agentDetail.sendingCommand') : t('agentDetail.installViaManagerLabel') }}
              </AppButton>
            </div>
          </template>
        </div>

        <div v-if="managerStatus" class="space-y-2">
          <div class="text-sm font-medium text-ink">{{ t('agentDetail.managerJobHistoryTitle') }}</div>
          <div v-if="managerJobHistoryLoading" class="text-ink-secondary text-sm">{{ t('agentDetail.loading') }}</div>
          <div v-else-if="!managerJobHistory.length" class="text-ink-muted text-sm">{{ t('agentDetail.noManagerJobs') }}</div>
          <div v-for="j in managerJobHistory" :key="j.id" class="hud-row rounded-lg border border-line bg-surface p-3 text-sm">
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
          {{ t('agentDetail.computerNotConnected') }}
        </div>
        <template v-else>
          <div v-if="eventLogsLoading" class="text-ink-secondary text-sm">{{ t('agentDetail.loading') }}</div>
          <div v-else-if="!eventLogs.length" class="text-ink-muted text-sm">{{ t('agentDetail.noEventLogEntries') }}</div>
          <div v-for="e in eventLogs" :key="e.id" class="hud-row rounded-lg border border-line bg-surface p-3 text-sm">
            <div class="flex items-center justify-between gap-2">
              <div class="font-medium text-ink">{{ e.source || '—' }} <span class="text-xs text-ink-muted">({{ e.log_name }})</span></div>
              <StatusPill :status="eventLevelTone(e.level)" :label="e.level || '—'" :dot="false" />
            </div>
            <div class="text-xs text-ink-secondary mt-1">{{ e.message || '—' }}</div>
            <div class="text-xs text-ink-muted mt-1 font-mono">{{ t('agentDetail.eventIdLabel') }} {{ e.event_id ?? '—' }} · {{ fmtDate(e.logged_at) }}</div>
          </div>
        </template>
      </div>

      <!-- DNS -->
      <div v-else-if="tab === 'dns'" class="space-y-2">
        <div v-if="!agent.ipEntryId" class="text-ink-muted text-sm">
          {{ t('agentDetail.computerNotConnected') }}
        </div>
        <template v-else>
          <label class="inline-flex items-center gap-1.5 text-sm text-ink-secondary">
            <input type="checkbox" v-model="dnsBlacklistedOnly" @change="loadDnsLogs" />
            {{ t('agentDetail.blacklistedOnly') }}
          </label>

          <div v-if="dnsLogsLoading" class="text-ink-secondary text-sm">{{ t('agentDetail.loading') }}</div>
          <div v-else-if="!dnsLogs.length" class="text-ink-muted text-sm">
            {{ dnsBlacklistedOnly ? t('agentDetail.noBlacklistedDnsQueries') : t('agentDetail.noDnsQueries') }}
          </div>
          <div v-for="d in dnsLogs" :key="d.id"
            class="hud-row rounded-lg border bg-surface p-3 text-sm"
            :class="d.isBlacklisted ? 'border-bad/40 bg-bad-subtle' : 'border-line'">
            <div class="flex items-center justify-between gap-2">
              <div class="font-medium font-mono text-ink">
                {{ d.domain }}
                <span v-if="d.isBlacklisted" class="ml-1 inline-flex text-bad" :title="t('agentDetail.domainBlacklisted')"><NavIcon name="ban" /></span>
              </div>
              <span class="text-xs font-mono text-ink-muted tabular-nums shrink-0">{{ d.queryCount }}×</span>
            </div>
            <div class="text-xs text-ink-muted mt-1 font-mono">
              {{ t('agentDetail.firstSeenLabel') }} {{ fmtDate(d.firstSeen) }} · {{ t('agentDetail.lastSeenLabel') }} {{ fmtDate(d.lastSeen) }}
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { fmtDate as formatDate, fmtRelative } from '@/utils/format.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import { useToast } from '@/composables/useToast.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import { POWERSHELL_PRESETS } from '@/constants/powershellPresets.js'
import { COMMAND_TYPES, commandLabel, SERVICE_COMMANDS } from '@/constants/agentCommands.js'
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

const { t, locale } = useI18n()

const fmtDate = (d) => formatDate(d, locale.value === 'en' ? 'en-US' : 'sr-RS')
const fmtPct = (v) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(1)}%`)
const fmtGb = (v) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(1)} GB`)

// HUD monitoring prstenovi (CPU/RAM/Disk) - conic-gradient krug čiji je
// popunjen luk procenat opterećenja, boja po pragu (isti prag kao StatusPill
// bi koristio za "upozorenje"), samo vizuelno - ništa se ne šalje/menja.
function gaugeDeg(pct) {
  const v = Math.max(0, Math.min(100, Number(pct) || 0))
  return `${v * 3.6}deg`
}
function gaugeColor(pct) {
  const v = Number(pct) || 0
  if (v >= 90) return 'var(--status-bad)'
  if (v >= 70) return 'var(--status-warn)'
  return 'var(--status-good)'
}

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
const TAB_LABELS = computed(() => ({
  screen: t('agentDetail.tabScreen'),
  jobs: t('agentDetail.tabJobs'),
  updates: t('agentDetail.tabUpdates'),
  manager: 'Manager',
  events: 'Event Log',
  dns: 'DNS',
}))

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

const MANAGER_COMMAND_LABELS = computed(() => ({
  start_service: t('agentDetail.managerCommandStart'),
  stop_service: t('agentDetail.managerCommandStop'),
  restart_service: t('agentDetail.managerCommandRestart'),
  set_service_start_mode: t('agentDetail.managerCommandSetStartMode'),
  install_update: t('agentDetail.managerCommandInstallUpdate'),
}))

const MANAGER_JOB_STATUS_LABELS = computed(() => ({
  pending: t('agentDetail.managerJobPending'),
  sent: t('agentDetail.managerJobSent'),
  completed: t('agentDetail.managerJobCompleted'),
  failed: t('agentDetail.managerJobFailed'),
  cancelled: t('agentDetail.managerJobCancelled'),
}))

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
  await copyToClipboard(text, t('agentDetail.agentIdCopied'))
}

async function loadAgent() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetchWithAuth(`/api/protected/agents/${route.params.id}`)
    if (!res.ok) {
      loadError.value = await parseError(res, t('agentDetail.loadErrorFallback'))
      return
    }
    agent.value = await res.json()
    // Boolean(...) namerno - backend vraća mysql2-ovu sirovu TINYINT(1)
    // vrednost (0/1) za ovo polje, ne pravi JSON boolean.
    processKillExemptInput.value = Boolean(agent.value.processKillExempt)
  } catch (err) {
    console.error(err)
    loadError.value = t('agentDetail.loadFailed')
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
    if (!res.ok) throw new Error(await parseError(res, t('agentDetail.errorAddDeploymentGroup')))
    agent.value = await res.json()
  } catch (err) {
    console.error(err)
    showToast(err.message || t('agentDetail.errorAddDeploymentGroup'), { kind: 'error', duration: 3000 })
  }
}

async function removeDeploymentGroup(name) {
  try {
    const res = await fetchWithAuth(
      `/api/protected/agents/${route.params.id}/deployment-groups/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    )
    if (!res.ok) throw new Error(await parseError(res, t('agentDetail.errorRemoveDeploymentGroup')))
    agent.value = await res.json()
  } catch (err) {
    console.error(err)
    showToast(err.message || t('agentDetail.errorRemoveDeploymentGroup'), { kind: 'error', duration: 3000 })
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
    if (!res.ok) throw new Error(await parseError(res, t('agentDetail.errorSaveWhitelist')))
    agent.value = { ...agent.value, processKillExempt: value }
    showToast(value ? t('agentDetail.addedToWhitelist') : t('agentDetail.removedFromWhitelist'))
  } catch (err) {
    console.error(err)
    processKillExemptInput.value = !value
    showToast(t('agentDetail.errorSaveWhitelist'), { kind: 'error', duration: 3000 })
  }
}

async function confirmRevoke() {
  const ok = await askConfirm(t('agentDetail.confirmRevokeMessage', { name: agent.value?.hostname || agent.value?.agentUid }), {
    title: t('agentDetail.confirmRevokeTitle'),
  })
  if (!ok) return
  try {
    const res = await fetchWithAuth(`/api/protected/agents/${route.params.id}/revoke`, { method: 'POST' })
    if (!res.ok) throw new Error(await parseError(res, t('agentDetail.errorRevoke')))
    await loadAgent()
    showToast(t('agentDetail.agentRevoked'))
  } catch (err) {
    console.error(err)
    showToast(t('agentDetail.errorRevokeAgent'), { kind: 'error', duration: 3000 })
  }
}

async function confirmDelete() {
  const ok = await askConfirm(
    t('agentDetail.confirmDeleteMessage', { name: agent.value?.hostname || agent.value?.agentUid }),
    { title: t('agentDetail.confirmDeleteTitle') },
  )
  if (!ok) return
  try {
    const res = await fetchWithAuth(`/api/protected/agents/${route.params.id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await parseError(res, t('agentDetail.errorDeleteAgent')))
    showToast(t('agentDetail.agentDeleted'))
    router.push('/agents')
  } catch (err) {
    console.error(err)
    showToast(err?.message || t('agentDetail.errorDeleteAgent'), { kind: 'error', duration: 3000 })
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
    if (!res.ok) throw new Error(await parseError(res, t('agentDetail.errorLoadCommands')))
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
    t('agentDetail.confirmCancelCommandMessage', { command: commandLabel(job.commandType, t) }),
    { title: t('agentDetail.confirmCancelCommandTitle') },
  )
  if (!ok) return

  cancellingJobId.value = job.id
  try {
    const res = await fetchWithAuth(`/api/protected/agents/jobs/${job.id}/cancel`, { method: 'POST' })
    if (!res.ok) throw new Error(await parseError(res, t('agentDetail.errorCancelCommand')))
    showToast(t('agentDetail.commandCancelled'))
    await loadJobs()
  } catch (err) {
    console.error(err)
    showToast(err?.message || t('agentDetail.errorCancelCommand'), { kind: 'error', duration: 3000 })
  } finally {
    cancellingJobId.value = null
  }
}

async function confirmClearJobs() {
  const ok = await askConfirm(t('agentDetail.confirmClearCommandsMessage'), {
    title: t('agentDetail.confirmClearCommandsTitle'),
  })
  if (!ok) return
  try {
    const res = await fetchWithAuth(`/api/protected/agents/${route.params.id}/jobs`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await parseError(res, t('agentDetail.errorClearLogs')))
    await loadJobs()
    showToast(t('agentDetail.commandsCleared'))
  } catch (err) {
    console.error(err)
    showToast(t('agentDetail.errorClearLogs'), { kind: 'error', duration: 3000 })
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
    if (!res.ok) throw new Error(await parseError(res, t('agentDetail.errorSendFixCommand')))
    if (jobsLoaded.value) await loadJobs()
    showToast(t('agentDetail.fixCommandSent'))
  } catch (err) {
    console.error(err)
    showToast(err?.message || t('agentDetail.errorSendFixCommand'), { kind: 'error', duration: 3000 })
  } finally {
    fixingPresetId.value = ''
  }
}

async function createJob() {
  const payload = {}
  if (isServiceCommand.value) {
    if (!jobForm.value.serviceName.trim()) {
      showToast(t('agentDetail.serviceNameRequired'), { kind: 'error', duration: 3000 })
      return
    }
    payload.serviceName = jobForm.value.serviceName.trim()
  }
  if (jobForm.value.commandType === 'run_powershell_script') {
    if (!jobForm.value.script.trim()) {
      showToast(t('agentDetail.scriptRequired'), { kind: 'error', duration: 3000 })
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
    if (!res.ok) throw new Error(await parseError(res, t('agentDetail.errorSendCommand')))
    await loadJobs()
    showToast(t('agentDetail.commandSent'))
  } catch (err) {
    console.error(err)
    showToast(err?.message || t('agentDetail.errorSendCommand'), { kind: 'error', duration: 3000 })
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
    showToast(t('agentDetail.managerNoConfirmation'), {
      kind: 'warning',
      duration: 4000,
    })
  } else if (job.status === 'completed') {
    showToast(t('agentDetail.managerCommandSuccess'))
  } else {
    showToast(job.errorOutput || t('agentDetail.managerCommandFailed'), { kind: 'error', duration: 4000 })
  }
  await loadManagerStatus()
  await loadManagerJobHistory()
}

async function sendManagerServiceAction(commandType) {
  if (!managerStatus.value?.managerId) return
  sendingManagerAction.value = true
  managerJobStatusText.value = t('agentDetail.sendingCommandEllipsis')
  try {
    const res = await fetchWithAuth(`/api/protected/managers/${managerStatus.value.managerId}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandType, payload: {} }),
    })
    if (!res.ok) throw new Error(await parseError(res, t('agentDetail.errorSendCommand')))
    const job = await res.json()
    managerJobStatusText.value = t('agentDetail.waitingForManager')
    const result = await waitForManagerJobResult(managerStatus.value.managerId, job.id)
    await reportManagerJobOutcome(result)
  } catch (err) {
    console.error(err)
    showToast(err?.message || t('agentDetail.errorSendCommand'), { kind: 'error', duration: 3000 })
  } finally {
    sendingManagerAction.value = false
    managerJobStatusText.value = ''
  }
}

async function setManagerStartMode() {
  if (!managerStatus.value?.managerId) return
  sendingManagerAction.value = true
  managerJobStatusText.value = t('agentDetail.sendingCommandEllipsis')
  try {
    const res = await fetchWithAuth(`/api/protected/managers/${managerStatus.value.managerId}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commandType: 'set_service_start_mode',
        payload: { startMode: selectedStartMode.value },
      }),
    })
    if (!res.ok) throw new Error(await parseError(res, t('agentDetail.errorSendCommand')))
    const job = await res.json()
    managerJobStatusText.value = t('agentDetail.waitingForManager')
    const result = await waitForManagerJobResult(managerStatus.value.managerId, job.id)
    await reportManagerJobOutcome(result)
  } catch (err) {
    console.error(err)
    showToast(err?.message || t('agentDetail.errorSendCommand'), { kind: 'error', duration: 3000 })
  } finally {
    sendingManagerAction.value = false
    managerJobStatusText.value = ''
  }
}

async function installViaManager() {
  const release = activeReleaseOptions.value.find((r) => r.id === selectedReleaseId.value)
  if (!release || !managerStatus.value?.managerId) return

  const ok = await askConfirm(
    t('agentDetail.confirmInstallViaManagerMessage', { version: release.version }),
    { title: t('agentDetail.confirmInstallViaManagerTitle') },
  )
  if (!ok) return

  installingViaManager.value = true
  managerJobStatusText.value = t('agentDetail.sendingCommandEllipsis')
  try {
    const res = await fetchWithAuth(`/api/protected/managers/${managerStatus.value.managerId}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commandType: 'install_update',
        payload: { releaseId: release.id },
      }),
    })
    if (!res.ok) throw new Error(await parseError(res, t('agentDetail.errorSendCommand')))
    const job = await res.json()
    // Duži rok od servisnih akcija - preuzimanje+raspakivanje paketa realno
    // može trajati duže od jednostavnog start/stop/restart poziva.
    managerJobStatusText.value = t('agentDetail.waitingForManagerInstall')
    const result = await waitForManagerJobResult(managerStatus.value.managerId, job.id, 40)
    await reportManagerJobOutcome(result)
  } catch (err) {
    console.error(err)
    showToast(err?.message || t('agentDetail.errorSendCommand'), { kind: 'error', duration: 3000 })
  } finally {
    installingViaManager.value = false
    managerJobStatusText.value = ''
  }
}

async function loadUpdateLog() {
  updateLogLoading.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/agents/${route.params.id}/update-log?limit=50`)
    if (!res.ok) throw new Error(await parseError(res, t('agentDetail.errorLoadUpdateLog')))
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
    if (!res.ok) throw new Error(await parseError(res, t('agentDetail.errorLoadEventLogs')))
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
    if (!res.ok) throw new Error(await parseError(res, t('agentDetail.errorLoadDnsLogs')))
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

<style scoped>
/* Sci-fi HUD skin - samo za ovu stranu (agent single view), po eksplicitnom
   zahtevu. Trik: cela paleta app-a je već izgrađena kao CSS custom
   properties (main.css :root/.dark) koje token-utility klase (bg-surface,
   text-ink, bg-accent, StatusPill-ovi bg-good/bad/warn/info...) čitaju
   direktno preko var(--surface-card) itd. Redefinisanjem tih ISTIH
   promenljivih na .agent-hud koren-u, ceo child stablo (uključujući
   StatusPill/TagChip/AppButton/GroupSelect/.app-input, sve deljene
   komponente) se automatski re-teksturira u neon-HUD paletu preko obične
   CSS kaskade - bez ijedne izmene u tim deljenim fajlovima i bez rizika da
   se nešto propusti. Fiksna tamna paleta bez obzira na app-ov svetla/tamna
   prekidač - sci-fi HUD na beloj pozadini ne postoji kao koncept.
*/
.agent-hud {
  --surface-canvas: #050b0d;
  --surface-card: #0a1619;
  --surface-sunken: #0e1f22;
  --line-default: #164047;
  --line-strong: #1f5c63;

  --ink-primary: #d7fff8;
  --ink-secondary: #86e6d9;
  --ink-muted: #4f7d79;

  --accent-default: #00e6c8;
  --accent-emphasis: #7dfff0;
  --accent-subtle: #0b2e2b;

  --status-good: #39ff88;
  --status-good-subtle: #0b2a1b;
  --status-bad: #ff3d68;
  --status-bad-subtle: #2a0b15;
  --status-warn: #ffd23f;
  --status-warn-subtle: #2e2408;
  --status-info: #4fc3ff;
  --status-info-subtle: #0b2030;

  position: relative;
  isolation: isolate;
  color: var(--ink-primary);
}

.hud-shell {
  position: relative;
  z-index: 1;
  background-color: var(--surface-canvas);
  /* Fin grid ispod skenirajućih linija - klasična HUD/blueprint podloga,
     statična (skenline sloj preko nje se pomera, ovaj ne). */
  background-image:
    linear-gradient(rgba(0, 230, 200, 0.06) 1px, transparent 1px),
    linear-gradient(to right, rgba(0, 230, 200, 0.06) 1px, transparent 1px);
  background-size: 28px 28px;
  border: 1px solid var(--line-default);
  border-radius: 1rem;
  padding: 1.25rem;
  box-shadow:
    0 0 0 1px rgba(0, 230, 200, 0.08),
    0 0 40px rgba(0, 230, 200, 0.06),
    inset 0 0 60px rgba(0, 230, 200, 0.03);
  /* Jednokratan "power-on" blesak pri ulasku na stranu - ne ponavlja se. */
  animation: hud-boot 0.7s ease-out;
}

@keyframes hud-boot {
  0% { opacity: 0; filter: brightness(2.2); }
  60% { opacity: 1; filter: brightness(1.3); }
  100% { opacity: 1; filter: brightness(1); }
}

/* Fina skenirajuća linija preko cele konzole - klasičan HUD/CRT motiv,
   dovoljno suptilna da ne smeta čitljivosti teksta ispod. */
.hud-scanlines {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  border-radius: 1rem;
  background-image: repeating-linear-gradient(
    to bottom,
    rgba(0, 230, 200, 0.05) 0,
    rgba(0, 230, 200, 0.05) 1px,
    transparent 1px,
    transparent 3px
  );
  animation: hud-scan-drift 9s linear infinite;
}

@keyframes hud-scan-drift {
  from { background-position: 0 0; }
  to { background-position: 0 60px; }
}

.hud-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent-default);
  margin-bottom: 0.25rem;
}

.hud-live-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--status-good);
  box-shadow: 0 0 6px 1px var(--status-good);
  animation: hud-pulse 1.6s ease-in-out infinite;
}

@keyframes hud-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.7); }
}

.hud-glow-text {
  text-shadow: 0 0 10px rgba(0, 230, 200, 0.45), 0 0 2px rgba(0, 230, 200, 0.6);
}

.hud-section-title {
  font-family: 'IBM Plex Sans Condensed', sans-serif;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-secondary);
}

/* Ugaone "bracket" konzole - 8 solid-color gradient slojeva (2 po uglu, L
   oblik), bez dodatnog markup-a po panelu. */
.hud-panel {
  position: relative;
  /* Manji radijus od Tailwind-ovog rounded-xl (12px) - uglovi na 8px krivini
     su dovoljno blagi da bracket-i ispod ne moraju daleko od ivice, a
     dovoljno oštri da ne seku pravougaoni bracket oblik (kod 12px krivine,
     bracket postavljen blizu ivice fizički probija zaobljenje i "štrči" kao
     fluorescentna linija van konture - to je bio bug). */
  border-radius: 0.5rem;
  background-image:
    linear-gradient(var(--accent-default), var(--accent-default)),
    linear-gradient(var(--accent-default), var(--accent-default)),
    linear-gradient(var(--accent-default), var(--accent-default)),
    linear-gradient(var(--accent-default), var(--accent-default)),
    linear-gradient(var(--accent-default), var(--accent-default)),
    linear-gradient(var(--accent-default), var(--accent-default)),
    linear-gradient(var(--accent-default), var(--accent-default)),
    linear-gradient(var(--accent-default), var(--accent-default));
  background-repeat: no-repeat;
  background-size:
    12px 2px, 2px 12px,
    12px 2px, 2px 12px,
    12px 2px, 2px 12px,
    12px 2px, 2px 12px;
  background-position:
    top 3px left 3px, top 3px left 3px,
    top 3px right 3px, top 3px right 3px,
    bottom 3px right 3px, bottom 3px right 3px,
    bottom 3px left 3px, bottom 3px left 3px;
  box-shadow: 0 0 24px -4px rgba(0, 230, 200, 0.25);
}

.hud-cursor {
  animation: hud-blink 1s step-end infinite;
}

@keyframes hud-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}

.hud-tile {
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}

.hud-tile:hover {
  border-color: var(--accent-default);
  box-shadow: 0 0 12px -2px rgba(0, 230, 200, 0.5);
}

.hud-metric {
  font-size: 1.05rem;
  text-shadow: 0 0 8px rgba(0, 230, 200, 0.5);
}

/* Radijalni gauge prsten (CPU/RAM/Disk) - conic-gradient popunjen do
   procenta opterećenja preko --gauge-deg/--gauge-color inline promenljivih
   (postavljenih iz gaugeDeg()/gaugeColor() u skripti), ostatak kruga u
   liniji boji. ::before seče sredinu da ostane samo prsten (donut), broj
   ide preko toga. */
.hud-gauge-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.hud-gauge {
  position: relative;
  width: 42px;
  height: 42px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: conic-gradient(var(--gauge-color, var(--accent-default)) var(--gauge-deg, 0deg), var(--line-default) 0deg);
  box-shadow: 0 0 10px -2px var(--gauge-color, var(--accent-default));
  transition: box-shadow 0.2s ease;
}

.hud-gauge::before {
  content: '';
  position: absolute;
  inset: 5px;
  border-radius: 999px;
  background: var(--surface-sunken);
}

.hud-gauge-value {
  position: relative;
  z-index: 1;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.62rem;
  font-weight: 700;
  color: var(--ink-primary);
}

.hud-tabs {
  position: relative;
}

.hud-tab {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.78rem;
}

.hud-tab.bg-accent {
  box-shadow: 0 0 14px -2px var(--accent-default);
}

.hud-tab.bg-info {
  box-shadow: 0 0 14px -2px var(--status-info);
}

.hud-row {
  position: relative;
  border-left: 2px solid var(--line-strong);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.hud-row:hover {
  border-left-color: var(--accent-default);
  box-shadow: -2px 0 12px -4px rgba(0, 230, 200, 0.4);
}

.agent-hud :deep(input[type='checkbox']) {
  accent-color: var(--accent-default);
}
</style>
