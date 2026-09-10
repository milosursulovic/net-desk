<template>
  <div class="space-y-5">
    <div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">{{ t('nav.agents') }}</h1>
        <p class="mt-0.5 text-sm text-ink-muted">{{ t('agents.subtitle') }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <AppButton variant="secondary" to="/computers-without-agent">{{ t('withoutAgent.title') }}</AppButton>
        <AppButton variant="secondary" to="/agent-releases">{{ t('releases.title') }}</AppButton>
        <AppButton variant="secondary" to="/agent-batches">{{ t('agents.batchCommands') }}</AppButton>
        <AppButton variant="secondary" to="/deployment-groups">{{ t('deploymentGroups.title') }}</AppButton>
        <AppButton v-if="isAdmin" variant="secondary" to="/downloads-folder">{{ t('downloads.title') }}</AppButton>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile :label="t('agents.totalFiltered')" :value="total" tone="accent" />
      <StatTile :label="t('common.online')" :value="statOnline" tone="good" :proportion="total ? statOnline / total : 0" />
      <StatTile :label="t('common.offline')" :value="statOffline" tone="bad" :proportion="total ? statOffline / total : 0" />
      <StatTile
        :label="t('agents.managerCoverage')"
        :value="total ? `${Math.round((statManagerCoverage / total) * 100)}%` : '—'"
        tone="info"
        :proportion="total ? statManagerCoverage / total : 0"
      />
    </div>

    <div class="space-y-3">
      <!-- Pretraga i filter -->
      <div class="flex flex-col sm:flex-row gap-2">
        <div class="relative flex-1">
          <input v-model="searchInput" @input="onSearchInput" type="text"
            :placeholder="t('agents.searchPlaceholder')"
            class="app-input w-full pr-10"
            :aria-label="t('agents.searchAriaLabel')" />
          <button v-if="searchInput" @click="clearSearch"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
            :aria-label="t('printers.clearSearchAriaLabel')">
            <NavIcon name="x" />
          </button>
        </div>

        <select v-model="status" class="app-input w-full sm:w-48" :aria-label="t('agents.statusFilterAriaLabel')">
          <option value="all">{{ t('home.statusAll') }}</option>
          <option value="active">{{ t('agents.statusActive') }}</option>
          <option value="revoked">{{ t('agents.statusRevoked') }}</option>
        </select>

        <button
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-sunken sm:hidden"
          @click="detailedFiltersOpen = !detailedFiltersOpen"
        >
          {{ t('agents.detailedFilters') }}
          <span
            v-if="activeDetailedFilterCount"
            class="rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold text-white"
          >{{ activeDetailedFilterCount }}</span>
          <NavIcon :name="detailedFiltersOpen ? 'chevron-up' : 'chevron-down'" class="text-xs" />
        </button>
      </div>

      <!-- Aktivni filteri kao chip-ovi - vidljivo bez obzira na
           detailedFiltersOpen, brzi pregled šta trenutno filtrira listu. -->
      <div v-if="activeFilterChips.length" class="flex flex-wrap items-center gap-1.5">
        <TagChip v-for="chip in activeFilterChips" :key="chip.key" :label="chip.label" removable @remove="chip.clear" />
        <button type="button" class="text-xs text-ink-muted hover:text-ink hover:underline" @click="clearAllFilters">
          {{ t('agents.clearAll') }}
        </button>
      </div>

      <!-- Detaljni filteri - skupljeno na mobilnom po difoltu -->
      <div :class="detailedFiltersOpen ? 'block' : 'hidden sm:block'">
        <div class="flex flex-wrap items-center gap-2">
          <select v-model="connectivityStatus" class="app-input w-auto max-w-full min-w-0 truncate" :aria-label="t('agents.connectivityFilterAriaLabel')">
            <option value="">{{ t('agents.allConnections') }}</option>
            <option value="online">{{ t('common.online') }}</option>
            <option value="stale">{{ t('agents.stale') }}</option>
            <option value="offline">{{ t('common.offline') }}</option>
            <option value="unknown">{{ t('home.typeUnknown') }}</option>
          </select>

          <select
            v-model="hasManagerChannel"
            class="app-input w-auto max-w-full min-w-0 truncate"
            :aria-label="t('agents.managerFilterAriaLabel')"
            :title="t('agents.managerFilterTitle')"
          >
            <option value="">{{ t('agents.allManager') }}</option>
            <option value="true">{{ t('agents.hasManager') }}</option>
            <option value="false">{{ t('agents.noManager') }}</option>
          </select>

          <select
            v-model="trustedRootCertInstalled"
            class="app-input w-auto max-w-full min-w-0 truncate"
            :aria-label="t('agents.trustedRootFilterAriaLabel')"
            title="cert_CA_SSL_DECRIPT_BOR.crt in Local Machine Trusted Root store"
          >
            <option value="">{{ t('agents.allTrustedRoot') }}</option>
            <option value="true">{{ t('agents.hasTrustedRoot') }}</option>
            <option value="false">{{ t('agents.noTrustedRoot') }}</option>
          </select>

          <select
            v-model="intermediateCertInstalled"
            class="app-input w-auto max-w-full min-w-0 truncate"
            :aria-label="t('agents.intermediateFilterAriaLabel')"
            title="cert_SSL_TRUST.crt in Local Machine Intermediate store"
          >
            <option value="">{{ t('agents.allIntermediate') }}</option>
            <option value="true">{{ t('agents.hasIntermediate') }}</option>
            <option value="false">{{ t('agents.noIntermediate') }}</option>
          </select>

          <select
            v-model="secureDnsDisabled"
            class="app-input w-auto max-w-full min-w-0 truncate"
            :aria-label="t('agents.secureDnsFilterAriaLabel')"
            :title="t('agents.secureDnsFilterTitle')"
          >
            <option value="">{{ t('agents.allSecureDns') }}</option>
            <option value="true">{{ t('agents.secureDnsDisabledOpt') }}</option>
            <option value="false">{{ t('agents.secureDnsEnabledOpt') }}</option>
          </select>

          <MultiSelect
            v-model="deploymentGroup"
            :options="deploymentGroupOptions"
            :placeholder="t('agents.allDeploymentGroups')"
            class="w-auto max-w-48 min-w-0"
          />

          <MultiSelect
            v-model="os"
            :options="osOptions"
            :placeholder="t('home.allOs')"
            class="w-auto max-w-40 min-w-0"
          />

          <select v-model="osArchitecture" class="app-input w-auto max-w-full min-w-0 truncate" :aria-label="t('home.archFilterTitle')">
            <option value="">{{ t('home.allArchitectures') }}</option>
            <option v-for="a in osArchitectureOptions" :key="a" :value="a">{{ a }}</option>
          </select>

          <MultiSelect
            v-model="version"
            :options="versionOptions"
            :placeholder="t('agents.allVersions')"
            class="w-auto max-w-40 min-w-0"
          />

          <label v-if="version.length" class="inline-flex items-center gap-1.5 text-sm text-ink-secondary">
            <input
              type="checkbox"
              :checked="versionMode === 'neq'"
              @change="versionMode = versionMode === 'neq' ? 'eq' : 'neq'"
            />
            {{ t('agents.excludeShowOutdated') }}
          </label>

          <MultiSelect
            v-model="managerVersion"
            :options="managerVersionOptions"
            :placeholder="t('agents.allManagerVersions')"
            class="w-auto max-w-40 min-w-0"
            :title="t('agents.managerVersionTitle')"
          />

          <label v-if="managerVersion.length" class="inline-flex items-center gap-1.5 text-sm text-ink-secondary">
            <input
              type="checkbox"
              :checked="managerVersionMode === 'neq'"
              @change="managerVersionMode = managerVersionMode === 'neq' ? 'eq' : 'neq'"
            />
            {{ t('agents.excludeShowOutdated') }}
          </label>

          <MultiSelect
            v-model="department"
            :options="departmentOptions"
            :placeholder="t('home.allDepartments')"
            class="w-auto max-w-40 min-w-0"
          />

          <label class="inline-flex items-center gap-1.5 text-sm text-ink-secondary">
            <input
              type="checkbox"
              :checked="antivirusInactive === 'true'"
              @change="antivirusInactive = antivirusInactive === 'true' ? '' : 'true'"
            />
            {{ t('agents.noActiveAntivirus') }}
          </label>

          <label class="inline-flex items-center gap-1.5 text-sm text-ink-secondary">
            <input
              type="checkbox"
              :checked="firewallInactive === 'true'"
              @change="firewallInactive = firewallInactive === 'true' ? '' : 'true'"
            />
            {{ t('agents.noActiveFirewall') }}
          </label>

          <label class="inline-flex items-center gap-1.5 text-sm text-ink-secondary">
            <input
              type="checkbox"
              :checked="windowsUpdateInactive === 'true'"
              @change="windowsUpdateInactive = windowsUpdateInactive === 'true' ? '' : 'true'"
            />
            {{ t('agents.windowsUpdateDisabled') }}
          </label>

          <label class="inline-flex items-center gap-1.5 text-sm text-ink-secondary" :title="t('agents.agentMismatchTitle')">
            <input
              type="checkbox"
              :checked="agentOfflineIpOnline === 'true'"
              @change="agentOfflineIpOnline = agentOfflineIpOnline === 'true' ? '' : 'true'"
            />
            {{ t('agents.agentOfflineIpOnline') }}
          </label>

          <label class="inline-flex items-center gap-1.5 text-sm text-ink-secondary" :title="t('agents.serviceFilesMismatchTitle')">
            <input
              type="checkbox"
              :checked="serviceFilesMismatch === 'true'"
              @change="serviceFilesMismatch = serviceFilesMismatch === 'true' ? '' : 'true'"
            />
            {{ t('agents.serviceFilesMismatch') }}
          </label>

          <label class="inline-flex items-center gap-1.5 text-sm text-ink-secondary" :title="t('agents.processKillExemptTitle')">
            <input
              type="checkbox"
              :checked="processKillExempt === 'true'"
              @change="processKillExempt = processKillExempt === 'true' ? '' : 'true'"
            />
            {{ t('agents.processKillExempt') }}
          </label>

          <label class="inline-flex items-center gap-1.5 text-sm text-ink-secondary" :title="t('agents.osOverlapTitle')">
            <input
              type="checkbox"
              :checked="deploymentGroupOsOverlap === 'true'"
              @change="deploymentGroupOsOverlap = deploymentGroupOsOverlap === 'true' ? '' : 'true'"
            />
            {{ t('agents.osOverlap') }}
          </label>

          <label class="inline-flex items-center gap-1.5 text-sm text-ink-secondary">
            <input
              type="checkbox"
              :checked="noDeploymentGroup === 'true'"
              @change="noDeploymentGroup = noDeploymentGroup === 'true' ? '' : 'true'"
            />
            {{ t('agents.noDeploymentGroup') }}
          </label>
        </div>

        <div class="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <label class="block text-xs text-ink-muted mb-1" for="enrolledFrom">{{ t('agents.enrolledFrom') }}</label>
            <input id="enrolledFrom" v-model="enrolledFrom" type="date" class="app-input w-auto text-sm" />
          </div>
          <div>
            <label class="block text-xs text-ink-muted mb-1" for="enrolledTo">{{ t('agents.enrolledTo') }}</label>
            <input id="enrolledTo" v-model="enrolledTo" type="date" class="app-input w-auto text-sm" />
          </div>
          <div>
            <label class="block text-xs text-ink-muted mb-1" for="heartbeatFrom">{{ t('agents.heartbeatFrom') }}</label>
            <input id="heartbeatFrom" v-model="heartbeatFrom" type="date" class="app-input w-auto text-sm" />
          </div>
          <div>
            <label class="block text-xs text-ink-muted mb-1" for="heartbeatTo">{{ t('agents.heartbeatTo') }}</label>
            <input id="heartbeatTo" v-model="heartbeatTo" type="date" class="app-input w-auto text-sm" />
          </div>
          <AppButton variant="neutral" @click="clearDetailedFilters">{{ t('agents.resetFilters') }}</AppButton>
        </div>
      </div>

      <PaginationBar
        :page="page"
        :limit="limit"
        :total="total"
        :total-pages="totalPages"
        :loading="loading"
        @prev="prevPage"
        @next="nextPage({ total })"
        @update:limit="(v) => (limit = v)"
      />

      <p class="text-sm text-ink-muted">{{ t('agents.shown', { shown: items.length, total }) }}</p>

      <div v-if="items.length" class="flex flex-wrap items-center gap-3">
        <label class="flex items-center gap-2 text-sm text-ink-secondary">
          <input type="checkbox" :checked="allVisibleSelected" @change="toggleSelectAllVisible" />
          {{ t('agents.selectAllVisible', { count: selectedIds.size }) }}
        </label>
        <button
          type="button"
          class="text-sm text-accent hover:underline disabled:opacity-50 disabled:no-underline"
          :disabled="selectingAllMatching"
          @click="selectAllMatching"
        >
          {{ selectingAllMatching ? t('agents.selecting') : t('agents.selectAllMatching', { total }) }}
        </button>
      </div>
    </div>

    <!-- Batch komanda - vidljivo samo kad je bar 1 agent selektovan -->
    <div v-if="selectedIds.size" class="rounded-xl border border-info/30 bg-info-subtle p-4 space-y-3">
      <div class="font-medium text-info">
        {{ t('agents.sendCommandTo', { count: selectedIds.size }) }}
      </div>
      <div v-if="selectedIds.size > MAX_BATCH_AGENTS" class="text-sm text-bad">
        {{ t('agents.batchLimitWarning', { max: MAX_BATCH_AGENTS }) }}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="text-sm text-ink-secondary">{{ t('agents.commandType') }}</label>
          <select v-model="batchForm.commandType" class="app-input w-full">
            <option v-for="c in COMMAND_TYPES" :key="c" :value="c">{{ COMMAND_LABELS[c] }}</option>
          </select>
        </div>
        <FormInput v-if="isBatchServiceCommand" v-model.trim="batchForm.serviceName" :label="t('agents.serviceNameLabel')" placeholder="Spooler" />
      </div>
      <label class="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" v-model="batchOnlyOnline" />
        {{ t('agents.onlyOnlineAgents') }}
      </label>
      <div v-if="batchForm.commandType === 'run_powershell_script'" class="space-y-2">
        <div>
          <label class="text-sm text-ink-secondary">{{ t('agents.readyScript') }}</label>
          <select v-model="batchSelectedPresetId" class="app-input w-full" @change="applyBatchPreset">
            <option value="">{{ t('agents.customScript') }}</option>
            <option v-for="p in POWERSHELL_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
        </div>
        <div>
          <label class="text-sm text-ink-secondary">{{ t('agents.powershellScript') }}</label>
          <textarea v-model="batchForm.script" rows="6" class="app-input w-full font-mono text-xs" placeholder="Get-Service | Where-Object ..."></textarea>
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <AppButton variant="neutral" @click="clearSelection">{{ t('agents.clearSelection') }}</AppButton>
        <AppButton
          variant="success"
          :disabled="sendingBatch || selectedIds.size > MAX_BATCH_AGENTS"
          @click="sendBatchJob"
        >
          {{ sendingBatch ? t('agents.sending') : t('agents.sendToCount', { count: selectedIds.size }) }}
        </AppButton>
      </div>
    </div>

    <!-- Masovna dodela deployment grupe - admin-only, isto kao pojedinačna
         dodela na Agent Detail strani. -->
    <div v-if="selectedIds.size && isAdmin" class="rounded-xl border border-accent/30 bg-accent-subtle p-4 space-y-3">
      <div class="font-medium text-accent-emphasis">
        {{ t('agents.assignGroupTo', { count: selectedIds.size }) }}
      </div>
      <div v-if="selectedIds.size > MAX_BATCH_AGENTS" class="text-sm text-bad">
        {{ t('agents.assignBatchLimitWarning', { max: MAX_BATCH_AGENTS }) }}
      </div>
      <div class="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div class="flex-1 min-w-0">
          <label class="text-sm text-ink-secondary">{{ t('agents.deploymentGroupLabel') }}</label>
          <GroupSelect
            v-model="massDeploymentGroup"
            :options="deploymentGroupOptions"
            :is-admin="isAdmin"
            :allow-empty="true"
            create-endpoint="/api/protected/deployment-groups"
            @group-added="(name) => { if (!deploymentGroupOptions.includes(name)) deploymentGroupOptions.push(name) }"
            @error="(msg) => showToast(msg, { kind: 'error', duration: 3000 })"
          />
        </div>
        <AppButton
          variant="success"
          :disabled="assigningDeploymentGroup || !massDeploymentGroup || selectedIds.size > MAX_BATCH_AGENTS"
          @click="assignDeploymentGroupToSelected"
        >
          {{ assigningDeploymentGroup ? t('agents.assigning') : t('agents.assignToCount', { count: selectedIds.size }) }}
        </AppButton>
      </div>
    </div>

    <div class="min-h-50">
      <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="n in 6" :key="n" class="animate-pulse rounded-xl border border-line bg-surface shadow-sm p-4">
          <div class="h-5 w-2/3 bg-surface-sunken rounded mb-3"></div>
          <div class="h-4 w-1/2 bg-surface-sunken rounded mb-2"></div>
          <div class="h-4 w-1/3 bg-surface-sunken rounded"></div>
        </div>
      </div>

      <div v-else-if="!items.length" class="table-shell p-8 text-center text-ink-muted">
        {{ t('agents.noResults') }}
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="a in items" :key="a.id"
          class="rounded-xl border border-line bg-surface shadow-sm hover:shadow-md transition p-4 flex flex-col gap-3">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-start gap-2 min-w-0">
              <input
                type="checkbox"
                class="mt-1 shrink-0"
                :checked="selectedIds.has(a.id)"
                @change="toggleSelect(a.id)"
                :aria-label="t('agents.selectAgent')"
              />
              <div class="min-w-0">
                <RouterLink :to="`/agents/${a.id}`" class="block truncate font-semibold text-ink hover:underline">
                  {{ a.hostname || '—' }}
                </RouterLink>
                <div class="mt-0.5 flex items-center gap-1 font-mono text-xs text-ink-muted">
                  <span class="truncate">{{ a.agentUid }}</span>
                  <button @click="copy(a.agentUid)" class="shrink-0 text-ink-muted hover:text-ink" :aria-label="t('agents.copyAgentId')">
                    <NavIcon name="copy" />
                  </button>
                </div>
              </div>
            </div>
            <button v-if="a.status === 'active'" @click="confirmRevoke(a)" class="shrink-0 rounded p-1 text-bad hover:bg-surface-sunken" :title="t('agents.revokeAccess')">
              <NavIcon name="ban" />
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            <StatusPill :status="agentStatusTone(a.status)" :label="agentStatusLabel(a.status, t)" />
            <StatusPill :status="connectivityTone(a.connectivityStatus)" :label="connectivityLabel(a.connectivityStatus, t)" />
          </div>

          <div
            v-if="a.antivirusStatus !== 'enabled' || a.firewallStatus !== 'enabled' || a.windowsUpdateStatus !== 'Running' || isAgentMismatch(a) || a.serviceFilesMismatch"
            class="flex flex-wrap gap-1"
          >
            <span v-if="a.antivirusStatus !== 'enabled'" :title="t('agents.antivirusNotConfirmed')">
              <StatusPill status="bad" label="Antivirus" :dot="false" />
            </span>
            <span v-if="a.firewallStatus !== 'enabled'" :title="t('agents.firewallNotConfirmed')">
              <StatusPill status="bad" label="Firewall" :dot="false" />
            </span>
            <span v-if="a.windowsUpdateStatus !== 'Running'" :title="t('agents.wuNotConfirmed')">
              <StatusPill status="bad" label="WU" :dot="false" />
            </span>
            <span v-if="isAgentMismatch(a)" :title="t('agents.agentMismatchTitle')">
              <StatusPill status="warn" :label="t('agents.possibleFault')" :dot="false" />
            </span>
            <span
              v-if="a.serviceFilesMismatch"
              :title="a.serviceFilesMismatchDetails || t('agents.serviceFilesMismatchDetails')"
            >
              <StatusPill status="warn" :label="t('agents.files')" :dot="false" />
            </span>
          </div>

          <div class="text-sm text-ink-secondary space-y-1">
            <div>
              <span class="text-ink-muted">OS:</span> {{ a.osCaption || '—' }}
            </div>
            <div class="flex items-center gap-1.5">
              <span class="text-ink-muted">{{ t('agents.version') }}:</span>
              <span class="font-mono tabular-nums">{{ a.agentVersion || '—' }}</span>
              <span
                v-if="a.managerChannelStatus"
                class="inline-flex h-2 w-2 shrink-0 rounded-full bg-info"
                :title="t('agents.managerChannelRegistered', { status: a.managerChannelStatus })"
              ></span>
            </div>
            <div>
              <span class="text-ink-muted">IP:</span> <span class="font-mono">{{ a.lastIp || '—' }}</span>
            </div>
            <div>
              <span class="text-ink-muted">{{ t('agents.lastHeartbeat') }}:</span>
              {{ fmtRelative(a.lastHeartbeatAt, locale) }}
              <span class="font-mono text-xs text-ink-muted">({{ fmtDate(a.lastHeartbeatAt) }})</span>
            </div>
            <div>
              <span class="text-ink-muted">{{ t('agents.enroll') }}:</span>
              <span class="font-mono text-xs">{{ fmtDate(a.enrolledAt) }}</span>
            </div>
          </div>

          <div>
            <div v-if="agentDeploymentGroups(a).length" class="flex flex-wrap gap-1">
              <TagChip v-for="g in agentDeploymentGroups(a)" :key="g" :label="g" />
            </div>
            <span v-else class="text-sm text-ink-muted">{{ t('agents.noDeploymentGroup') }}</span>
            <RouterLink v-if="a.ipEntryId" :to="`/ip/${a.ipEntryId}/meta`" class="mt-1 block text-xs text-accent hover:underline">
              {{ t('agents.openComputer') }}
            </RouterLink>
          </div>
        </div>
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { fmtDate as formatDate, fmtRelative } from '@/utils/format.js'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'
import { useCurrentSite } from '@/composables/useCurrentSite.js'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import { useToast } from '@/composables/useToast.js'
import { useAbortableFetch } from '@/composables/useAbortableFetch.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { parseError } from '@/utils/api.js'
import { COMMAND_TYPES, COMMAND_LABELS, SERVICE_COMMANDS } from '@/constants/agentCommands.js'
import { POWERSHELL_PRESETS } from '@/constants/powershellPresets.js'
import { agentStatusTone, agentStatusLabel, connectivityTone, connectivityLabel } from '@/utils/statusTones.js'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import FormInput from '@/components/FormInput.vue'
import AppButton from '@/components/AppButton.vue'
import GroupSelect from '@/components/GroupSelect.vue'
import MultiSelect from '@/components/MultiSelect.vue'
import StatusPill from '@/components/StatusPill.vue'
import TagChip from '@/components/TagChip.vue'
import StatTile from '@/components/StatTile.vue'
import NavIcon from '@/components/NavIcon.vue'
import PaginationBar from '@/components/PaginationBar.vue'

const { t, locale } = useI18n()
const fmtDate = (d) => formatDate(d, locale.value === 'en' ? 'en-US' : 'sr-RS')
const router = useRouter()
const route = useRoute()
const site = useCurrentSite()
const { isAdmin } = useCurrentUser()
const { toast, showToast, copyToClipboard } = useToast()
const { getSignal, abort } = useAbortableFetch()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()

// Isti limit kao BatchCreateJobSchema.agentIds max u backend/dtos/agentJobs.dto.js.
const MAX_BATCH_AGENTS = 500

const {
  page,
  limit,
  search,
  status,
  connectivityStatus,
  deploymentGroup,
  os,
  osArchitecture,
  version,
  versionMode,
  managerVersion,
  managerVersionMode,
  department,
  enrolledFrom,
  enrolledTo,
  heartbeatFrom,
  heartbeatTo,
  antivirusInactive,
  firewallInactive,
  windowsUpdateInactive,
  agentOfflineIpOnline,
  serviceFilesMismatch,
  processKillExempt,
  deploymentGroupOsOverlap,
  noDeploymentGroup,
  hasManagerChannel,
  trustedRootCertInstalled,
  intermediateCertInstalled,
  secureDnsDisabled,
  nextPage,
  prevPage,
  applyServerPagination,
} = usePaginatedRoute({
  fields: {
    page: { type: 'int', default: 1 },
    limit: { type: 'int', default: 20 },
    search: { type: 'string', default: '', omitIfEmpty: true },
    status: { default: 'all', oneOf: ['all', 'active', 'revoked'] },
    connectivityStatus: {
      type: 'string',
      default: '',
      omitIfEmpty: true,
      oneOf: ['', 'online', 'stale', 'offline', 'unknown'],
    },
    hasManagerChannel: {
      type: 'string',
      default: '',
      omitIfEmpty: true,
      oneOf: ['', 'true', 'false'],
    },
    trustedRootCertInstalled: {
      type: 'string',
      default: '',
      omitIfEmpty: true,
      oneOf: ['', 'true', 'false'],
    },
    intermediateCertInstalled: {
      type: 'string',
      default: '',
      omitIfEmpty: true,
      oneOf: ['', 'true', 'false'],
    },
    secureDnsDisabled: {
      type: 'string',
      default: '',
      omitIfEmpty: true,
      oneOf: ['', 'true', 'false'],
    },
    // Slobodan tekst (isto tretiranje kao os/version/department ispod) -
    // grupe više nisu ograničene na fiksnu listu, pa nema oneOf ovde (inače
    // bi bilo koja vrednost van stare liste od 4 bila tiho resetovana).
    deploymentGroup: { type: 'array', default: [] },
    os: { type: 'array', default: [] },
    osArchitecture: { type: 'string', default: '', omitIfEmpty: true },
    version: { type: 'array', default: [] },
    versionMode: { default: 'eq', oneOf: ['eq', 'neq'] },
    managerVersion: { type: 'array', default: [] },
    managerVersionMode: { default: 'eq', oneOf: ['eq', 'neq'] },
    department: { type: 'array', default: [] },
    enrolledFrom: { type: 'string', default: '', omitIfEmpty: true },
    enrolledTo: { type: 'string', default: '', omitIfEmpty: true },
    heartbeatFrom: { type: 'string', default: '', omitIfEmpty: true },
    heartbeatTo: { type: 'string', default: '', omitIfEmpty: true },
    antivirusInactive: { type: 'string', default: '', omitIfEmpty: true, oneOf: ['', 'true'] },
    firewallInactive: { type: 'string', default: '', omitIfEmpty: true, oneOf: ['', 'true'] },
    windowsUpdateInactive: { type: 'string', default: '', omitIfEmpty: true, oneOf: ['', 'true'] },
    agentOfflineIpOnline: { type: 'string', default: '', omitIfEmpty: true, oneOf: ['', 'true'] },
    serviceFilesMismatch: { type: 'string', default: '', omitIfEmpty: true, oneOf: ['', 'true'] },
    processKillExempt: { type: 'string', default: '', omitIfEmpty: true, oneOf: ['', 'true'] },
    deploymentGroupOsOverlap: { type: 'string', default: '', omitIfEmpty: true, oneOf: ['', 'true'] },
    noDeploymentGroup: { type: 'string', default: '', omitIfEmpty: true, oneOf: ['', 'true'] },
  },
  resetPageOn: [
    'search',
    'status',
    'connectivityStatus',
    'deploymentGroup',
    'os',
    'osArchitecture',
    'version',
    'versionMode',
    'managerVersion',
    'managerVersionMode',
    'department',
    'enrolledFrom',
    'enrolledTo',
    'heartbeatFrom',
    'heartbeatTo',
    'antivirusInactive',
    'firewallInactive',
    'windowsUpdateInactive',
    'agentOfflineIpOnline',
    'serviceFilesMismatch',
    'processKillExempt',
    'deploymentGroupOsOverlap',
    'noDeploymentGroup',
    'hasManagerChannel',
    'trustedRootCertInstalled',
    'intermediateCertInstalled',
    'secureDnsDisabled',
  ],
  useReplace: true,
})

watch(
  [
    page,
    limit,
    search,
    status,
    connectivityStatus,
    deploymentGroup,
    os,
    osArchitecture,
    version,
    versionMode,
    managerVersion,
    managerVersionMode,
    department,
    enrolledFrom,
    enrolledTo,
    heartbeatFrom,
    heartbeatTo,
    antivirusInactive,
    firewallInactive,
    windowsUpdateInactive,
    agentOfflineIpOnline,
    serviceFilesMismatch,
    processKillExempt,
    deploymentGroupOsOverlap,
    noDeploymentGroup,
    hasManagerChannel,
    trustedRootCertInstalled,
    intermediateCertInstalled,
    secureDnsDisabled,
    site,
  ],
  () => {
    fetchData()
    fetchStatTiles()
  },
)

watch(site, () => {
  // os/version/department/osArchitecture dropdown vrednosti su vezane za
  // PRETHODNU lokaciju - ako ostanu postavljene posle promene lokacije,
  // filtriraju na vrednost koja verovatno ne postoji na novoj (prazna lista
  // rezultata).
  os.value = []
  osArchitecture.value = ''
  version.value = []
  versionMode.value = 'eq'
  managerVersion.value = []
  managerVersionMode.value = 'eq'
  department.value = []
  fetchFilterOptions()
})

const items = ref([])
const total = ref(0)
const totalPages = ref(0)
// Stat tile brojevi - stvarni upiti (isti /agents/ids endpoint kao
// selectAllMatching(), samo sa jednim filterom prepisanim po pločici), ne
// izvedeno samo iz trenutne (paginirane) strane - videti napomenu u
// fetchStatTiles().
const statOnline = ref(0)
const statOffline = ref(0)
const statManagerCoverage = ref(0)
const searchInput = ref(search.value)
const loading = ref(false)
const osOptions = ref([])
const osArchitectureOptions = ref([])
const versionOptions = ref([])
const managerVersionOptions = ref([])
const departmentOptions = ref([])
const deploymentGroupOptions = ref([])

// Detaljni filteri su na mobilnom skupljeni po difoltu (ispod sm) - broj na
// dugmetu je vizuelni podsetnik da nešto NIJE na difoltnoj vrednosti, čak i
// dok je panel zatvoren.
const detailedFiltersOpen = ref(false)
const activeDetailedFilterCount = computed(() => {
  let n = 0
  if (connectivityStatus.value) n++
  if (deploymentGroup.value.length) n++
  if (os.value.length) n++
  if (osArchitecture.value) n++
  if (version.value.length) n++
  if (managerVersion.value.length) n++
  if (department.value.length) n++
  if (enrolledFrom.value) n++
  if (enrolledTo.value) n++
  if (heartbeatFrom.value) n++
  if (heartbeatTo.value) n++
  if (antivirusInactive.value) n++
  if (firewallInactive.value) n++
  if (windowsUpdateInactive.value) n++
  if (agentOfflineIpOnline.value) n++
  if (serviceFilesMismatch.value) n++
  if (processKillExempt.value) n++
  if (deploymentGroupOsOverlap.value) n++
  if (noDeploymentGroup.value) n++
  if (hasManagerChannel.value) n++
  if (trustedRootCertInstalled.value) n++
  if (intermediateCertInstalled.value) n++
  if (secureDnsDisabled.value) n++
  return n
})

// Vizuelni prikaz "šta trenutno filtrira" kao chip-ovi - ne uvodi novo
// stanje, samo čita/piše iste refs kao detaljni filter panel iznad. Svaki
// chip nosi svoju clear() funkciju (za nizovne filtere briše SAMO tu jednu
// vrednost, ne ceo filter).
const STATUS_LABELS = computed(() => ({ active: t('agents.statusActive'), revoked: t('agents.statusRevoked') }))
const CONNECTIVITY_FILTER_LABELS = computed(() => ({
  online: t('common.online'),
  stale: t('agents.stale'),
  offline: t('common.offline'),
  unknown: t('home.typeUnknown'),
}))

const activeFilterChips = computed(() => {
  const chips = []

  if (search.value) {
    chips.push({ key: 'search', label: t('agents.chipSearch', { q: search.value }), clear: () => clearSearch() })
  }
  if (status.value !== 'all') {
    chips.push({ key: 'status', label: STATUS_LABELS.value[status.value] || status.value, clear: () => (status.value = 'all') })
  }
  if (connectivityStatus.value) {
    chips.push({
      key: 'connectivity',
      label: CONNECTIVITY_FILTER_LABELS.value[connectivityStatus.value] || connectivityStatus.value,
      clear: () => (connectivityStatus.value = ''),
    })
  }
  if (hasManagerChannel.value) {
    chips.push({
      key: 'manager',
      label: hasManagerChannel.value === 'true' ? t('agents.hasManager') : t('agents.noManager'),
      clear: () => (hasManagerChannel.value = ''),
    })
  }
  for (const g of deploymentGroup.value) {
    chips.push({ key: `dg-${g}`, label: t('agents.chipGroup', { name: g }), clear: () => (deploymentGroup.value = deploymentGroup.value.filter((v) => v !== g)) })
  }
  for (const o of os.value) {
    chips.push({ key: `os-${o}`, label: t('agents.chipOs', { name: o }), clear: () => (os.value = os.value.filter((v) => v !== o)) })
  }
  for (const v of version.value) {
    chips.push({ key: `ver-${v}`, label: t('agents.chipVersion', { name: v }), clear: () => (version.value = version.value.filter((x) => x !== v)) })
  }
  for (const d of department.value) {
    chips.push({ key: `dep-${d}`, label: t('agents.chipDepartment', { name: d }), clear: () => (department.value = department.value.filter((v) => v !== d)) })
  }

  const boolFlags = [
    ['antivirusInactive', antivirusInactive, t('agents.chipNoAntivirus')],
    ['firewallInactive', firewallInactive, t('agents.chipNoFirewall')],
    ['windowsUpdateInactive', windowsUpdateInactive, t('agents.chipWuDisabled')],
    ['agentOfflineIpOnline', agentOfflineIpOnline, t('agents.chipPossibleFault')],
    ['serviceFilesMismatch', serviceFilesMismatch, t('agents.chipMismatchedFiles')],
    ['processKillExempt', processKillExempt, t('agents.processKillExempt')],
    ['deploymentGroupOsOverlap', deploymentGroupOsOverlap, t('agents.chipOsOverlap')],
    ['noDeploymentGroup', noDeploymentGroup, t('agents.noDeploymentGroup')],
    ['trustedRootCertInstalled', trustedRootCertInstalled, t('agents.hasTrustedRoot')],
    ['intermediateCertInstalled', intermediateCertInstalled, t('agents.hasIntermediate')],
    ['secureDnsDisabled', secureDnsDisabled, t('agents.secureDnsDisabledOpt')],
  ]
  for (const [key, ref_, label] of boolFlags) {
    if (ref_.value) chips.push({ key, label, clear: () => (ref_.value = '') })
  }

  return chips
})

function clearAllFilters() {
  search.value = ''
  searchInput.value = ''
  status.value = 'all'
  clearDetailedFilters()
}

let searchT = null

async function fetchFilterOptions() {
  try {
    const res = await fetchWithAuth(`/api/protected/agents/filter-options?site=${site.value}`)
    if (!res.ok) throw new Error()
    const data = await res.json()
    osOptions.value = data.os || []
    osArchitectureOptions.value = data.osArchitecture || []
    versionOptions.value = data.version || []
    managerVersionOptions.value = data.managerVersion || []
    departmentOptions.value = data.department || []
    deploymentGroupOptions.value = data.deploymentGroups || []
  } catch (e) {
    console.error('Neuspešno dohvatanje opcija filtera', e)
  }
}

function clearDetailedFilters() {
  connectivityStatus.value = ''
  deploymentGroup.value = []
  os.value = []
  osArchitecture.value = ''
  version.value = []
  versionMode.value = 'eq'
  managerVersion.value = []
  managerVersionMode.value = 'eq'
  department.value = []
  enrolledFrom.value = ''
  enrolledTo.value = ''
  heartbeatFrom.value = ''
  heartbeatTo.value = ''
  antivirusInactive.value = ''
  firewallInactive.value = ''
  windowsUpdateInactive.value = ''
  agentOfflineIpOnline.value = ''
  serviceFilesMismatch.value = ''
  processKillExempt.value = ''
  deploymentGroupOsOverlap.value = ''
  noDeploymentGroup.value = ''
  hasManagerChannel.value = ''
  trustedRootCertInstalled.value = ''
  intermediateCertInstalled.value = ''
  secureDnsDisabled.value = ''
}

// Deljeno između fetchData() (dodaje page/limit) i selectAllMatching()
// (šalje na /agents/ids bez page/limit - svi id-jevi koji odgovaraju
// filterima, ne samo trenutna strana) - isti set filtera na oba mesta.
function buildFilterParams() {
  const params = new URLSearchParams({ search: search.value, status: status.value, site: site.value })
  if (connectivityStatus.value) params.set('connectivityStatus', connectivityStatus.value)
  deploymentGroup.value.forEach((v) => params.append('deploymentGroup', v))
  os.value.forEach((v) => params.append('os', v))
  if (osArchitecture.value) params.set('osArchitecture', osArchitecture.value)
  if (version.value.length) {
    const key = versionMode.value === 'neq' ? 'versionNot' : 'version'
    version.value.forEach((v) => params.append(key, v))
  }
  if (managerVersion.value.length) {
    const key = managerVersionMode.value === 'neq' ? 'managerVersionNot' : 'managerVersion'
    managerVersion.value.forEach((v) => params.append(key, v))
  }
  department.value.forEach((v) => params.append('department', v))
  if (enrolledFrom.value) params.set('enrolledFrom', enrolledFrom.value)
  if (enrolledTo.value) params.set('enrolledTo', enrolledTo.value)
  if (heartbeatFrom.value) params.set('heartbeatFrom', heartbeatFrom.value)
  if (heartbeatTo.value) params.set('heartbeatTo', heartbeatTo.value)
  if (antivirusInactive.value) params.set('antivirusInactive', antivirusInactive.value)
  if (firewallInactive.value) params.set('firewallInactive', firewallInactive.value)
  if (windowsUpdateInactive.value) params.set('windowsUpdateInactive', windowsUpdateInactive.value)
  if (agentOfflineIpOnline.value) params.set('agentOfflineIpOnline', agentOfflineIpOnline.value)
  if (serviceFilesMismatch.value) params.set('serviceFilesMismatch', serviceFilesMismatch.value)
  if (processKillExempt.value) params.set('processKillExempt', processKillExempt.value)
  if (deploymentGroupOsOverlap.value) params.set('deploymentGroupOsOverlap', deploymentGroupOsOverlap.value)
  if (noDeploymentGroup.value) params.set('noDeploymentGroup', noDeploymentGroup.value)
  if (hasManagerChannel.value) params.set('hasManagerChannel', hasManagerChannel.value)
  if (trustedRootCertInstalled.value) params.set('trustedRootCertInstalled', trustedRootCertInstalled.value)
  if (intermediateCertInstalled.value) params.set('intermediateCertInstalled', intermediateCertInstalled.value)
  if (secureDnsDisabled.value) params.set('secureDnsDisabled', secureDnsDisabled.value)
  return params
}

// Mreža (ping-based ipIsOnline) kaže da je računar gore, ali agent se ne
// javlja online - isti uslov kao backend agentOfflineIpOnline filter.
// Number(...) namerno - mysql2 vraća TINYINT(1) kao 0/1, ne pravi bool.
function isAgentMismatch(a) {
  return a.connectivityStatus !== 'online' && Number(a.ipIsOnline) === 1
}

// deploymentGroups dolazi kao GROUP_CONCAT string sa backend-a
// (agents.repo.js), ne niz - videti napomenu tamo.
function agentDeploymentGroups(a) {
  return a.deploymentGroups ? a.deploymentGroups.split(', ').filter(Boolean) : []
}

async function fetchData() {
  loading.value = true
  try {
    const params = buildFilterParams()
    params.set('page', page.value)
    params.set('limit', limit.value)

    const res = await fetchWithAuth(`/api/protected/agents?${params.toString()}`, {
      signal: getSignal(),
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()

    items.value = data.items || []
    total.value = data.total ?? 0
    totalPages.value = data.totalPages ?? 0
    applyServerPagination(data)
  } catch (e) {
    if (e?.name !== 'AbortError') {
      console.error('Neuspešno dohvatanje agenata', e)
    }
  } finally {
    loading.value = false
  }
}

// Tri lagana poziva na /agents/ids (isti endpoint kao selectAllMatching(),
// samo id-jevi bez page/limit) sa po jednim filterom prepisanim - daje
// TAČAN broj po celom filtriranom skupu, ne samo trenutnu stranicu. Ista
// cena kao selectAllMatching(), pucanje jednog poziva ne sme da obori
// ostale (Promise.allSettled).
async function fetchStatTiles() {
  const onlineParams = buildFilterParams()
  onlineParams.set('connectivityStatus', 'online')
  const offlineParams = buildFilterParams()
  offlineParams.set('connectivityStatus', 'offline')
  const managerParams = buildFilterParams()
  managerParams.set('hasManagerChannel', 'true')

  const [onlineRes, offlineRes, managerRes] = await Promise.allSettled([
    fetchWithAuth(`/api/protected/agents/ids?${onlineParams.toString()}`),
    fetchWithAuth(`/api/protected/agents/ids?${offlineParams.toString()}`),
    fetchWithAuth(`/api/protected/agents/ids?${managerParams.toString()}`),
  ])

  async function countFrom(settled) {
    if (settled.status !== 'fulfilled' || !settled.value.ok) return null
    const data = await settled.value.json()
    return (data.ids || []).length
  }

  const [onlineCount, offlineCount, managerCount] = await Promise.all([
    countFrom(onlineRes),
    countFrom(offlineRes),
    countFrom(managerRes),
  ])

  if (onlineCount !== null) statOnline.value = onlineCount
  if (offlineCount !== null) statOffline.value = offlineCount
  if (managerCount !== null) statManagerCoverage.value = managerCount
}

watch(search, (value) => {
  searchInput.value = value
})

const onSearchInput = () => {
  clearTimeout(searchT)
  searchT = setTimeout(() => {
    search.value = searchInput.value
  }, 300)
}
const clearSearch = () => {
  searchInput.value = ''
  onSearchInput()
}

async function copy(text) {
  await copyToClipboard(text, t('agents.agentIdCopied'))
}

async function confirmRevoke(a) {
  const ok = await askConfirm(t('agents.confirmRevokeMessage', { name: a.hostname || a.agentUid }), {
    title: t('agents.confirmRevokeTitle'),
  })
  if (!ok) return

  try {
    const res = await fetchWithAuth(`/api/protected/agents/${a.id}/revoke`, { method: 'POST' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    await fetchData()
    showToast(t('agents.revoked'))
  } catch (e) {
    console.error(e)
    showToast(t('agents.errorRevoke'), { kind: 'error', duration: 3000 })
  }
}

// Selekcija za batch komande - samo trenutno prikazana (paginirana) strana,
// ne prelazi kroz stranice automatski.
const selectedIds = ref(new Set())
const allVisibleSelected = computed(
  () => items.value.length > 0 && items.value.every((a) => selectedIds.value.has(a.id)),
)

function toggleSelect(id) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function toggleSelectAllVisible() {
  if (allVisibleSelected.value) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(items.value.map((a) => a.id))
  }
}

function clearSelection() {
  selectedIds.value = new Set()
}

const selectingAllMatching = ref(false)

async function selectAllMatching() {
  selectingAllMatching.value = true
  try {
    const params = buildFilterParams()
    const res = await fetchWithAuth(`/api/protected/agents/ids?${params.toString()}`)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    selectedIds.value = new Set(data.ids || [])
  } catch (e) {
    console.error('Neuspešno dohvatanje id-jeva po filteru', e)
    showToast(t('agents.errorSelectAll'), { kind: 'error', duration: 3000 })
  } finally {
    selectingAllMatching.value = false
  }
}

const batchForm = ref({ commandType: 'collect_inventory', serviceName: '', script: '' })
const isBatchServiceCommand = computed(() => SERVICE_COMMANDS.has(batchForm.value.commandType))
const batchSelectedPresetId = ref('')
const batchOnlyOnline = ref(false)
const sendingBatch = ref(false)

function applyBatchPreset() {
  const preset = POWERSHELL_PRESETS.find((p) => p.id === batchSelectedPresetId.value)
  batchForm.value.script = preset ? preset.script : ''
}

async function sendBatchJob() {
  const payload = {}
  if (isBatchServiceCommand.value) {
    if (!batchForm.value.serviceName.trim()) {
      showToast(t('agents.errorServiceNameRequired'), { kind: 'error', duration: 3000 })
      return
    }
    payload.serviceName = batchForm.value.serviceName.trim()
  }
  if (batchForm.value.commandType === 'run_powershell_script') {
    if (!batchForm.value.script.trim()) {
      showToast(t('agents.errorScriptRequired'), { kind: 'error', duration: 3000 })
      return
    }
    payload.script = batchForm.value.script.trim()
  }

  const ok = await askConfirm(
    t('agents.confirmSendBatch', { command: COMMAND_LABELS[batchForm.value.commandType], count: selectedIds.value.size }),
    { title: t('agents.batchCommandTitle') },
  )
  if (!ok) return

  sendingBatch.value = true
  try {
    const res = await fetchWithAuth('/api/protected/agents/jobs/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commandType: batchForm.value.commandType,
        payload,
        agentIds: [...selectedIds.value],
        onlyOnline: batchOnlyOnline.value,
      }),
    })
    if (!res.ok) throw new Error(await parseError(res, t('agents.errorSendBatch')))
    const data = await res.json()

    const parts = [t('agents.sentToCount', { count: data.created.length })]
    if (data.skipped.length) parts.push(t('agents.skippedCount', { count: data.skipped.length }))
    showToast(parts.join(', '))

    clearSelection()
    if (data.batchId) {
      router.push(`/agent-batches/${data.batchId}`)
    }
  } catch (e) {
    console.error(e)
    showToast(e?.message || t('agents.errorSendBatch'), { kind: 'error', duration: 3000 })
  } finally {
    sendingBatch.value = false
  }
}

const massDeploymentGroup = ref('')
const assigningDeploymentGroup = ref(false)

async function assignDeploymentGroupToSelected() {
  const groupName = massDeploymentGroup.value
  if (!groupName) return

  const ok = await askConfirm(
    t('agents.confirmAssignGroup', { group: groupName, count: selectedIds.value.size }),
    { title: t('agents.massAssignTitle') },
  )
  if (!ok) return

  assigningDeploymentGroup.value = true
  try {
    const res = await fetchWithAuth('/api/protected/agents/deployment-groups/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentIds: [...selectedIds.value],
        groupName,
      }),
    })
    if (!res.ok) throw new Error(await parseError(res, t('agents.errorAssignGroup')))
    const data = await res.json()

    const parts = [t('agents.assignedToCount', { count: data.updated.length })]
    if (data.skipped.length) parts.push(t('agents.skippedCount', { count: data.skipped.length }))
    showToast(parts.join(', '))

    massDeploymentGroup.value = ''
    clearSelection()
    fetchData()
  } catch (e) {
    console.error(e)
    showToast(e?.message || t('agents.errorAssignGroup'), { kind: 'error', duration: 3000 })
  } finally {
    assigningDeploymentGroup.value = false
  }
}

