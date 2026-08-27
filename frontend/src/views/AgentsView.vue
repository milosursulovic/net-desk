<template>
  <div class="space-y-5">
    <div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">Agenti</h1>
        <p class="mt-0.5 text-sm text-ink-muted">Pregled i upravljanje registrovanim agentima</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <AppButton variant="secondary" to="/computers-without-agent">Računari bez agenta</AppButton>
        <AppButton variant="secondary" to="/agent-releases">Verzije agenta</AppButton>
        <AppButton variant="secondary" to="/agent-batches">Batch komande</AppButton>
        <AppButton variant="secondary" to="/deployment-groups">Deployment grupe</AppButton>
        <AppButton v-if="isAdmin" variant="secondary" to="/downloads-folder">Deljeni fajlovi</AppButton>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile label="Ukupno (filtrirano)" :value="total" tone="accent" />
      <StatTile label="Online" :value="statOnline" tone="good" :proportion="total ? statOnline / total : 0" />
      <StatTile label="Offline" :value="statOffline" tone="bad" :proportion="total ? statOffline / total : 0" />
      <StatTile
        label="Manager pokrivenost"
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
            placeholder="Pretraga po hostname-u ili agent id-u..."
            class="app-input w-full pr-10"
            aria-label="Pretraga agenata" />
          <button v-if="searchInput" @click="clearSearch"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
            aria-label="Obriši pretragu">
            <NavIcon name="x" />
          </button>
        </div>

        <select v-model="status" class="app-input w-full sm:w-48" aria-label="Filter po statusu">
          <option value="all">Svi statusi</option>
          <option value="active">Aktivni</option>
          <option value="revoked">Povučeni</option>
        </select>

        <button
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-sunken sm:hidden"
          @click="detailedFiltersOpen = !detailedFiltersOpen"
        >
          Detaljni filteri
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
          Obriši sve
        </button>
      </div>

      <!-- Detaljni filteri - skupljeno na mobilnom po difoltu -->
      <div :class="detailedFiltersOpen ? 'block' : 'hidden sm:block'">
        <div class="flex flex-wrap items-center gap-2">
          <select v-model="connectivityStatus" class="app-input w-auto max-w-full min-w-0 truncate" aria-label="Filter po konekciji">
            <option value="">Sve konekcije</option>
            <option value="online">Online</option>
            <option value="stale">Neaktivan</option>
            <option value="offline">Offline</option>
            <option value="unknown">Nepoznato</option>
          </select>

          <select
            v-model="hasManagerChannel"
            class="app-input w-auto max-w-full min-w-0 truncate"
            aria-label="Filter po Manager kanalu"
            title="Da li je novi (nezavisni HTTP) Netdesk Agent Manager kanal registrovan na ovoj mašini"
          >
            <option value="">Svi (Manager kanal)</option>
            <option value="true">Ima novi Manager</option>
            <option value="false">Nema novi Manager</option>
          </select>

          <select
            v-model="trustedRootCertInstalled"
            class="app-input w-auto max-w-full min-w-0 truncate"
            aria-label="Filter po Trusted Root sertifikatu"
            title="cert_CA_SSL_DECRIPT_BOR.crt u Local Machine Trusted Root store-u"
          >
            <option value="">Svi (Trusted Root sertifikat)</option>
            <option value="true">Ima Trusted Root sertifikat</option>
            <option value="false">Nema Trusted Root sertifikat</option>
          </select>

          <select
            v-model="intermediateCertInstalled"
            class="app-input w-auto max-w-full min-w-0 truncate"
            aria-label="Filter po Intermediate sertifikatu"
            title="cert_SSL_TRUST.crt u Local Machine Intermediate store-u"
          >
            <option value="">Svi (Intermediate sertifikat)</option>
            <option value="true">Ima Intermediate sertifikat</option>
            <option value="false">Nema Intermediate sertifikat</option>
          </select>

          <select
            v-model="secureDnsDisabled"
            class="app-input w-auto max-w-full min-w-0 truncate"
            aria-label="Filter po Secure DNS stanju"
            title="Da li je Secure DNS (DoH) isključen preko registry politike na Chrome/Edge/Brave/Firefox"
          >
            <option value="">Svi (Secure DNS)</option>
            <option value="true">Secure DNS isključen</option>
            <option value="false">Secure DNS uključen/nepoznat</option>
          </select>

          <MultiSelect
            v-model="deploymentGroup"
            :options="deploymentGroupOptions"
            placeholder="Sve deployment grupe"
            class="w-auto max-w-48 min-w-0"
          />

          <MultiSelect
            v-model="os"
            :options="osOptions"
            placeholder="Svi OS"
            class="w-auto max-w-40 min-w-0"
          />

          <select v-model="osArchitecture" class="app-input w-auto max-w-full min-w-0 truncate" aria-label="Filter arhitekture procesora">
            <option value="">Sve arhitekture</option>
            <option v-for="a in osArchitectureOptions" :key="a" :value="a">{{ a }}</option>
          </select>

          <MultiSelect
            v-model="version"
            :options="versionOptions"
            placeholder="Sve verzije"
            class="w-auto max-w-40 min-w-0"
          />

          <label v-if="version.length" class="inline-flex items-center gap-1.5 text-sm text-ink-secondary">
            <input
              type="checkbox"
              :checked="versionMode === 'neq'"
              @change="versionMode = versionMode === 'neq' ? 'eq' : 'neq'"
            />
            Isključi (prikaži zaostale)
          </label>

          <MultiSelect
            v-model="managerVersion"
            :options="managerVersionOptions"
            placeholder="Sve Manager verzije"
            class="w-auto max-w-40 min-w-0"
            title="Verzija Netdesk Agent Manager-a (nezavisni HTTP kanal), ne agentova verzija"
          />

          <label v-if="managerVersion.length" class="inline-flex items-center gap-1.5 text-sm text-ink-secondary">
            <input
              type="checkbox"
              :checked="managerVersionMode === 'neq'"
              @change="managerVersionMode = managerVersionMode === 'neq' ? 'eq' : 'neq'"
            />
            Isključi (prikaži zaostale)
          </label>

          <MultiSelect
            v-model="department"
            :options="departmentOptions"
            placeholder="Sva odeljenja"
            class="w-auto max-w-40 min-w-0"
          />

          <label class="inline-flex items-center gap-1.5 text-sm text-ink-secondary">
            <input
              type="checkbox"
              :checked="antivirusInactive === 'true'"
              @change="antivirusInactive = antivirusInactive === 'true' ? '' : 'true'"
            />
            Bez aktivnog antivirusa
          </label>

          <label class="inline-flex items-center gap-1.5 text-sm text-ink-secondary">
            <input
              type="checkbox"
              :checked="firewallInactive === 'true'"
              @change="firewallInactive = firewallInactive === 'true' ? '' : 'true'"
            />
            Bez aktivnog firewall-a
          </label>

          <label class="inline-flex items-center gap-1.5 text-sm text-ink-secondary">
            <input
              type="checkbox"
              :checked="windowsUpdateInactive === 'true'"
              @change="windowsUpdateInactive = windowsUpdateInactive === 'true' ? '' : 'true'"
            />
            Isključen Windows Update
          </label>

          <label class="inline-flex items-center gap-1.5 text-sm text-ink-secondary" title="Računar je dostupan na mreži, ali agent se ne javlja online - moguć kvar agenta">
            <input
              type="checkbox"
              :checked="agentOfflineIpOnline === 'true'"
              @change="agentOfflineIpOnline = agentOfflineIpOnline === 'true' ? '' : 'true'"
            />
            Agent offline, računar online (moguć kvar)
          </label>

          <label class="inline-flex items-center gap-1.5 text-sm text-ink-secondary" title="Instalirani fajlovi u Service folderu se ne poklapaju sa release-om za prijavljenu verziju agenta">
            <input
              type="checkbox"
              :checked="serviceFilesMismatch === 'true'"
              @change="serviceFilesMismatch = serviceFilesMismatch === 'true' ? '' : 'true'"
            />
            Neusklađeni fajlovi agenta
          </label>

          <label class="inline-flex items-center gap-1.5 text-sm text-ink-secondary" title="Agent i dalje detektuje/loguje procese sa watchlist-e, ali ih nikad ne ubija čak i kad je globalno uključeno">
            <input
              type="checkbox"
              :checked="processKillExempt === 'true'"
              @change="processKillExempt = processKillExempt === 'true' ? '' : 'true'"
            />
            Izuzet od ubijanja procesa
          </label>

          <label class="inline-flex items-center gap-1.5 text-sm text-ink-secondary" title="Agent je istovremeno u dve ili više OS deployment grupa (win7/win10/win11/winsrv) - obično greška u unosu">
            <input
              type="checkbox"
              :checked="deploymentGroupOsOverlap === 'true'"
              @change="deploymentGroupOsOverlap = deploymentGroupOsOverlap === 'true' ? '' : 'true'"
            />
            Preklapanje OS grupa (win7/win10/win11/winsrv)
          </label>

          <label class="inline-flex items-center gap-1.5 text-sm text-ink-secondary">
            <input
              type="checkbox"
              :checked="noDeploymentGroup === 'true'"
              @change="noDeploymentGroup = noDeploymentGroup === 'true' ? '' : 'true'"
            />
            Bez ijedne deployment grupe
          </label>
        </div>

        <div class="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <label class="block text-xs text-ink-muted mb-1" for="enrolledFrom">Enroll od</label>
            <input id="enrolledFrom" v-model="enrolledFrom" type="date" class="app-input w-auto text-sm" />
          </div>
          <div>
            <label class="block text-xs text-ink-muted mb-1" for="enrolledTo">Enroll do</label>
            <input id="enrolledTo" v-model="enrolledTo" type="date" class="app-input w-auto text-sm" />
          </div>
          <div>
            <label class="block text-xs text-ink-muted mb-1" for="heartbeatFrom">Heartbeat od</label>
            <input id="heartbeatFrom" v-model="heartbeatFrom" type="date" class="app-input w-auto text-sm" />
          </div>
          <div>
            <label class="block text-xs text-ink-muted mb-1" for="heartbeatTo">Heartbeat do</label>
            <input id="heartbeatTo" v-model="heartbeatTo" type="date" class="app-input w-auto text-sm" />
          </div>
          <AppButton variant="neutral" @click="clearDetailedFilters">Poništi filtere</AppButton>
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

      <p class="text-sm text-ink-muted">Prikazano {{ items.length }} od {{ total }} agenata</p>

      <div v-if="items.length" class="flex flex-wrap items-center gap-3">
        <label class="flex items-center gap-2 text-sm text-ink-secondary">
          <input type="checkbox" :checked="allVisibleSelected" @change="toggleSelectAllVisible" />
          Selektuj sve prikazane ({{ selectedIds.size }} izabrano)
        </label>
        <button
          type="button"
          class="text-sm text-accent hover:underline disabled:opacity-50 disabled:no-underline"
          :disabled="selectingAllMatching"
          @click="selectAllMatching"
        >
          {{ selectingAllMatching ? 'Selektujem…' : `Selektuj sve po filteru (${total})` }}
        </button>
      </div>
    </div>

    <!-- Batch komanda - vidljivo samo kad je bar 1 agent selektovan -->
    <div v-if="selectedIds.size" class="rounded-xl border border-info/30 bg-info-subtle p-4 space-y-3">
      <div class="font-medium text-info">
        Pošalji komandu na {{ selectedIds.size }} izabranih agenata
      </div>
      <div v-if="selectedIds.size > MAX_BATCH_AGENTS" class="text-sm text-bad">
        Batch komande podržavaju najviše {{ MAX_BATCH_AGENTS }} agenata odjednom - smanji selekciju
        (npr. suzi filter) pre slanja.
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="text-sm text-ink-secondary">Tip komande</label>
          <select v-model="batchForm.commandType" class="app-input w-full">
            <option v-for="c in COMMAND_TYPES" :key="c" :value="c">{{ COMMAND_LABELS[c] }}</option>
          </select>
        </div>
        <FormInput v-if="isBatchServiceCommand" v-model.trim="batchForm.serviceName" label="Naziv servisa" placeholder="Spooler" />
      </div>
      <label class="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" v-model="batchOnlyOnline" />
        Pošalji samo online agentima (preskoči offline/neaktivne)
      </label>
      <div v-if="batchForm.commandType === 'run_powershell_script'" class="space-y-2">
        <div>
          <label class="text-sm text-ink-secondary">Gotova skripta (opciono)</label>
          <select v-model="batchSelectedPresetId" class="app-input w-full" @change="applyBatchPreset">
            <option value="">— Prilagođena skripta —</option>
            <option v-for="p in POWERSHELL_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
        </div>
        <div>
          <label class="text-sm text-ink-secondary">PowerShell skripta</label>
          <textarea v-model="batchForm.script" rows="6" class="app-input w-full font-mono text-xs" placeholder="Get-Service | Where-Object ..."></textarea>
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <AppButton variant="neutral" @click="clearSelection">Poništi selekciju</AppButton>
        <AppButton
          variant="success"
          :disabled="sendingBatch || selectedIds.size > MAX_BATCH_AGENTS"
          @click="sendBatchJob"
        >
          {{ sendingBatch ? 'Šaljem…' : `Pošalji na ${selectedIds.size} agenata` }}
        </AppButton>
      </div>
    </div>

    <!-- Masovna dodela deployment grupe - admin-only, isto kao pojedinačna
         dodela na Agent Detail strani. -->
    <div v-if="selectedIds.size && isAdmin" class="rounded-xl border border-accent/30 bg-accent-subtle p-4 space-y-3">
      <div class="font-medium text-accent-emphasis">
        Dodeli deployment grupu na {{ selectedIds.size }} izabranih agenata
      </div>
      <div v-if="selectedIds.size > MAX_BATCH_AGENTS" class="text-sm text-bad">
        Podržava najviše {{ MAX_BATCH_AGENTS }} agenata odjednom - smanji selekciju pre slanja.
      </div>
      <div class="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div class="flex-1 min-w-0">
          <label class="text-sm text-ink-secondary">Deployment grupa</label>
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
          {{ assigningDeploymentGroup ? 'Dodeljujem…' : `Dodeli na ${selectedIds.size} agenata` }}
        </AppButton>
      </div>
    </div>

    <div class="min-h-50">
      <div v-if="loading" class="table-shell p-4">
        <div v-for="n in 6" :key="n" class="animate-pulse border-b border-line py-3 last:border-0">
          <div class="mb-2 h-4 w-1/3 rounded bg-surface-sunken"></div>
          <div class="h-3 w-1/4 rounded bg-surface-sunken"></div>
        </div>
      </div>

      <div v-else-if="!items.length" class="table-shell p-8 text-center text-ink-muted">
        Nema agenata za zadate filtere.
      </div>

      <div v-else class="table-shell">
        <div class="overflow-x-auto">
          <table class="w-full min-w-275 border-collapse text-sm">
            <thead>
              <tr class="table-head-row">
                <th class="px-3 py-2 text-left"></th>
                <th class="px-3 py-2 text-left">Računar</th>
                <th class="px-3 py-2 text-left">Status</th>
                <th class="px-3 py-2 text-left">Konekcija</th>
                <th class="px-3 py-2 text-left">OS</th>
                <th class="px-3 py-2 text-left">Verzija</th>
                <th class="px-3 py-2 text-left">Poslednji heartbeat</th>
                <th class="px-3 py-2 text-left">IP</th>
                <th class="px-3 py-2 text-left">Enroll</th>
                <th class="px-3 py-2 text-left">Deployment</th>
                <th class="px-3 py-2 text-left">Nalazi</th>
                <th class="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in items" :key="a.id" class="group border-b border-line last:border-0 hover:bg-surface-sunken">
                <td class="px-3 py-2.5 align-top">
                  <input
                    type="checkbox"
                    class="mt-1"
                    :checked="selectedIds.has(a.id)"
                    @change="toggleSelect(a.id)"
                    aria-label="Selektuj agenta"
                  />
                </td>
                <td class="px-3 py-2.5 align-top">
                  <RouterLink :to="`/agents/${a.id}`" class="block truncate font-semibold text-ink hover:underline">
                    {{ a.hostname || '—' }}
                  </RouterLink>
                  <div class="mt-0.5 flex items-center gap-1 font-mono text-xs text-ink-muted">
                    <span class="truncate">{{ a.agentUid }}</span>
                    <button @click="copy(a.agentUid)" class="shrink-0 text-ink-muted hover:text-ink" aria-label="Kopiraj agent id">
                      <NavIcon name="copy" />
                    </button>
                  </div>
                </td>
                <td class="px-3 py-2.5 align-top">
                  <StatusPill :status="agentStatusTone(a.status)" :label="agentStatusLabel(a.status)" />
                </td>
                <td class="px-3 py-2.5 align-top">
                  <StatusPill :status="connectivityTone(a.connectivityStatus)" :label="connectivityLabel(a.connectivityStatus)" />
                </td>
                <td class="px-3 py-2.5 align-top text-ink-secondary">{{ a.osCaption || '—' }}</td>
                <td class="px-3 py-2.5 align-top">
                  <div class="flex items-center gap-1.5">
                    <span class="font-mono tabular-nums text-ink-secondary">{{ a.agentVersion || '—' }}</span>
                    <span
                      v-if="a.managerChannelStatus"
                      class="inline-flex h-2 w-2 shrink-0 rounded-full bg-info"
                      :title="`Novi (nezavisni) Manager kanal registrovan - ${a.managerChannelStatus}`"
                    ></span>
                  </div>
                </td>
                <td class="px-3 py-2.5 align-top text-ink-secondary">
                  {{ fmtRelative(a.lastHeartbeatAt) }}
                  <span class="mt-0.5 block font-mono text-xs text-ink-muted">{{ fmtDate(a.lastHeartbeatAt) }}</span>
                </td>
                <td class="px-3 py-2.5 align-top font-mono text-ink-secondary">{{ a.lastIp || '—' }}</td>
                <td class="px-3 py-2.5 align-top font-mono text-xs text-ink-muted">{{ fmtDate(a.enrolledAt) }}</td>
                <td class="px-3 py-2.5 align-top">
                  <div v-if="agentDeploymentGroups(a).length" class="flex flex-wrap gap-1">
                    <TagChip v-for="g in agentDeploymentGroups(a)" :key="g" :label="g" />
                  </div>
                  <span v-else class="text-ink-muted">—</span>
                  <RouterLink v-if="a.ipEntryId" :to="`/ip/${a.ipEntryId}/meta`" class="mt-1 block text-xs text-accent hover:underline">
                    Otvori računar
                  </RouterLink>
                </td>
                <td class="px-3 py-2.5 align-top">
                  <div
                    v-if="a.antivirusStatus !== 'enabled' || a.firewallStatus !== 'enabled' || a.windowsUpdateStatus !== 'Running' || isAgentMismatch(a) || a.serviceFilesMismatch"
                    class="flex flex-wrap gap-1"
                  >
                    <span v-if="a.antivirusStatus !== 'enabled'" title="Antivirus nije potvrđen kao aktivan">
                      <StatusPill status="bad" label="Antivirus" :dot="false" />
                    </span>
                    <span v-if="a.firewallStatus !== 'enabled'" title="Firewall nije potvrđen kao aktivan">
                      <StatusPill status="bad" label="Firewall" :dot="false" />
                    </span>
                    <span v-if="a.windowsUpdateStatus !== 'Running'" title="Windows Update servis nije potvrđen kao pokrenut">
                      <StatusPill status="bad" label="WU" :dot="false" />
                    </span>
                    <span v-if="isAgentMismatch(a)" title="Računar je dostupan na mreži, ali agent se ne javlja online - moguć kvar agenta">
                      <StatusPill status="warn" label="Moguć kvar" :dot="false" />
                    </span>
                    <span
                      v-if="a.serviceFilesMismatch"
                      :title="a.serviceFilesMismatchDetails || 'Instalirani fajlovi u Service folderu ne odgovaraju release-u za prijavljenu verziju'"
                    >
                      <StatusPill status="warn" label="Fajlovi" :dot="false" />
                    </span>
                  </div>
                  <span v-else class="text-ink-muted">—</span>
                </td>
                <td class="px-3 py-2.5 align-top text-right">
                  <div class="table-row-actions">
                    <button v-if="a.status === 'active'" @click="confirmRevoke(a)" class="rounded p-1 text-bad hover:bg-surface-sunken" title="Povuci pristup">
                      <NavIcon name="ban" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
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

