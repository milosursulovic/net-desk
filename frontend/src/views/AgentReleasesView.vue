<template>
  <div class="glass-container space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">Verzije agenta</h1>
        <RouterLink to="/agents" class="text-sm text-blue-600 hover:underline">← Nazad na agente</RouterLink>
      </div>
      <AppButton variant="success" @click="openUpload">Otpremi novu verziju</AppButton>
    </div>

    <div class="min-h-50">
      <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="n in 3" :key="n" class="animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm p-4">
          <div class="h-5 w-2/3 bg-slate-200 rounded mb-3"></div>
          <div class="h-4 w-1/2 bg-slate-200 rounded mb-2"></div>
          <div class="h-4 w-1/3 bg-slate-200 rounded"></div>
        </div>
      </div>

      <div v-else-if="!items.length"
        class="rounded-xl border border-slate-200 bg-white shadow-sm p-8 text-center text-slate-500">
        Nema otpremljenih verzija.
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="r in items" :key="r.id"
          class="rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition p-4 flex flex-col">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-lg font-semibold text-slate-800">{{ r.version }}</div>
              <div class="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                <RouterLink v-for="g in r.deploymentGroups" :key="g"
                  :to="outdatedAgentsLink(r, g)"
                  class="inline-flex items-center px-2 py-0.5 rounded-full border bg-slate-50 hover:bg-slate-100"
                  :title="`Zaostali agenti u grupi '${g}'`">
                  {{ g }}
                </RouterLink>
              </div>
            </div>
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs border"
              :class="r.isActive
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-100 text-slate-500 border-slate-200'">
              {{ r.isActive ? 'Aktivna' : 'Deaktivirana' }}
            </span>
          </div>

          <div class="mt-3 space-y-1.5 text-sm">
            <div class="flex items-center gap-2">
              <span class="font-medium">Fajl:</span>
              <span class="truncate">{{ r.fileName }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-medium">Veličina:</span>
              <span>{{ fmtBytes(r.fileSize) }}</span>
            </div>
            <div class="flex items-center gap-2 min-w-0">
              <span class="font-medium shrink-0">SHA-256:</span>
              <span class="truncate font-mono text-xs">{{ shortHash(r.sha256) }}</span>
              <button @click="copy(r.sha256)" class="shrink-0 text-xs text-slate-400 hover:text-slate-600">📋</button>
            </div>
            <div v-if="r.releaseNotes" class="text-slate-600">{{ r.releaseNotes }}</div>
          </div>

          <div class="mt-3 pt-3 border-t flex items-center justify-between text-xs text-slate-500">
            <span>{{ fmtDate(r.createdAt) }}</span>
            <div class="flex items-center gap-3">
              <button @click="openEditGroups(r)" class="text-sm text-blue-600 hover:underline">
                Uredi grupe
              </button>
              <button @click="toggleActive(r)" class="text-sm hover:underline" :class="r.isActive ? 'text-red-600' : 'text-emerald-600'">
                {{ r.isActive ? 'Deaktiviraj' : 'Aktiviraj' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-2">
      <h2 class="text-lg font-semibold text-slate-800">Fajlovi na disku (uploads/agent-releases)</h2>
      <p class="text-sm text-slate-500">
        Read-only uvid u stvarno stanje foldera - za poređenje sa verzijama iznad, ne za upravljanje.
      </p>

      <div v-if="loadingDiskFiles" class="text-slate-600">Učitavanje…</div>
      <div v-else-if="!diskFiles.length" class="rounded-xl border border-slate-200 bg-white shadow-sm p-8 text-center text-slate-500">
        Folder je prazan.
      </div>
      <div v-else class="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th class="px-4 py-2 font-medium">Naziv</th>
              <th class="px-4 py-2 font-medium">Veličina</th>
              <th class="px-4 py-2 font-medium">Izmenjeno</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="f in diskFiles" :key="f.name">
              <td class="px-4 py-2 break-all">{{ f.name }}</td>
              <td class="px-4 py-2 whitespace-nowrap">{{ fmtBytes(f.size) }}</td>
              <td class="px-4 py-2 whitespace-nowrap">{{ fmtDate(f.modifiedAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <SlideOverPanel :open="showUpload" title="Otpremi novu verziju" @close="closeUpload">
      <div class="space-y-4">
        <FormInput v-model.trim="form.version" label="Verzija" placeholder="1.1.0" />

        <div>
          <label class="text-sm text-slate-600">Deployment grupe (bar jedna)</label>
          <DeploymentGroupPicker v-model="form.deploymentGroups" :options="deploymentGroupOptions" />
        </div>

        <div>
          <label class="text-sm text-slate-600">Napomene (opciono)</label>
          <textarea v-model="form.releaseNotes" rows="3" class="app-input w-full"
            placeholder="Šta je novo u ovoj verziji..."></textarea>
        </div>

        <div>
          <label class="text-sm text-slate-600">Paket (.zip)</label>
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

    <SlideOverPanel :open="showEditGroups" title="Uredi deployment grupe" @close="closeEditGroups">
      <div class="space-y-4">
        <p class="text-sm text-slate-600">
          Verzija <span class="font-semibold">{{ editForm.version }}</span> - dodaj grupe da proširiš rollout,
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
import { ref, onMounted } from 'vue'
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

const fmtDate = (d) => formatDate(d, 'sr-RS')
const { toast, showToast, copyToClipboard } = useToast()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()

const items = ref([])
const loading = ref(false)

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
    showToast('Greška pri učitavanju verzija', { prefix: '❌ ', duration: 3000 })
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
    showToast('Verzija je obavezna', { prefix: '❌ ', duration: 3000 })
    return
  }
  if (!form.value.deploymentGroups.length) {
    showToast('Bar jedna deployment grupa je obavezna', { prefix: '❌ ', duration: 3000 })
    return
  }
  if (!selectedFile.value) {
    showToast('Paket (.zip) je obavezan', { prefix: '❌ ', duration: 3000 })
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
    showToast(err?.message || 'Greška pri otpremanju verzije', { prefix: '❌ ', duration: 3000 })
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
    showToast('Greška pri izmeni statusa', { prefix: '❌ ', duration: 3000 })
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
    showToast('Bar jedna deployment grupa je obavezna', { prefix: '❌ ', duration: 3000 })
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
    showToast(err?.message || 'Greška pri čuvanju grupa', { prefix: '❌ ', duration: 3000 })
  } finally {
    savingGroups.value = false
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
    showToast(err?.message || 'Greška pri učitavanju fajlova sa diska', { prefix: '❌ ', duration: 3000 })
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
