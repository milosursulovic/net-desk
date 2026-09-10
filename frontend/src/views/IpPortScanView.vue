<template>
  <div class="w-full max-w-3xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">{{ t('portScan.title', { ip: entry?.ip || t('portScan.unknown') }) }}</h1>
      <AppButton variant="neutral" @click="goBack">{{ t('portScan.back') }}</AppButton>
    </div>

    <div v-if="entryLoading" class="text-ink-secondary">{{ t('portScan.loading') }}</div>
    <div v-else-if="entryError" class="text-bad">{{ entryError }}</div>

    <div v-else class="space-y-4">
      <div class="rounded-lg border border-line p-3 bg-surface-sunken">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label class="text-xs text-ink-muted">{{ t('portScan.customPortsLabel') }}</label>
            <input
              v-model="portScanPorts"
              class="app-input w-full"
              :placeholder="t('portScan.customPortsPlaceholder')"
            />
          </div>
          <div>
            <label class="text-xs text-ink-muted">{{ t('portScan.timeoutLabel') }}</label>
            <input
              v-model.number="portScanTimeoutMs"
              type="number"
              min="200"
              max="5000"
              class="app-input w-full"
            />
          </div>
          <div class="flex gap-2">
            <AppButton variant="primary" :disabled="portScanLoading" @click="runPortScan">
              {{ t('portScan.runScan') }}
            </AppButton>
            <AppButton
              v-if="portScanResult"
              variant="neutral"
              @click="copyToClipboard(JSON.stringify(portScanResult.open, null, 2), t('portScan.resultCopied'))"
            >
              {{ t('portScan.copyJson') }}
            </AppButton>
          </div>
        </div>
      </div>

      <div v-if="portScanLoading" class="text-ink-secondary">{{ t('portScan.scanning') }}</div>
      <div v-else-if="portScanError" class="text-bad">{{ portScanError }}</div>

      <div v-else-if="portScanResult">
        <div class="text-sm text-ink-secondary mb-2">
          {{ t('portScan.openCountLabel') }} <b class="font-mono text-ink">{{ portScanResult.openCount }}</b> / {{ t('portScan.scannedLabel') }} {{ portScanResult.scanned }}
        </div>

        <div v-if="portScanResult.openCount === 0" class="text-ink-secondary">
          {{ t('portScan.noOpenPorts') }}
        </div>

        <div v-else class="space-y-2">
          <div v-for="p in portScanResult.open" :key="p.port" class="rounded-lg border border-line p-3 bg-surface">
            <div class="flex items-center justify-between">
              <div class="font-medium text-ink font-mono">Port {{ p.port }} / {{ p.protocol?.toUpperCase() || 'TCP' }}</div>
              <div class="text-xs text-ink-muted font-mono">~{{ p.rttMs }} ms</div>
            </div>
            <div class="text-sm text-ink-secondary">
              <div>
                <span class="text-ink-muted">{{ t('portScan.serviceLabel') }}</span>
                {{ p.serviceHint || t('portScan.unknownService') }}
              </div>
              <div v-if="p.banner">
                <span class="text-ink-muted">{{ t('portScan.bannerLabel') }}</span>
                <code class="text-xs font-mono break-all">{{ p.banner }}</code>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="text-xs text-ink-muted">
        {{ t('portScan.note') }}
      </div>
    </div>

    <ToastNotification :message="toast" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { useToast } from '@/composables/useToast.js'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { toast, copyToClipboard } = useToast()

const entry = ref(null)
const entryLoading = ref(false)
const entryError = ref('')

const portScanLoading = ref(false)
const portScanError = ref(null)
const portScanResult = ref(null)
const portScanPorts = ref('')
const portScanTimeoutMs = ref(100)

function goBack() {
  router.push('/')
}

async function runPortScan() {
  if (!entry.value) return
  portScanLoading.value = true
  portScanError.value = null
  portScanResult.value = null
  try {
    const params = new URLSearchParams({
      ip: entry.value.ip,
      timeoutMs: String(portScanTimeoutMs.value || 1200),
    })
    if (portScanPorts.value.trim()) params.set('ports', portScanPorts.value.trim())

    const res = await fetchWithAuth(`/api/protected/ip-addresses/scan-ports?${params.toString()}`)
    if (!res.ok) {
      throw new Error(await parseError(res, `HTTP ${res.status}`))
    }
    const data = await res.json()
    portScanResult.value = data
  } catch (err) {
    portScanError.value = err?.message || t('portScan.errorScanning')
  } finally {
    portScanLoading.value = false
  }
}

async function loadEntry() {
  entryLoading.value = true
  entryError.value = ''
  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses/${route.params.id}`)
    if (!res.ok) {
      entryError.value = t('portScan.entryNotFound')
      return
    }
    entry.value = await res.json()
  } catch (err) {
    console.error(err)
    entryError.value = t('portScan.errorLoadEntry')
  } finally {
    entryLoading.value = false
  }
}

onMounted(loadEntry)
</script>
