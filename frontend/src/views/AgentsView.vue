<template>
  <div class="glass-container space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <h1 class="text-2xl font-bold text-slate-800">Netdesk Agenti</h1>
      <div class="flex flex-wrap gap-2">
        <AppButton variant="secondary" to="/computers-without-agent">Računari bez agenta</AppButton>
        <AppButton variant="secondary" to="/agent-releases">Verzije agenta</AppButton>
        <AppButton variant="secondary" to="/agent-batches">Batch komande</AppButton>
        <AppButton variant="secondary" to="/deployment-groups">Deployment grupe</AppButton>
        <AppButton v-if="isAdmin" variant="secondary" to="/downloads-folder">Deljeni fajlovi</AppButton>
      </div>
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
            class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label="Obriši pretragu">
            ✖️
          </button>
        </div>

        <select v-model="status" class="app-input w-full sm:w-48" aria-label="Filter po statusu">
          <option value="all">Svi statusi</option>
          <option value="active">Aktivni</option>
          <option value="revoked">Povučeni</option>
        </select>

        <button
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 sm:hidden"
          @click="detailedFiltersOpen = !detailedFiltersOpen"
        >
          Detaljni filteri
          <span
            v-if="activeDetailedFilterCount"
            class="rounded-full bg-blue-600 px-1.5 py-0.5 text-xs font-semibold text-white"
          >{{ activeDetailedFilterCount }}</span>
          <span class="text-xs">{{ detailedFiltersOpen ? '▲' : '▼' }}</span>
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
            v-model="remoteControlTier"
            class="app-input w-auto max-w-full min-w-0 truncate"
            aria-label="Filter po tier-u udaljenog upravljanja"
            title="Uživo prijavljen build agenta (enroll/heartbeat) - ne deployment grupa"
          >
            <option value="">Svi tier-ovi (RFB/WebRTC)</option>
            <option value="rfb_only">RFB-only (net452)</option>
            <option value="webrtc_capable">WebRTC-capable (net472)</option>
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

          <label v-if="version.length" class="inline-flex items-center gap-1.5 text-sm text-slate-600">
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

          <label v-if="managerVersion.length" class="inline-flex items-center gap-1.5 text-sm text-slate-600">
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

          <label class="inline-flex items-center gap-1.5 text-sm text-slate-600">
            <input
              type="checkbox"
              :checked="antivirusInactive === 'true'"
              @change="antivirusInactive = antivirusInactive === 'true' ? '' : 'true'"
            />
            Bez aktivnog antivirusa
          </label>

          <label class="inline-flex items-center gap-1.5 text-sm text-slate-600">
            <input
              type="checkbox"
              :checked="firewallInactive === 'true'"
              @change="firewallInactive = firewallInactive === 'true' ? '' : 'true'"
            />
            Bez aktivnog firewall-a
          </label>

          <label class="inline-flex items-center gap-1.5 text-sm text-slate-600">
            <input
              type="checkbox"
              :checked="windowsUpdateInactive === 'true'"
              @change="windowsUpdateInactive = windowsUpdateInactive === 'true' ? '' : 'true'"
            />
            Isključen Windows Update
          </label>

          <label class="inline-flex items-center gap-1.5 text-sm text-slate-600" title="Računar je dostupan na mreži, ali agent se ne javlja online - moguć kvar agenta">
            <input
              type="checkbox"
              :checked="agentOfflineIpOnline === 'true'"
              @change="agentOfflineIpOnline = agentOfflineIpOnline === 'true' ? '' : 'true'"
            />
            Agent offline, računar online (moguć kvar)
          </label>

          <label class="inline-flex items-center gap-1.5 text-sm text-slate-600" title="Instalirani fajlovi u Service folderu se ne poklapaju sa release-om za prijavljenu verziju agenta">
            <input
              type="checkbox"
              :checked="serviceFilesMismatch === 'true'"
              @change="serviceFilesMismatch = serviceFilesMismatch === 'true' ? '' : 'true'"
            />
            Neusklađeni fajlovi agenta
          </label>

          <label class="inline-flex items-center gap-1.5 text-sm text-slate-600" title="Agent i dalje detektuje/loguje procese sa watchlist-e, ali ih nikad ne ubija čak i kad je globalno uključeno">
            <input
              type="checkbox"
              :checked="processKillExempt === 'true'"
              @change="processKillExempt = processKillExempt === 'true' ? '' : 'true'"
            />
            Izuzet od ubijanja procesa
          </label>

          <label class="inline-flex items-center gap-1.5 text-sm text-slate-600" title="Agent je istovremeno u dve ili više OS deployment grupa (win7/win10/win11/winsrv) - obično greška u unosu">
            <input
              type="checkbox"
              :checked="deploymentGroupOsOverlap === 'true'"
              @change="deploymentGroupOsOverlap = deploymentGroupOsOverlap === 'true' ? '' : 'true'"
            />
            Preklapanje OS grupa (win7/win10/win11/winsrv)
          </label>

          <label class="inline-flex items-center gap-1.5 text-sm text-slate-600">
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
            <label class="block text-xs text-slate-500 mb-1" for="enrolledFrom">Enroll od</label>
            <input id="enrolledFrom" v-model="enrolledFrom" type="date" class="app-input w-auto text-sm" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1" for="enrolledTo">Enroll do</label>
            <input id="enrolledTo" v-model="enrolledTo" type="date" class="app-input w-auto text-sm" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1" for="heartbeatFrom">Heartbeat od</label>
            <input id="heartbeatFrom" v-model="heartbeatFrom" type="date" class="app-input w-auto text-sm" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1" for="heartbeatTo">Heartbeat do</label>
            <input id="heartbeatTo" v-model="heartbeatTo" type="date" class="app-input w-auto text-sm" />
          </div>
          <AppButton variant="neutral" @click="clearDetailedFilters">Poništi filtere</AppButton>
        </div>
      </div>

      <!-- Po strani i paginacija -->
      <div class="flex flex-wrap items-center gap-2">
        <label class="text-sm text-slate-600" for="pp">Po strani</label>
        <select id="pp" v-model.number="limit" class="app-input w-auto py-1.5 text-sm">
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>

        <span class="mx-1 hidden h-5 w-px bg-slate-200 sm:inline-block"></span>

        <button @click="prevPage" :disabled="page === 1 || loading"
          class="px-2 py-1 bg-white border rounded-lg disabled:opacity-50 hover:bg-slate-100" aria-label="Prethodna strana">
          ⬅️
        </button>
        <span class="text-sm text-slate-600">
          Strana {{ totalPages === 0 ? '0' : page }} / {{ totalPages }}
        </span>
        <button @click="nextPage({ total })" :disabled="page * limit >= total || loading"
          class="px-2 py-1 bg-white border rounded-lg disabled:opacity-50 hover:bg-slate-100" aria-label="Sledeća strana">
          ➡️
        </button>
      </div>

      <p class="text-sm text-slate-500">Prikazano {{ items.length }} od {{ total }} agenata</p>

      <div v-if="items.length" class="flex flex-wrap items-center gap-3">
        <label class="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" :checked="allVisibleSelected" @change="toggleSelectAllVisible" />
          Selektuj sve prikazane ({{ selectedIds.size }} izabrano)
        </label>
        <button
          type="button"
          class="text-sm text-blue-600 hover:underline disabled:opacity-50 disabled:no-underline"
          :disabled="selectingAllMatching"
          @click="selectAllMatching"
        >
          {{ selectingAllMatching ? 'Selektujem…' : `Selektuj sve po filteru (${total})` }}
        </button>
      </div>
    </div>

    <!-- Batch komanda - vidljivo samo kad je bar 1 agent selektovan -->
    <div v-if="selectedIds.size" class="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
      <div class="font-medium text-blue-900">
        Pošalji komandu na {{ selectedIds.size }} izabranih agenata
      </div>
      <div v-if="selectedIds.size > MAX_BATCH_AGENTS" class="text-sm text-red-700">
        Batch komande podržavaju najviše {{ MAX_BATCH_AGENTS }} agenata odjednom - smanji selekciju
        (npr. suzi filter) pre slanja.
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="text-sm text-slate-600">Tip komande</label>
          <select v-model="batchForm.commandType" class="app-input w-full">
            <option v-for="c in COMMAND_TYPES" :key="c" :value="c">{{ COMMAND_LABELS[c] }}</option>
          </select>
        </div>
        <FormInput v-if="isBatchServiceCommand" v-model.trim="batchForm.serviceName" label="Naziv servisa" placeholder="Spooler" />
      </div>
      <label class="flex items-center gap-2 text-sm text-blue-900">
        <input type="checkbox" v-model="batchOnlyOnline" />
        Pošalji samo online agentima (preskoči offline/neaktivne)
      </label>
      <div v-if="batchForm.commandType === 'run_powershell_script'" class="space-y-2">
        <div>
          <label class="text-sm text-slate-600">Gotova skripta (opciono)</label>
          <select v-model="batchSelectedPresetId" class="app-input w-full" @change="applyBatchPreset">
            <option value="">— Prilagođena skripta —</option>
            <option v-for="p in POWERSHELL_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
        </div>
        <div>
          <label class="text-sm text-slate-600">PowerShell skripta</label>
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
    <div v-if="selectedIds.size && isAdmin" class="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
      <div class="font-medium text-emerald-900">
        Dodeli deployment grupu na {{ selectedIds.size }} izabranih agenata
      </div>
      <div v-if="selectedIds.size > MAX_BATCH_AGENTS" class="text-sm text-red-700">
        Podržava najviše {{ MAX_BATCH_AGENTS }} agenata odjednom - smanji selekciju pre slanja.
      </div>
      <div class="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div class="flex-1 min-w-0">
          <label class="text-sm text-slate-600">Deployment grupa</label>
          <GroupSelect
            v-model="massDeploymentGroup"
            :options="deploymentGroupOptions"
            :is-admin="isAdmin"
            :allow-empty="true"
            create-endpoint="/api/protected/deployment-groups"
            @group-added="(name) => { if (!deploymentGroupOptions.includes(name)) deploymentGroupOptions.push(name) }"
            @error="(msg) => showToast(msg, { prefix: '❌ ', duration: 3000 })"
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
      <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="n in 6" :key="n" class="animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm p-4">
          <div class="h-5 w-2/3 bg-slate-200 rounded mb-3"></div>
          <div class="h-4 w-1/2 bg-slate-200 rounded mb-2"></div>
          <div class="h-4 w-1/3 bg-slate-200 rounded mb-4"></div>
        </div>
      </div>

      <div v-else-if="!items.length"
        class="rounded-xl border border-slate-200 bg-white shadow-sm p-8 text-center text-slate-500">
        Nema agenata za zadate filtere.
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="a in items" :key="a.id"
          class="rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition p-4 flex flex-col">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex items-start gap-2">
              <input
                type="checkbox"
                class="mt-1.5 shrink-0"
                :checked="selectedIds.has(a.id)"
                @change="toggleSelect(a.id)"
                aria-label="Selektuj agenta"
              />
              <div class="min-w-0">
                <RouterLink :to="`/agents/${a.id}`" class="text-lg font-semibold text-slate-800 truncate hover:underline block">
                  {{ a.hostname || '—' }}
                </RouterLink>
                <div class="mt-1 flex items-center gap-1 text-xs text-slate-500">
                  <span class="truncate">{{ a.agentUid }}</span>
                  <button @click="copy(a.agentUid)" class="shrink-0 text-slate-400 hover:text-slate-600" aria-label="Kopiraj agent id">
                    📋
                  </button>
                </div>
              </div>
            </div>
            <div class="shrink-0 flex items-center gap-1.5">
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs border"
                :class="a.status === 'active'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200'">
                {{ a.status === 'active' ? 'Aktivan' : 'Povučen' }}
              </span>
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs border"
                :class="connectivityBadgeClass(a)">
                {{ connectivityLabel(a) }}
              </span>
            </div>
          </div>

          <div class="mt-3 space-y-1.5 text-sm">
            <div class="flex items-center gap-2">
              <span class="font-medium">OS:</span>
              <span>{{ a.osCaption || '—' }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-medium">Verzija agenta:</span>
              <span>{{ a.agentVersion || '—' }}</span>
              <span
                v-if="a.remoteControlTier === 'webrtc_capable'"
                class="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-emerald-700"
                title="Agent je uživo prijavio net472 (RFB+WebRTC) build"
              >
                WEBRTC
              </span>
              <span
                v-if="a.managerChannelStatus"
                class="rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-indigo-700"
                :title="`Novi (nezavisni) Manager kanal registrovan - ${a.managerChannelStatus}`"
              >
                MANAGER
              </span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-medium">Poslednji heartbeat:</span>
              <span>{{ fmtRelative(a.lastHeartbeatAt) }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-medium">Poslednji IP:</span>
              <span>{{ a.lastIp || '—' }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-medium">Povezan računar:</span>
              <RouterLink v-if="a.ipEntryId" :to="`/ip/${a.ipEntryId}/meta`" class="text-blue-600 hover:underline">
                Otvori
              </RouterLink>
              <span v-else>—</span>
            </div>
          </div>

          <div v-if="a.antivirusStatus !== 'enabled' || a.firewallStatus !== 'enabled' || a.windowsUpdateStatus !== 'Running' || isAgentMismatch(a) || a.serviceFilesMismatch"
            class="mt-2 flex flex-wrap gap-1.5">
            <span v-if="a.antivirusStatus !== 'enabled'"
              class="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700"
              title="Antivirus nije potvrđen kao aktivan">
              🦠 Antivirus
            </span>
            <span v-if="a.firewallStatus !== 'enabled'"
              class="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700"
              title="Firewall nije potvrđen kao aktivan">
              🧱 Firewall
            </span>
            <span v-if="a.windowsUpdateStatus !== 'Running'"
              class="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700"
              title="Windows Update servis nije potvrđen kao pokrenut">
              🔄 Windows Update
            </span>
            <span v-if="isAgentMismatch(a)"
              class="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
              title="Računar je dostupan na mreži, ali agent se ne javlja online - moguć kvar agenta">
              ⚠️ Moguć kvar agenta
            </span>
            <span v-if="a.serviceFilesMismatch"
              class="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
              :title="a.serviceFilesMismatchDetails || 'Instalirani fajlovi u Service folderu ne odgovaraju release-u za prijavljenu verziju'">
              🗂️ Fajlovi ne odgovaraju release-u
            </span>
          </div>

          <div class="mt-3 pt-3 border-t flex items-center justify-between text-xs text-slate-500">
            <span>Enroll: {{ fmtDate(a.enrolledAt) }}</span>
            <button v-if="a.status === 'active'" @click="confirmRevoke(a)" class="text-red-600 hover:underline text-sm">
              Povuci
            </button>
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
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import FormInput from '@/components/FormInput.vue'
import AppButton from '@/components/AppButton.vue'
import GroupSelect from '@/components/GroupSelect.vue'
import MultiSelect from '@/components/MultiSelect.vue'

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
  remoteControlTier,
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
    remoteControlTier: {
      type: 'string',
      default: '',
      omitIfEmpty: true,
      oneOf: ['', 'rfb_only', 'webrtc_capable'],
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
    'remoteControlTier',
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
    remoteControlTier,
    hasManagerChannel,
    trustedRootCertInstalled,
    intermediateCertInstalled,
    secureDnsDisabled,
    site,
  ],
  fetchData,
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
  if (remoteControlTier.value) n++
  if (hasManagerChannel.value) n++
  if (trustedRootCertInstalled.value) n++
  if (intermediateCertInstalled.value) n++
  if (secureDnsDisabled.value) n++
  return n
})

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
  remoteControlTier.value = ''
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
  if (remoteControlTier.value) params.set('remoteControlTier', remoteControlTier.value)
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

// Isti mapiranje/klase kao connectivityLabel/connectivityBadgeClass u
// AgentDetailView.vue - držati u sinhronizaciji.
const CONNECTIVITY_LABELS = { online: 'Online', stale: 'Neaktivan', offline: 'Offline', unknown: 'Nepoznato' }
function connectivityLabel(a) {
  return CONNECTIVITY_LABELS[a.connectivityStatus] || 'Nepoznato'
}
function connectivityBadgeClass(a) {
  const s = a.connectivityStatus
  if (s === 'online') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (s === 'stale') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (s === 'offline') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-slate-100 text-slate-500 border-slate-200'
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
    showToast('Greška pri povlačenju agenta', { prefix: '❌ ', duration: 3000 })
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
    showToast('Greška pri selekciji svih agenata', { prefix: '❌ ', duration: 3000 })
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
      showToast('Naziv servisa je obavezan', { prefix: '❌ ', duration: 3000 })
      return
    }
    payload.serviceName = batchForm.value.serviceName.trim()
  }
  if (batchForm.value.commandType === 'run_powershell_script') {
    if (!batchForm.value.script.trim()) {
      showToast('Skripta je obavezna', { prefix: '❌ ', duration: 3000 })
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
    showToast(e?.message || 'Greška pri slanju batch komande', { prefix: '❌ ', duration: 3000 })
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
    showToast(e?.message || 'Greška pri dodeli deployment grupe', { prefix: '❌ ', duration: 3000 })
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
    showToast('Greška pri učitavanju agenata iz batch-a', { prefix: '❌ ', duration: 3000 })
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
  if (route.query.repeatBatchId) {
    loadRepeatBatch(route.query.repeatBatchId)
  } else if (route.query.agentIds) {
    loadPreselectedAgentIds(route.query.agentIds)
  }
})
</script>
