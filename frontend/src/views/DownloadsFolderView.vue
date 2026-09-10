<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">{{ t('downloads.title') }}</h1>
        <p class="text-sm text-ink-muted mt-1">
          {{ t('downloads.subtitle') }}
        </p>
      </div>
      <AppButton variant="neutral" to="/agents">{{ t('withoutAgent.backToAgents') }}</AppButton>
    </div>

    <div class="rounded-xl border border-line bg-surface shadow-sm p-4 space-y-3">
      <label class="text-sm font-medium text-ink">{{ t('downloads.uploadFile') }}</label>
      <div class="flex flex-col sm:flex-row gap-2">
        <input ref="fileInputRef" type="file" @change="onFileChange" class="app-input w-full" />
        <AppButton :disabled="!selectedFile || uploading" @click="upload">
          {{ uploading ? t('downloads.uploading') : t('downloads.upload') }}
        </AppButton>
      </div>
      <p v-if="selectedFile" class="text-xs text-ink-muted">
        {{ t('downloads.overwriteNote') }}
      </p>
    </div>

    <div v-if="loading" class="text-ink-secondary">{{ t('common.loading') }}</div>
    <div v-else-if="!items.length" class="rounded-xl border border-line bg-surface shadow-sm p-8 text-center text-ink-muted">
      {{ t('downloads.emptyFolder') }}
    </div>

    <div v-else class="table-shell overflow-x-auto">
      <table class="w-full min-w-max text-sm">
        <thead class="table-head-row">
          <tr>
            <th class="px-4 py-2 text-left">{{ t('groups.colName') }}</th>
            <th class="px-4 py-2 text-left">{{ t('downloads.colSize') }}</th>
            <th class="px-4 py-2 text-left">{{ t('downloads.colModified') }}</th>
            <th class="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.name" class="border-b border-line last:border-0 hover:bg-surface-sunken">
            <td class="px-4 py-2">
              <a :href="publicUrl(item.name)" target="_blank" rel="noopener" class="text-accent hover:underline whitespace-nowrap">
                {{ item.name }}
              </a>
            </td>
            <td class="px-4 py-2 whitespace-nowrap font-mono text-ink-secondary">{{ formatBytes(item.size) }}</td>
            <td class="px-4 py-2 whitespace-nowrap font-mono text-ink-muted">{{ fmtDate(item.modifiedAt) }}</td>
            <td class="px-4 py-2 text-right whitespace-nowrap space-x-3">
              <button type="button" class="text-accent hover:underline text-xs" @click="copyLink(item.name)">
                {{ t('downloads.copyLink') }}
              </button>
              <button type="button" class="text-bad hover:underline text-xs" @click="remove(item.name)">
                {{ t('common.delete') }}
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
import { useI18n } from 'vue-i18n'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { fmtDate as formatDate } from '@/utils/format.js'
import { useToast } from '@/composables/useToast.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const { t, locale } = useI18n()
const fmtDate = (d) => formatDate(d, locale.value === 'en' ? 'en-US' : 'sr-RS')
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
    showToast(t('downloads.linkCopied'))
  } catch (err) {
    console.error('Neuspešno kopiranje linka', err)
    showToast(t('downloads.errorCopyLink'), { kind: 'error', duration: 3000 })
  }
}

async function fetchData() {
  loading.value = true
  try {
    const res = await fetchWithAuth('/api/protected/downloads-folder')
    if (!res.ok) throw new Error(await parseError(res, t('downloads.errorLoadList')))
    const data = await res.json()
    items.value = data.items || []
  } catch (err) {
    console.error('Neuspešno učitavanje liste fajlova', err)
    showToast(err?.message || t('downloads.errorLoadList'), { kind: 'error', duration: 3000 })
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
    if (!res.ok) throw new Error(await parseError(res, t('downloads.errorUpload')))

    selectedFile.value = null
    if (fileInputRef.value) fileInputRef.value.value = ''
    await fetchData()
    showToast(t('downloads.fileUploaded'))
  } catch (err) {
    console.error('Neuspešno otpremanje fajla', err)
    showToast(err?.message || t('downloads.errorUpload'), { kind: 'error', duration: 3000 })
  } finally {
    uploading.value = false
  }
}

async function remove(name) {
  const ok = await askConfirm(t('downloads.confirmDeleteMessage', { name }), { title: t('downloads.confirmDeleteTitle') })
  if (!ok) return

  try {
    const res = await fetchWithAuth(`/api/protected/downloads-folder/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    })
    if (!res.ok) throw new Error(await parseError(res, t('downloads.errorDelete')))
    await fetchData()
    showToast(t('downloads.fileDeleted'))
  } catch (err) {
    console.error('Neuspešno brisanje fajla', err)
    showToast(err?.message || t('downloads.errorDelete'), { kind: 'error', duration: 3000 })
  }
}

onMounted(fetchData)
</script>
