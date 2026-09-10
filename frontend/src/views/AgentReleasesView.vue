<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">{{ t('releases.title') }}</h1>
        <RouterLink to="/agents" class="inline-flex items-center gap-1 text-sm text-accent hover:underline"><NavIcon name="chevron-left" /> {{ t('withoutAgent.backToAgents') }}</RouterLink>
      </div>
      <AppButton variant="success" @click="openUpload">{{ t('releases.uploadNew') }}</AppButton>
    </div>

    <label class="inline-flex items-center gap-1.5 text-sm text-ink-secondary">
      <input type="checkbox" v-model="onlyActive" />
      {{ t('releases.onlyActive') }}
    </label>

    <div class="min-h-50">
      <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="n in 3" :key="n" class="animate-pulse rounded-xl border border-line bg-surface shadow-sm p-4">
          <div class="h-5 w-2/3 bg-surface-sunken rounded mb-3"></div>
          <div class="h-4 w-1/2 bg-surface-sunken rounded mb-2"></div>
          <div class="h-4 w-1/3 bg-surface-sunken rounded"></div>
        </div>
      </div>

      <div v-else-if="!visibleItems.length"
        class="rounded-xl border border-line bg-surface shadow-sm p-8 text-center text-ink-muted">
        {{ onlyActive && items.length ? t('releases.noActive') : t('releases.noneUploaded') }}
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="r in visibleItems" :key="r.id"
          class="rounded-xl border border-line bg-surface shadow-sm hover:shadow-md transition p-4 flex flex-col">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-lg font-semibold text-ink font-mono">{{ r.version }}</div>
              <div class="mt-1 flex flex-wrap items-center gap-1">
                <RouterLink v-for="g in r.deploymentGroups" :key="g" :to="outdatedAgentsLink(r, g)" :title="t('releases.outdatedInGroup', { group: g })">
                  <TagChip :label="g" />
                </RouterLink>
              </div>
            </div>
            <StatusPill :status="r.isActive ? 'good' : 'neutral'" :label="r.isActive ? t('releases.active') : t('releases.deactivated')" />
          </div>

          <div class="mt-3 space-y-1.5 text-sm text-ink-secondary">
            <div class="flex items-center gap-2">
              <span class="font-medium text-ink">{{ t('releases.file') }}:</span>
              <span class="truncate font-mono">{{ r.fileName }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-medium text-ink">{{ t('releases.size') }}:</span>
              <span class="font-mono">{{ fmtBytes(r.fileSize) }}</span>
            </div>
            <div class="flex items-center gap-2 min-w-0">
              <span class="font-medium text-ink shrink-0">SHA-256:</span>
              <span class="truncate font-mono text-xs">{{ shortHash(r.sha256) }}</span>
              <button @click="copy(r.sha256)" class="shrink-0 text-xs text-ink-muted hover:text-ink"><NavIcon name="copy" /></button>
            </div>
            <div v-if="r.releaseNotes" class="text-ink-secondary whitespace-pre-wrap wrap-break-word">{{ r.releaseNotes }}</div>
          </div>

          <div class="mt-3 pt-3 border-t border-line flex items-center justify-between text-xs text-ink-muted">
            <span class="font-mono">{{ fmtDate(r.createdAt) }}</span>
            <div class="flex items-center gap-3">
              <button @click="openEditNotes(r)" class="text-sm text-accent hover:underline">
                {{ t('releases.editNotes') }}
              </button>
              <button @click="openEditGroups(r)" class="text-sm text-accent hover:underline">
                {{ t('releases.editGroups') }}
              </button>
              <button @click="forceReinstall(r)" class="text-sm text-warn hover:underline"
                :title="t('releases.forceReinstallTitle')">
                {{ t('releases.forceReinstall') }}
              </button>
              <button @click="toggleActive(r)" class="text-sm hover:underline" :class="r.isActive ? 'text-bad' : 'text-good'">
                {{ r.isActive ? t('releases.deactivate') : t('releases.activate') }}
              </button>
              <button
                v-if="!r.isActive"
                @click="deleteRelease(r)"
                class="text-sm text-bad hover:underline"
                :title="t('releases.deleteTitle')"
              >
                {{ t('common.delete') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-2">
      <h2 class="text-lg font-semibold text-ink" style="font-family: var(--font-display)">{{ t('releases.diskFilesTitle') }}</h2>
      <p class="text-sm text-ink-muted">
        {{ t('releases.diskFilesSubtitle') }}
      </p>

      <div v-if="loadingDiskFiles" class="text-ink-secondary">{{ t('common.loading') }}</div>
      <div v-else-if="!diskFiles.length" class="rounded-xl border border-line bg-surface shadow-sm p-8 text-center text-ink-muted">
        {{ t('downloads.emptyFolder') }}
      </div>
      <div v-else class="table-shell overflow-x-auto">
        <table class="w-full min-w-max text-sm">
          <thead class="table-head-row">
            <tr>
              <th class="px-4 py-2 text-left">{{ t('groups.colName') }}</th>
              <th class="px-4 py-2 text-left">{{ t('downloads.colSize') }}</th>
              <th class="px-4 py-2 text-left">{{ t('downloads.colModified') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in diskFiles" :key="f.name" class="border-b border-line last:border-0 hover:bg-surface-sunken">
              <td class="px-4 py-2 whitespace-nowrap text-ink">{{ f.name }}</td>
              <td class="px-4 py-2 whitespace-nowrap font-mono text-ink-secondary">{{ fmtBytes(f.size) }}</td>
              <td class="px-4 py-2 whitespace-nowrap font-mono text-ink-muted">{{ fmtDate(f.modifiedAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <SlideOverPanel :open="showUpload" :title="t('releases.uploadNew')" @close="closeUpload">
      <div class="space-y-4">
        <FormInput v-model.trim="form.version" :label="t('releases.version')" placeholder="1.1.0" />

        <div>
          <label class="text-sm text-ink-secondary">{{ t('releases.deploymentGroupsLabel') }}</label>
          <DeploymentGroupPicker v-model="form.deploymentGroups" :options="deploymentGroupOptions" />
        </div>

        <div>
          <label class="text-sm text-ink-secondary">{{ t('releases.notesOptional') }}</label>
          <textarea v-model="form.releaseNotes" rows="3" class="app-input w-full"
            :placeholder="t('releases.notesPlaceholder')"></textarea>
        </div>

        <div>
          <label class="text-sm text-ink-secondary">{{ t('releases.package') }}</label>
          <input type="file" accept=".zip" @change="onFileChange" class="app-input w-full" />
        </div>

        <div class="flex gap-2 justify-end">
          <AppButton variant="neutral" @click="closeUpload">{{ t('common.cancel') }}</AppButton>
          <AppButton variant="success" :disabled="uploading" @click="upload">
            {{ uploading ? t('releases.uploading') : t('releases.uploadAction') }}
          </AppButton>
        </div>
      </div>
    </SlideOverPanel>

    <SlideOverPanel :open="showEditNotes" :title="t('releases.editNotes')" @close="closeEditNotes">
      <div class="space-y-4">
        <p class="text-sm text-ink-secondary">
          {{ t('releases.version') }} <span class="font-semibold text-ink">{{ editNotesForm.version }}</span>
        </p>
        <textarea
          v-model="editNotesForm.releaseNotes"
          rows="6"
          class="app-input w-full"
          :placeholder="t('releases.notesPlaceholder')"
        ></textarea>
        <div class="flex gap-2 justify-end">
          <AppButton variant="neutral" @click="closeEditNotes">{{ t('common.cancel') }}</AppButton>
          <AppButton variant="success" :disabled="savingNotes" @click="saveNotes">
            {{ savingNotes ? t('common.saving') : t('common.save') }}
          </AppButton>
        </div>
      </div>
    </SlideOverPanel>

    <SlideOverPanel :open="showEditGroups" :title="t('releases.editDeploymentGroups')" @close="closeEditGroups">
      <div class="space-y-4">
        <p class="text-sm text-ink-secondary">
          {{ t('releases.editGroupsHint', { version: editForm.version }) }}
        </p>
        <DeploymentGroupPicker v-model="editForm.deploymentGroups" :options="deploymentGroupOptions" />
        <div class="flex gap-2 justify-end">
          <AppButton variant="neutral" @click="closeEditGroups">{{ t('common.cancel') }}</AppButton>
          <AppButton variant="success" :disabled="savingGroups" @click="saveGroups">
            {{ savingGroups ? t('common.saving') : t('common.save') }}
          </AppButton>
        </div>
      </div>
    </SlideOverPanel>

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
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { fmtDate as formatDate } from '@/utils/format.js'
import { useToast } from '@/composables/useToast.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import FormInput from '@/components/FormInput.vue'
import SlideOverPanel from '@/components/SlideOverPanel.vue'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DeploymentGroupPicker from '@/components/DeploymentGroupPicker.vue'
import StatusPill from '@/components/StatusPill.vue'
import TagChip from '@/components/TagChip.vue'
import NavIcon from '@/components/NavIcon.vue'

const { t, locale } = useI18n()
const fmtDate = (d) => formatDate(d, locale.value === 'en' ? 'en-US' : 'sr-RS')
const { toast, showToast, copyToClipboard } = useToast()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()

const items = ref([])
const loading = ref(false)

// Klijentska filtracija - lista se već učitava celokupno (limit=100, mala
// tabela), nema potrebe za backend query parametrom za ovo.
const onlyActive = ref(false)
const visibleItems = computed(() =>
  onlyActive.value ? items.value.filter((r) => r.isActive) : items.value,
)

// Predlozi za DeploymentGroupPicker (klasične vrednosti + odeljenja + grupe
// već u upotrebi) - iz istog /agents/filter-options endpoint-a koji
// AgentsView.vue već koristi za os/version/department dropdown-ove.
const deploymentGroupOptions = ref([])

async function fetchDeploymentGroupOptions() {
  try {
    const res = await fetchWithAuth('/api/protected/agents/filter-options')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    deploymentGroupOptions.value = data.deploymentGroups || []
  } catch (err) {
    console.error('Neuspešno dohvatanje predloga deployment grupa', err)
  }
}

const showUpload = ref(false)
const uploading = ref(false)
const form = ref({ version: '', deploymentGroups: ['rest'], releaseNotes: '' })
const selectedFile = ref(null)

const showEditGroups = ref(false)
const savingGroups = ref(false)
const editForm = ref({ releaseId: null, version: '', deploymentGroups: [] })

const showEditNotes = ref(false)
const savingNotes = ref(false)
const editNotesForm = ref({ releaseId: null, version: '', releaseNotes: '' })

function fmtBytes(n) {
  if (n === null || n === undefined) return '—'
  const num = Number(n)
  if (num < 1024) return num + ' B'
  if (num < 1024 * 1024) return (num / 1024).toFixed(1) + ' KB'
  return (num / 1024 / 1024).toFixed(1) + ' MB'
}

function outdatedAgentsLink(release, group) {
  return {
    path: '/agents',
    query: {
      status: 'active',
      deploymentGroup: group,
      version: release.version,
      versionMode: 'neq',
    },
  }
}

function shortHash(h) {
  if (!h) return '—'
  return h.length <= 16 ? h : `${h.slice(0, 8)}…${h.slice(-8)}`
}

async function copy(text) {
  await copyToClipboard(text, t('releases.sha256Copied'))
}

async function fetchData() {
  loading.value = true
  try {
    const res = await fetchWithAuth('/api/protected/agent-releases?limit=100')
    if (!res.ok) throw new Error(await parseError(res, t('releases.errorLoad')))
    const data = await res.json()
    items.value = data.items || []
  } catch (err) {
    console.error(err)
    showToast(t('releases.errorLoad'), { kind: 'error', duration: 3000 })
  } finally {
    loading.value = false
  }
}

function openUpload() {
  form.value = { version: '', deploymentGroups: ['rest'], releaseNotes: '' }
  selectedFile.value = null
  showUpload.value = true
}

function closeUpload() {
  showUpload.value = false
}

function onFileChange(e) {
  selectedFile.value = e.target.files?.[0] || null
}

async function upload() {
  if (!form.value.version.trim()) {
    showToast(t('releases.errorVersionRequired'), { kind: 'error', duration: 3000 })
    return
  }
  if (!form.value.deploymentGroups.length) {
    showToast(t('releases.errorGroupRequired'), { kind: 'error', duration: 3000 })
    return
  }
  if (!selectedFile.value) {
    showToast(t('releases.errorPackageRequired'), { kind: 'error', duration: 3000 })
    return
  }

  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('version', form.value.version.trim())
    // JSON-encoded jer multipart/form-data (multer) inače stavlja polje kao
    // običan string - backend parsira ovo pre Zod validacije.
    formData.append('deploymentGroups', JSON.stringify(form.value.deploymentGroups))
    if (form.value.releaseNotes.trim()) {
      formData.append('releaseNotes', form.value.releaseNotes.trim())
    }
    formData.append('file', selectedFile.value)

    const res = await fetchWithAuth('/api/protected/agent-releases', {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) throw new Error(await parseError(res, t('releases.errorUpload')))

    showUpload.value = false
    await fetchData()
    showToast(t('releases.uploaded'))
  } catch (err) {
    console.error(err)
    showToast(err?.message || t('releases.errorUpload'), { kind: 'error', duration: 3000 })
  } finally {
    uploading.value = false
  }
}

async function toggleActive(release) {
  const nextActive = !release.isActive
  const ok = await askConfirm(
    t(nextActive ? 'releases.confirmActivateMessage' : 'releases.confirmDeactivateMessage', {
      version: release.version,
      groups: release.deploymentGroups.join(', '),
    }),
    { title: nextActive ? t('releases.activatingTitle') : t('releases.deactivatingTitle') }
  )
  if (!ok) return

  try {
    const res = await fetchWithAuth(`/api/protected/agent-releases/${release.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: nextActive }),
    })
    if (!res.ok) throw new Error(await parseError(res, t('releases.errorStatusChange')))
    await fetchData()
    showToast(nextActive ? t('releases.activated') : t('releases.deactivatedToast'))
  } catch (err) {
    console.error(err)
    showToast(t('releases.errorStatusChange'), { kind: 'error', duration: 3000 })
  }
}

// Dugme je već vidljivo samo za !r.isActive (v-if u template-u), ali backend
// (deleteReleaseService) i dalje odbija aktivnu verziju - odbrana u dubinu,
// ne oslanja se samo na skriveno dugme.
async function deleteRelease(release) {
  const ok = await askConfirm(
    t('releases.confirmDeleteMessage', {
      version: release.version,
      groups: release.deploymentGroups.join(', ') || t('releases.noGroups'),
    }),
    { title: t('releases.confirmDeleteTitle') },
  )
  if (!ok) return

  try {
    const res = await fetchWithAuth(`/api/protected/agent-releases/${release.id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await parseError(res, t('releases.errorDelete')))
    await fetchData()
    showToast(t('releases.deleted'))
  } catch (err) {
    console.error(err)
    showToast(err?.message || t('releases.errorDelete'), { kind: 'error', duration: 3000 })
  }
}

function openEditGroups(release) {
  editForm.value = {
    releaseId: release.id,
    version: release.version,
    deploymentGroups: [...release.deploymentGroups],
  }
  showEditGroups.value = true
}

function closeEditGroups() {
  showEditGroups.value = false
}

async function saveGroups() {
  if (!editForm.value.deploymentGroups.length) {
    showToast(t('releases.errorGroupRequired'), { kind: 'error', duration: 3000 })
    return
  }

  savingGroups.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/agent-releases/${editForm.value.releaseId}/deployment-groups`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deploymentGroups: editForm.value.deploymentGroups }),
    })
    if (!res.ok) throw new Error(await parseError(res, t('releases.errorSaveGroups')))
    showEditGroups.value = false
    await fetchData()
    showToast(t('releases.groupsSaved'))
  } catch (err) {
    console.error(err)
    showToast(err?.message || t('releases.errorSaveGroups'), { kind: 'error', duration: 3000 })
  } finally {
    savingGroups.value = false
  }
}

// Napomene su, za razliku od verzije/fajla, editabilne i posle upload-a -
// korisnik ih dopunjuje kasnije bez potrebe da ponovo otprema paket.
function openEditNotes(release) {
  editNotesForm.value = {
    releaseId: release.id,
    version: release.version,
    releaseNotes: release.releaseNotes || '',
  }
  showEditNotes.value = true
}

function closeEditNotes() {
  showEditNotes.value = false
}

async function saveNotes() {
  savingNotes.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/agent-releases/${editNotesForm.value.releaseId}/notes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ releaseNotes: editNotesForm.value.releaseNotes.trim() || null }),
    })
    if (!res.ok) throw new Error(await parseError(res, t('releases.errorSaveNotes')))
    showEditNotes.value = false
    await fetchData()
    showToast(t('releases.notesSaved'))
  } catch (err) {
    console.error(err)
    showToast(err?.message || t('releases.errorSaveNotes'), { kind: 'error', duration: 3000 })
  } finally {
    savingNotes.value = false
  }
}

// Mora se poklopiti sa BatchCreateJobSchema.agentIds max u
// backend/dtos/agentJobs.dto.js - deli veće ciljne grupe u više batch
// zahteva umesto da jedan pukne na limitu.
const BATCH_CHUNK_SIZE = 500

// force_reinstall_agent ne izlazi na generički "Nova komanda" dropdown
// (isti obrazac kao start_vnc_bridge) - ovde se šalje direktno, ka SVIM
// aktivnim agentima u grupama koje release cilja, sa payload-om već
// popunjenim iz podataka release-a (releaseId/version/sha256) - agent
// preuzima preko postojeće /update/download/:releaseId rute, bez potrebe
// za novim backend endpoint-om.
async function forceReinstall(release) {
  if (!release.deploymentGroups.length) {
    showToast(t('releases.errorNoGroupTargeted'), { kind: 'error', duration: 3000 })
    return
  }

  const ok = await askConfirm(
    t('releases.confirmForceReinstall', { version: release.version, groups: release.deploymentGroups.join(', ') }),
    { title: t('releases.forceReinstallTitleDialog') },
  )
  if (!ok) return

  try {
    const idSet = new Set()
    for (const group of release.deploymentGroups) {
      const params = new URLSearchParams({ status: 'active', deploymentGroup: group })
      const res = await fetchWithAuth(`/api/protected/agents/ids?${params.toString()}`)
      if (!res.ok) throw new Error(await parseError(res, t('releases.errorLoadAgents')))
      const data = await res.json()
      for (const id of data.ids || []) idSet.add(id)
    }

    if (!idSet.size) {
      showToast(t('releases.noActiveAgentsInGroups'), { kind: 'warning', duration: 3000 })
      return
    }

    const ids = [...idSet]
    const payload = { releaseId: release.id, version: release.version, sha256: release.sha256 }

    for (let i = 0; i < ids.length; i += BATCH_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + BATCH_CHUNK_SIZE)
      const res = await fetchWithAuth('/api/protected/agents/jobs/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentIds: chunk, commandType: 'force_reinstall_agent', payload }),
      })
      if (!res.ok) throw new Error(await parseError(res, t('releases.errorSendCommand')))
    }

    showToast(t('releases.forceReinstallSent', { count: ids.length }))
  } catch (err) {
    console.error(err)
    showToast(err?.message || t('releases.errorForceReinstall'), { kind: 'error', duration: 3000 })
  }
}

const diskFiles = ref([])
const loadingDiskFiles = ref(false)

// Read-only uvid u ono što je STVARNO na disku (uploads/agent-releases),
// nezavisno od agent_releases tabele iznad - korisno da se uoči
// neusklađenost (fajl ručno obrisan mimo aplikacije, ili "osirotela"
// datoteka bez odgovarajućeg reda u bazi). Namerno bez upload/delete -
// izmene idu isključivo kroz formu iznad da baza ostane izvor istine.
async function fetchDiskFiles() {
  loadingDiskFiles.value = true
  try {
    const res = await fetchWithAuth('/api/protected/agent-releases/files')
    if (!res.ok) throw new Error(await parseError(res, t('releases.errorLoadDiskFiles')))
    const data = await res.json()
    diskFiles.value = data.items || []
  } catch (err) {
    console.error('Neuspešno učitavanje fajlova sa diska', err)
    showToast(err?.message || t('releases.errorLoadDiskFiles'), { kind: 'error', duration: 3000 })
  } finally {
    loadingDiskFiles.value = false
  }
}

onMounted(() => {
  fetchData()
  fetchDeploymentGroupOptions()
  fetchDiskFiles()
})
</script>