const fmtDate = (d) => formatDate(d, 'sr-RS')
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
const STATUS_LABELS = { active: 'Aktivni', revoked: 'Povučeni' }
const CONNECTIVITY_FILTER_LABELS = { online: 'Online', stale: 'Neaktivan', offline: 'Offline', unknown: 'Nepoznato' }

const activeFilterChips = computed(() => {
  const chips = []

  if (search.value) {
    chips.push({ key: 'search', label: `Pretraga: "${search.value}"`, clear: () => clearSearch() })
  }
  if (status.value !== 'all') {
    chips.push({ key: 'status', label: STATUS_LABELS[status.value] || status.value, clear: () => (status.value = 'all') })
  }
  if (connectivityStatus.value) {
    chips.push({
      key: 'connectivity',
      label: CONNECTIVITY_FILTER_LABELS[connectivityStatus.value] || connectivityStatus.value,
      clear: () => (connectivityStatus.value = ''),
    })
  }
  if (hasManagerChannel.value) {
    chips.push({
      key: 'manager',
      label: hasManagerChannel.value === 'true' ? 'Ima novi Manager' : 'Nema novi Manager',
      clear: () => (hasManagerChannel.value = ''),
    })
  }
  for (const g of deploymentGroup.value) {
    chips.push({ key: `dg-${g}`, label: `Grupa: ${g}`, clear: () => (deploymentGroup.value = deploymentGroup.value.filter((v) => v !== g)) })
  }
  for (const o of os.value) {
    chips.push({ key: `os-${o}`, label: `OS: ${o}`, clear: () => (os.value = os.value.filter((v) => v !== o)) })
  }
  for (const v of version.value) {
    chips.push({ key: `ver-${v}`, label: `Verzija: ${v}`, clear: () => (version.value = version.value.filter((x) => x !== v)) })
  }
  for (const d of department.value) {
    chips.push({ key: `dep-${d}`, label: `Odeljenje: ${d}`, clear: () => (department.value = department.value.filter((v) => v !== d)) })
  }

  const boolFlags = [
    ['antivirusInactive', antivirusInactive, 'Bez antivirusa'],
    ['firewallInactive', firewallInactive, 'Bez firewall-a'],
    ['windowsUpdateInactive', windowsUpdateInactive, 'WU isključen'],
    ['agentOfflineIpOnline', agentOfflineIpOnline, 'Moguć kvar agenta'],
    ['serviceFilesMismatch', serviceFilesMismatch, 'Neusklađeni fajlovi'],
    ['processKillExempt', processKillExempt, 'Izuzet od ubijanja procesa'],
    ['deploymentGroupOsOverlap', deploymentGroupOsOverlap, 'Preklapanje OS grupa'],
    ['noDeploymentGroup', noDeploymentGroup, 'Bez deployment grupe'],
    ['trustedRootCertInstalled', trustedRootCertInstalled, 'Trusted Root sertifikat'],
    ['intermediateCertInstalled', intermediateCertInstalled, 'Intermediate sertifikat'],
    ['secureDnsDisabled', secureDnsDisabled, 'Secure DNS isključen'],
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
  await copyToClipboard(text, 'Agent ID kopiran')
}

async function confirmRevoke(a) {
  const ok = await askConfirm(`Povući pristup agentu "${a.hostname || a.agentUid}"?`, {
    title: 'Povlačenje agenta',
  })
  if (!ok) return

  try {
    const res = await fetchWithAuth(`/api/protected/agents/${a.id}/revoke`, { method: 'POST' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    await fetchData()
    showToast('Agent povučen')
  } catch (e) {
    console.error(e)
    showToast('Greška pri povlačenju agenta', { kind: 'error', duration: 3000 })
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
    showToast('Greška pri selekciji svih agenata', { kind: 'error', duration: 3000 })
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
      showToast('Naziv servisa je obavezan', { kind: 'error', duration: 3000 })
      return
    }
    payload.serviceName = batchForm.value.serviceName.trim()
  }
  if (batchForm.value.commandType === 'run_powershell_script') {
    if (!batchForm.value.script.trim()) {
      showToast('Skripta je obavezna', { kind: 'error', duration: 3000 })
      return
    }
    payload.script = batchForm.value.script.trim()
  }

  const ok = await askConfirm(
    `Poslati "${COMMAND_LABELS[batchForm.value.commandType]}" na ${selectedIds.value.size} agenata?`,
    { title: 'Batch komanda' },
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
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri slanju batch komande'))
    const data = await res.json()

    const parts = [`Poslato na ${data.created.length} agenata`]
    if (data.skipped.length) parts.push(`preskočeno ${data.skipped.length}`)
    showToast(parts.join(', '))

    clearSelection()
    if (data.batchId) {
      router.push(`/agent-batches/${data.batchId}`)
    }
  } catch (e) {
    console.error(e)
    showToast(e?.message || 'Greška pri slanju batch komande', { kind: 'error', duration: 3000 })
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
    `Dodeliti deployment grupu "${groupName}" na ${selectedIds.value.size} agenata?`,
    { title: 'Masovna dodela deployment grupe' },
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
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri dodeli deployment grupe'))
    const data = await res.json()

    const parts = [`Dodeljeno na ${data.updated.length} agenata`]
    if (data.skipped.length) parts.push(`preskočeno ${data.skipped.length}`)
    showToast(parts.join(', '))

    massDeploymentGroup.value = ''
    clearSelection()
    fetchData()
  } catch (e) {
    console.error(e)
    showToast(e?.message || 'Greška pri dodeli deployment grupe', { kind: 'error', duration: 3000 })
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
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri učitavanju batch-a za ponavljanje'))
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
    showToast(`Selektovano ${selectedIds.value.size} agenata iz prethodnog batch-a - izmeni komandu po potrebi pre slanja.`)
  } catch (e) {
    console.error('Neuspešno učitavanje batch-a za ponavljanje', e)
    showToast('Greška pri učitavanju agenata iz batch-a', { kind: 'error', duration: 3000 })
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
    showToast(`Selektovano ${ids.length} agenata - podesi komandu i pošalji batch.`)
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
