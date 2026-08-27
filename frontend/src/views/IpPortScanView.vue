<template>
  <div class="w-full max-w-3xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">Port scan — {{ entry?.ip || 'Nepoznato' }}</h1>
      <AppButton variant="neutral" @click="goBack">Nazad</AppButton>
    </div>

    <div v-if="entryLoading" class="text-ink-secondary">Učitavanje…</div>
    <div v-else-if="entryError" class="text-bad">{{ entryError }}</div>

    <div v-else class="space-y-4">
      <div class="rounded-lg border border-line p-3 bg-surface-sunken">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label class="text-xs text-ink-muted">Custom portovi (npr: 22,80,443 ili 20-25,80)</label>
            <input
              v-model="portScanPorts"
              class="app-input w-full"
              placeholder="prazno = podrazumevana lista"
            />
          </div>
          <div>
            <label class="text-xs text-ink-muted">Timeout po portu (ms)</label>
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
              Pokreni sken
            </AppButton>
            <AppButton
              v-if="portScanResult"
              variant="neutral"
              @click="copyToClipboard(JSON.stringify(portScanResult.open, null, 2), 'Rezultat kopiran!')"
            >
              Kopiraj JSON
            </AppButton>
          </div>
        </div>
      </div>

      <div v-if="portScanLoading" class="text-ink-secondary">Skeniram…</div>
      <div v-else-if="portScanError" class="text-bad">{{ portScanError }}</div>

      <div v-else-if="portScanResult">
        <div class="text-sm text-ink-secondary mb-2">
          Otvoreni: <b class="font-mono text-ink">{{ portScanResult.openCount }}</b> / Skenirano: {{ portScanResult.scanned }}
        </div>

        <div v-if="portScanResult.openCount === 0" class="text-ink-secondary">
          Nije pronađen nijedan otvoren TCP port (za zadate uslove).
        </div>

        <div v-else class="space-y-2">
          <div v-for="p in portScanResult.open" :key="p.port" class="rounded-lg border border-line p-3 bg-surface">
            <div class="flex items-center justify-between">
              <div class="font-medium text-ink font-mono">Port {{ p.port }} / {{ p.protocol?.toUpperCase() || 'TCP' }}</div>
              <div class="text-xs text-ink-muted font-mono">~{{ p.rttMs }} ms</div>
            </div>
            <div class="text-sm text-ink-secondary">
              <div>
                <span class="text-ink-muted">Servis:</span>
                {{ p.serviceHint || 'nepoznat' }}
              </div>
              <div v-if="p.banner">
                <span class="text-ink-muted">Baner:</span>
                <code class="text-xs font-mono break-all">{{ p.banner }}</code>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="text-xs text-ink-muted">
        Napomena: Ovo je brzi TCP connect sken (ne radi UDP). Neki servisi ne šalju baner iako je port
        otvoren.
      </div>
    </div>

    <ToastNotification :message="toast" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { useToast } from '@/composables/useToast.js'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'

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
    portScanError.value = err?.message || 'Greška pri skeniranju'
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
      entryError.value = 'Unos nije pronađen'
      return
    }
    entry.value = await res.json()
  } catch (err) {
    console.error(err)
    entryError.value = 'Neuspešno učitan unos'
  } finally {
    entryLoading.value = false
  }
}

onMounted(loadEntry)
</script>
