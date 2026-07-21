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
              <div class="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full border bg-slate-50">{{ r.deploymentGroup }}</span>
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
            <button @click="toggleActive(r)" class="text-sm hover:underline" :class="r.isActive ? 'text-red-600' : 'text-emerald-600'">
              {{ r.isActive ? 'Deaktiviraj' : 'Aktiviraj' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <SlideOverPanel :open="showUpload" title="Otpremi novu verziju" @close="closeUpload">
      <div class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormInput v-model.trim="form.version" label="Verzija" placeholder="1.1.0" />
          <div>
            <label class="text-sm text-slate-600">Deployment grupa</label>
            <select v-model="form.deploymentGroup" class="app-input w-full">
              <option v-for="g in DEPLOYMENT_GROUPS" :key="g" :value="g">{{ g }}</option>
            </select>
          </div>
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

const fmtDate = (d) => formatDate(d, 'sr-RS')
const { toast, showToast, copyToClipboard } = useToast()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()

// Duplicated in AgentDetailView.vue (no shared constants module for this
// yet) - also must match the backend's implicit "rest" default fallback in
// agentReleases.service.js. Keep all three in sync if groups ever change.
const DEPLOYMENT_GROUPS = ['test', 'it', 'pilot', 'rest']

const items = ref([])
const loading = ref(false)

const showUpload = ref(false)
const uploading = ref(false)
const form = ref({ version: '', deploymentGroup: 'rest', releaseNotes: '' })
const selectedFile = ref(null)

function fmtBytes(n) {
  if (n === null || n === undefined) return '—'
  const num = Number(n)
  if (num < 1024) return num + ' B'
  if (num < 1024 * 1024) return (num / 1024).toFixed(1) + ' KB'
  return (num / 1024 / 1024).toFixed(1) + ' MB'
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
  form.value = { version: '', deploymentGroup: 'rest', releaseNotes: '' }
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
  if (!selectedFile.value) {
    showToast('Paket (.zip) je obavezan', { prefix: '❌ ', duration: 3000 })
    return
  }

  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('version', form.value.version.trim())
    formData.append('deploymentGroup', form.value.deploymentGroup)
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
    `${nextActive ? 'Aktivirati' : 'Deaktivirati'} verziju ${release.version} (${release.deploymentGroup})?`,
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

onMounted(fetchData)
</script>
