<template>
  <div class="glass-container space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">Deljeni fajlovi</h1>
        <p class="text-sm text-slate-500 mt-1">
          Fajlovi ovde su javno dostupni bez prijave (agenti ih preuzimaju preko HTTPS-a) - npr. rootCA.pem, UltraVNC paketi.
        </p>
      </div>
      <AppButton variant="neutral" to="/agents">Nazad na agente</AppButton>
    </div>

    <div class="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-3">
      <label class="text-sm font-medium text-slate-700">Otpremi fajl</label>
      <div class="flex flex-col sm:flex-row gap-2">
        <input ref="fileInputRef" type="file" @change="onFileChange" class="app-input w-full" />
        <AppButton :disabled="!selectedFile || uploading" @click="upload">
          {{ uploading ? 'Otpremam…' : 'Otpremi' }}
        </AppButton>
      </div>
      <p v-if="selectedFile" class="text-xs text-slate-500">
        Ako fajl sa istim imenom već postoji, biće prepisan.
      </p>
    </div>

    <div v-if="loading" class="text-slate-600">Učitavanje…</div>
    <div v-else-if="!items.length" class="rounded-xl border border-slate-200 bg-white shadow-sm p-8 text-center text-slate-500">
      Folder je prazan.
    </div>

    <div v-else class="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
      <table class="w-full min-w-max text-sm">
        <thead class="bg-slate-50 text-slate-600 text-left">
          <tr>
            <th class="px-4 py-2 font-medium">Naziv</th>
            <th class="px-4 py-2 font-medium">Veličina</th>
            <th class="px-4 py-2 font-medium">Izmenjeno</th>
            <th class="px-4 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="item in items" :key="item.name">
            <td class="px-4 py-2">
              <a :href="publicUrl(item.name)" target="_blank" rel="noopener" class="text-blue-600 hover:underline whitespace-nowrap">
                {{ item.name }}
              </a>
            </td>
            <td class="px-4 py-2 whitespace-nowrap">{{ formatBytes(item.size) }}</td>
            <td class="px-4 py-2 whitespace-nowrap">{{ fmtDate(item.modifiedAt) }}</td>
            <td class="px-4 py-2 text-right whitespace-nowrap space-x-3">
              <button type="button" class="text-blue-600 hover:underline text-xs" @click="copyLink(item.name)">
                Kopiraj link
              </button>
              <button type="button" class="text-red-600 hover:underline text-xs" @click="remove(item.name)">
                Obriši
              </button>
            </td>
          </tr>
        </tbody>
      </table>
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
import { ref, onMounted } from 'vue'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { fmtDate as formatDate } from '@/utils/format.js'
import { useToast } from '@/composables/useToast.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const fmtDate = (d) => formatDate(d, 'sr-RS')
const { toast, showToast } = useToast()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()

const items = ref([])
const loading = ref(false)
const uploading = ref(false)
const selectedFile = ref(null)
const fileInputRef = ref(null)

function publicUrl(name) {
  return `${window.location.origin}/uploads/downloads/${encodeURIComponent(name)}`
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  if (!bytes) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function onFileChange(e) {
  selectedFile.value = e.target.files?.[0] || null
}

async function copyLink(name) {
  try {
    await navigator.clipboard.writeText(publicUrl(name))
    showToast('Link kopiran')
  } catch (err) {
    console.error('Neuspešno kopiranje linka', err)
    showToast('Greška pri kopiranju linka', { prefix: '❌ ', duration: 3000 })
  }
}

async function fetchData() {
  loading.value = true
  try {
    const res = await fetchWithAuth('/api/protected/downloads-folder')
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri učitavanju liste fajlova'))
    const data = await res.json()
    items.value = data.items || []
  } catch (err) {
    console.error('Neuspešno učitavanje liste fajlova', err)
    showToast(err?.message || 'Greška pri učitavanju liste fajlova', { prefix: '❌ ', duration: 3000 })
  } finally {
    loading.value = false
  }
}

async function upload() {
  if (!selectedFile.value) return

  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)

    const res = await fetchWithAuth('/api/protected/downloads-folder', {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri otpremanju fajla'))

    selectedFile.value = null
    if (fileInputRef.value) fileInputRef.value.value = ''
    await fetchData()
    showToast('Fajl otpremljen')
  } catch (err) {
    console.error('Neuspešno otpremanje fajla', err)
    showToast(err?.message || 'Greška pri otpremanju fajla', { prefix: '❌ ', duration: 3000 })
  } finally {
    uploading.value = false
  }
}

async function remove(name) {
  const ok = await askConfirm(`Obrisati fajl "${name}"?`, { title: 'Brisanje fajla' })
  if (!ok) return

  try {
    const res = await fetchWithAuth(`/api/protected/downloads-folder/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri brisanju fajla'))
    await fetchData()
    showToast('Fajl obrisan')
  } catch (err) {
    console.error('Neuspešno brisanje fajla', err)
    showToast(err?.message || 'Greška pri brisanju fajla', { prefix: '❌ ', duration: 3000 })
  }
}

onMounted(fetchData)
</script>
