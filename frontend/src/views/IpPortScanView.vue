<template>
  <div class="glass-container w-full max-w-3xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-slate-800">Port scan — {{ entry?.ip || 'Nepoznato' }}</h1>
      <AppButton variant="neutral" @click="goBack">Nazad</AppButton>
    </div>

    <div v-if="entryLoading" class="text-slate-600">Učitavanje…</div>
    <div v-else-if="entryError" class="text-red-600">{{ entryError }}</div>

    <div v-else class="space-y-4">
      <div class="rounded border p-3 bg-slate-50">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label class="text-xs text-slate-500">Custom portovi (npr: 22,80,443 ili 20-25,80)</label>
            <input
              v-model="portScanPorts"
              class="w-full border px-3 py-2 rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="prazno = podrazumevana lista"
            />
          </div>
          <div>
            <label class="text-xs text-slate-500">Timeout po portu (ms)</label>
            <input
              v-model.number="portScanTimeoutMs"
              type="number"
              min="200"
              max="5000"
              class="w-full border px-3 py-2 rounded shadow-sm"
            />
          </div>
          <div class="flex gap-2">
            <button
              @click="runPortScan"
              :disabled="portScanLoading"
              class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Pokreni sken
            </button>
            <button
              v-if="portScanResult"
              @click="copyToClipboard(JSON.stringify(portScanResult.open, null, 2), 'Rezultat kopiran!')"
              class="px-3 py-2 rounded border"
            >
              Kopiraj JSON
            </button>
          </div>
        </div>

        <div class="mt-3">
          <button
            @click="runWinrmCheck"
            :disabled="portScanLoading"
            class="px-3 py-1.5 rounded border border-blue-300 bg-blue-50 text-blue-700 text-sm hover:bg-blue-100 disabled:opacity-50"
            title="Proveri portove 5985 (HTTP) i 5986 (HTTPS)"
          >
            Proveri WinRM
          </button>
        </div>
      </div>

      <div v-if="portScanLoading" class="text-slate-600">Skeniram…</div>
      <div v-else-if="portScanError" class="text-red-600">{{ portScanError }}</div>

      <div v-else-if="portScanResult">
        <div class="text-sm text-slate-600 mb-2">
          Otvoreni: <b>{{ portScanResult.openCount }}</b> / Skenirano: {{ portScanResult.scanned }}
        </div>

        <div v-if="portScanResult.openCount === 0" class="text-slate-600">
          Nije pronađen nijedan otvoren TCP port (za zadate uslove).
        </div>

        <div v-else class="space-y-2">
          <div v-for="p in portScanResult.open" :key="p.port" class="rounded border p-3 bg-white">
            <div class="flex items-center justify-between">
              <div class="font-medium">Port {{ p.port }} / {{ p.protocol?.toUpperCase() || 'TCP' }}</div>
              <div class="text-xs text-slate-500">~{{ p.rttMs }} ms</div>
            </div>
            <div class="text-sm">
              <div>
                <span class="text-slate-500">Servis:</span>
                {{ p.serviceHint || 'nepoznat' }}
              </div>
              <div v-if="p.banner">
                <span class="text-slate-500">Baner:</span>
                <code class="text-xs break-all">{{ p.banner }}</code>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="text-xs text-slate-500">
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

async function runWinrmCheck() {
  portScanPorts.value = '5985,5986'
  await runPortScan()
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
