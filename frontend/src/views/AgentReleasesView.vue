<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">Verzije agenta</h1>
        <RouterLink to="/agents" class="inline-flex items-center gap-1 text-sm text-accent hover:underline"><NavIcon name="chevron-left" /> Nazad na agente</RouterLink>
      </div>
      <AppButton variant="success" @click="openUpload">Otpremi novu verziju</AppButton>
    </div>

    <label class="inline-flex items-center gap-1.5 text-sm text-ink-secondary">
      <input type="checkbox" v-model="onlyActive" />
      Samo aktivne
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
        {{ onlyActive && items.length ? 'Nema aktivnih verzija (proveri filter).' : 'Nema otpremljenih verzija.' }}
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="r in visibleItems" :key="r.id"
          class="rounded-xl border border-line bg-surface shadow-sm hover:shadow-md transition p-4 flex flex-col">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-lg font-semibold text-ink font-mono">{{ r.version }}</div>
              <div class="mt-1 flex flex-wrap items-center gap-1">
                <RouterLink v-for="g in r.deploymentGroups" :key="g" :to="outdatedAgentsLink(r, g)" :title="`Zaostali agenti u grupi '${g}'`">
                  <TagChip :label="g" />
                </RouterLink>
              </div>
            </div>
            <StatusPill :status="r.isActive ? 'good' : 'neutral'" :label="r.isActive ? 'Aktivna' : 'Deaktivirana'" />
          </div>

          <div class="mt-3 space-y-1.5 text-sm text-ink-secondary">
            <div class="flex items-center gap-2">
              <span class="font-medium text-ink">Fajl:</span>
              <span class="truncate font-mono">{{ r.fileName }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-medium text-ink">Veličina:</span>
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
                Uredi napomene
              </button>
              <button @click="openEditGroups(r)" class="text-sm text-accent hover:underline">
                Uredi grupe
              </button>
              <button @click="forceReinstall(r)" class="text-sm text-warn hover:underline"
                title="Zameni fajlove na svim agentima u ciljanim grupama, čak i ako su već na ovoj verziji">
                Forsiraj reinstalaciju
              </button>
              <button @click="toggleActive(r)" class="text-sm hover:underline" :class="r.isActive ? 'text-bad' : 'text-good'">
                {{ r.isActive ? 'Deaktiviraj' : 'Aktiviraj' }}
              </button>
              <button
                v-if="!r.isActive"
                @click="deleteRelease(r)"
                class="text-sm text-bad hover:underline"
                title="Trajno brisanje - samo za deaktivirane verzije"
              >
                Obriši
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-2">
      <h2 class="text-lg font-semibold text-ink" style="font-family: var(--font-display)">Fajlovi na disku (uploads/agent-releases)</h2>
      <p class="text-sm text-ink-muted">
        Read-only uvid u stvarno stanje foldera - za poređenje sa verzijama iznad, ne za upravljanje.
      </p>

      <div v-if="loadingDiskFiles" class="text-ink-secondary">Učitavanje…</div>
      <div v-else-if="!diskFiles.length" class="rounded-xl border border-line bg-surface shadow-sm p-8 text-center text-ink-muted">
        Folder je prazan.
      </div>
      <div v-else class="table-shell overflow-x-auto">
        <table class="w-full min-w-max text-sm">
          <thead class="table-head-row">
            <tr>
              <th class="px-4 py-2 text-left">Naziv</th>
              <th class="px-4 py-2 text-left">Veličina</th>
              <th class="px-4 py-2 text-left">Izmenjeno</th>
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

    <SlideOverPanel :open="showUpload" title="Otpremi novu verziju" @close="closeUpload">
      <div class="space-y-4">
        <FormInput v-model.trim="form.version" label="Verzija" placeholder="1.1.0" />

        <div>
          <label class="text-sm text-ink-secondary">Deployment grupe (bar jedna)</label>
          <DeploymentGroupPicker v-model="form.deploymentGroups" :options="deploymentGroupOptions" />
        </div>

        <div>
          <label class="text-sm text-ink-secondary">Napomene (opciono)</label>
          <textarea v-model="form.releaseNotes" rows="3" class="app-input w-full"
            placeholder="Šta je novo u ovoj verziji..."></textarea>
        </div>

        <div>
          <label class="text-sm text-ink-secondary">Paket (.zip)</label>
          <input type="file" accept=".zip" @change="onFileChange" class="app-input w-full" />
        </div>

        <div class="flex gap-2 justify-end">
          <AppButton variant="neutral" @click="closeUpload">Otkaži</AppButton>
          <AppButton variant="success" :disabled="uploading" @click="upload">
            {{ uploading ? 'Otpremam…' : 'Otpremi' }}
          </AppButton>
        </div>
      </div>
    </SlideOverPanel>

    <SlideOverPanel :open="showEditNotes" title="Uredi napomene" @close="closeEditNotes">
      <div class="space-y-4">
        <p class="text-sm text-ink-secondary">
          Verzija <span class="font-semibold text-ink">{{ editNotesForm.version }}</span>
        </p>
        <textarea
          v-model="editNotesForm.releaseNotes"
          rows="6"
          class="app-input w-full"
          placeholder="Šta je novo u ovoj verziji..."
        ></textarea>
        <div class="flex gap-2 justify-end">
          <AppButton variant="neutral" @click="closeEditNotes">Otkaži</AppButton>
          <AppButton variant="success" :disabled="savingNotes" @click="saveNotes">
            {{ savingNotes ? 'Čuvam…' : 'Sačuvaj' }}
          </AppButton>
        </div>
      </div>
    </SlideOverPanel>

    <SlideOverPanel :open="showEditGroups" title="Uredi deployment grupe" @close="closeEditGroups">
      <div class="space-y-4">
        <p class="text-sm text-ink-secondary">
          Verzija <span class="font-semibold text-ink">{{ editForm.version }}</span> - dodaj grupe da proširiš rollout,
          ili ukloni da suziš.
        </p>
        <DeploymentGroupPicker v-model="editForm.deploymentGroups" :options="deploymentGroupOptions" />
        <div class="flex gap-2 justify-end">
          <AppButton variant="neutral" @click="closeEditGroups">Otkaži</AppButton>
          <AppButton variant="success" :disabled="savingGroups" @click="saveGroups">
            {{ savingGroups ? 'Čuvam…' : 'Sačuvaj' }}
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

const fmtDate = (d) => formatDate(d, 'sr-RS')
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
  await copyToClipboard(text, 'SHA-256 kopiran')
}