onBeforeUnmount(() => {
  abort()
  clearTimeout(searchT)
})

// "Ponovi sa novom komandom" sa BatchJobDetailView.vue - preuzima ciljane
// agente iz TOG batch-a (svež upit, ne stara snimljena lista) i predpuni
// formu njegovom komandom kao polaznu tačku, ali ostaje potpuno izmenljivo
// pre slanja (ovo NIJE "pošalji isti batch ponovo" - selekcija agenata je
// ista, komanda ne mora biti). Query param se čisti posle čitanja da
// osvežavanje strane ne ponavlja selekciju iznova.
async function loadRepeatBatch(batchId) {
  try {
    const res = await fetchWithAuth(`/api/protected/agents/jobs/batch/${batchId}`)
    if (!res.ok) throw new Error(await parseError(res, t('agents.errorLoadRepeatBatch')))
    const data = await res.json()

    selectedIds.value = new Set((data.items || []).map((i) => i.agentId))
    if (data.batch?.commandType) {
      batchForm.value.commandType = data.batch.commandType
    }
    const firstPayload = data.items?.[0]?.payload
    if (firstPayload) {
      batchForm.value.serviceName = firstPayload.serviceName || ''
      batchForm.value.script = firstPayload.script || ''
    }
    showToast(t('agents.selectedFromPreviousBatch', { count: selectedIds.value.size }))
  } catch (e) {
    console.error('Neuspešno učitavanje batch-a za ponavljanje', e)
    showToast(t('agents.errorLoadBatchAgents'), { kind: 'error', duration: 3000 })
  } finally {
    const { repeatBatchId, ...restQuery } = route.query
    router.replace({ query: restQuery })
  }
}

// Dolazak sa PDSU strane - "selektuj agente koji imaju ovaj neželjeni
// program/servis/drajver" (PDSUFlagged.vue). Za razliku od repeatBatchId,
// ovde su id-jevi već poznati (server ih je izračunao preko flagged
// pattern-a), pa se samo direktno postave kao selekcija - nema dodatnog
// fetch-a agenata, i oni se prikazuju izabrani i kad nisu na trenutnoj
// stranici liste (isti obrazac kao selectAllMatching).
function loadPreselectedAgentIds(raw) {
  const ids = String(raw)
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v > 0)
  if (ids.length) {
    selectedIds.value = new Set(ids)
    showToast(t('agents.selectedFromFlagged', { count: ids.length }))
  }
  const { agentIds, ...restQuery } = route.query
  router.replace({ query: restQuery })
}

onMounted(() => {
  fetchFilterOptions()
  fetchData()
  fetchStatTiles()
  if (route.query.repeatBatchId) {
    loadRepeatBatch(route.query.repeatBatchId)
  } else if (route.query.agentIds) {
    loadPreselectedAgentIds(route.query.agentIds)
  }
})
</script>