async function fetchData() {
  loading.value = true
  try {
    const res = await fetchWithAuth('/api/protected/agent-releases?limit=100')
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri učitavanju verzija'))
    const data = await res.json()
    items.value = data.items || []
  } catch (err) {
    console.error(err)
    showToast('Greška pri učitavanju verzija', { kind: 'error', duration: 3000 })
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
    showToast('Verzija je obavezna', { kind: 'error', duration: 3000 })
    return
  }
  if (!form.value.deploymentGroups.length) {
    showToast('Bar jedna deployment grupa je obavezna', { kind: 'error', duration: 3000 })
    return
  }
  if (!selectedFile.value) {
    showToast('Paket (.zip) je obavezan', { kind: 'error', duration: 3000 })
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
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri otpremanju'))

    showUpload.value = false
    await fetchData()
    showToast('Verzija otpremljena')
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri otpremanju verzije', { kind: 'error', duration: 3000 })
  } finally {
    uploading.value = false
  }
}

async function toggleActive(release) {
  const nextActive = !release.isActive
  const ok = await askConfirm(
    `${nextActive ? 'Aktivirati' : 'Deaktivirati'} verziju ${release.version} (${release.deploymentGroups.join(', ')})?`,
    { title: nextActive ? 'Aktiviranje verzije' : 'Deaktiviranje verzije' }
  )
  if (!ok) return

  try {
    const res = await fetchWithAuth(`/api/protected/agent-releases/${release.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: nextActive }),
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri izmeni statusa'))
    await fetchData()
    showToast(nextActive ? 'Verzija aktivirana' : 'Verzija deaktivirana')
  } catch (err) {
    console.error(err)
    showToast('Greška pri izmeni statusa', { kind: 'error', duration: 3000 })
  }
}

// Dugme je već vidljivo samo za !r.isActive (v-if u template-u), ali backend
// (deleteReleaseService) i dalje odbija aktivnu verziju - odbrana u dubinu,
// ne oslanja se samo na skriveno dugme.
async function deleteRelease(release) {
  const ok = await askConfirm(
    `Trajno obrisati verziju ${release.version} (${release.deploymentGroups.join(', ') || 'bez grupa'})? Ovo ne može da se poništi.`,
    { title: 'Brisanje verzije' },
  )
  if (!ok) return

  try {
    const res = await fetchWithAuth(`/api/protected/agent-releases/${release.id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri brisanju verzije'))
    await fetchData()
    showToast('Verzija obrisana')
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri brisanju verzije', { kind: 'error', duration: 3000 })
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
    showToast('Bar jedna deployment grupa je obavezna', { kind: 'error', duration: 3000 })
    return
  }

  savingGroups.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/agent-releases/${editForm.value.releaseId}/deployment-groups`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deploymentGroups: editForm.value.deploymentGroups }),
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri čuvanju grupa'))
    showEditGroups.value = false
    await fetchData()
    showToast('Deployment grupe sačuvane')
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri čuvanju grupa', { kind: 'error', duration: 3000 })
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
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri čuvanju napomena'))
    showEditNotes.value = false
    await fetchData()
    showToast('Napomene sačuvane')
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri čuvanju napomena', { kind: 'error', duration: 3000 })
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
    showToast('Release ne cilja nijednu grupu', { kind: 'error', duration: 3000 })
    return
  }

  const ok = await askConfirm(
    `Forsirati reinstalaciju verzije ${release.version} na SVIM aktivnim agentima u grupama: ${release.deploymentGroups.join(', ')}? Zamenjuje fajlove čak i ako je agent već na ovoj verziji.`,
    { title: 'Forsirana reinstalacija' },
  )
  if (!ok) return

  try {
    const idSet = new Set()
    for (const group of release.deploymentGroups) {
      const params = new URLSearchParams({ status: 'active', deploymentGroup: group })
      const res = await fetchWithAuth(`/api/protected/agents/ids?${params.toString()}`)
      if (!res.ok) throw new Error(await parseError(res, 'Greška pri učitavanju agenata'))
      const data = await res.json()
      for (const id of data.ids || []) idSet.add(id)
    }

    if (!idSet.size) {
      showToast('Nema aktivnih agenata u ciljanim grupama', { kind: 'warning', duration: 3000 })
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
      if (!res.ok) throw new Error(await parseError(res, 'Greška pri slanju komande'))
    }

    showToast(`Forsirana reinstalacija poslata na ${ids.length} agenata`)
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri forsiranoj reinstalaciji', { kind: 'error', duration: 3000 })
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
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri učitavanju fajlova sa diska'))
    const data = await res.json()
    diskFiles.value = data.items || []
  } catch (err) {
    console.error('Neuspešno učitavanje fajlova sa diska', err)
    showToast(err?.message || 'Greška pri učitavanju fajlova sa diska', { kind: 'error', duration: 3000 })
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
