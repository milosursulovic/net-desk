<template>
  <div class="glass-container space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">
          {{ batch ? (COMMAND_LABELS[batch.commandType] || batch.commandType) : 'Batch komanda' }}
        </h1>
        <p v-if="batch" class="text-sm text-slate-500 mt-1">
          Poslato: {{ fmtDate(batch.createdAt) }} · {{ items.length }} agenata
          <span v-if="polling" class="text-blue-600">· automatski se osvežava…</span>
        </p>
      </div>
      <div class="flex gap-2 shrink-0">
        <AppButton v-if="counts.pending" variant="danger" :disabled="cancelling" @click="cancelBatch">
          {{ cancelling ? 'Otkazujem…' : `✖️ Otkaži (${counts.pending})` }}
        </AppButton>
        <AppButton v-if="items.length" variant="secondary" @click="repeatWithNewCommand">
          🔁 Ponovi sa novom komandom
        </AppButton>
        <AppButton variant="neutral" to="/agent-batches">Nazad na istoriju</AppButton>
      </div>
    </div>

    <div v-if="loading" class="text-slate-600">Učitavanje…</div>
    <div v-else-if="error" class="text-red-600">{{ error }}</div>

    <div v-else class="space-y-4">
      <div class="flex flex-wrap gap-2">
        <span class="rounded-full border px-2 py-0.5 text-xs bg-slate-50 text-slate-600 border-slate-200">
          Na čekanju: {{ counts.pending }}
        </span>
        <span class="rounded-full border px-2 py-0.5 text-xs bg-blue-50 text-blue-700 border-blue-200">
          Poslato: {{ counts.sent }}
        </span>
        <span class="rounded-full border px-2 py-0.5 text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
          Završeno: {{ counts.completed }}
        </span>
        <span class="rounded-full border px-2 py-0.5 text-xs bg-red-50 text-red-700 border-red-200">
          Neuspešno: {{ counts.failed }}
        </span>
        <span v-if="counts.cancelled" class="rounded-full border px-2 py-0.5 text-xs bg-slate-100 text-slate-500 border-slate-200">
          Otkazano: {{ counts.cancelled }}
        </span>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <label class="text-xs text-slate-500">Status:</label>
        <select v-model="statusFilter" class="app-input text-sm py-1 w-auto">
          <option value="">Svi ({{ items.length }})</option>
          <option value="pending">Na čekanju ({{ counts.pending }})</option>
          <option value="sent">Poslato ({{ counts.sent }})</option>
          <option value="completed">Završeno ({{ counts.completed }})</option>
          <option value="failed">Neuspešno ({{ counts.failed }})</option>
          <option v-if="counts.cancelled" value="cancelled">Otkazano ({{ counts.cancelled }})</option>
        </select>

        <label class="text-xs text-slate-500 ml-2">Dostupnost:</label>
        <select v-model="connectivityFilter" class="app-input text-sm py-1 w-auto">
          <option value="">Sve</option>
          <option value="online">Online</option>
          <option value="stale">Neaktivan</option>
          <option value="offline">Offline</option>
          <option value="unknown">Nepoznato</option>
        </select>

        <button
          v-if="statusFilter || connectivityFilter"
          type="button"
          class="text-xs text-blue-600 hover:underline ml-1"
          @click="statusFilter = ''; connectivityFilter = ''"
        >
          Poništi filter
        </button>
      </div>

      <div class="space-y-2">
        <div v-if="items.length && !filteredItems.length" class="text-sm text-slate-500 py-4 text-center">
          Nema stavki koje odgovaraju filteru.
        </div>
        <div v-for="item in filteredItems" :key="item.id" class="rounded-lg border bg-white p-3 text-sm">
          <div class="flex items-start justify-between gap-3">
            <RouterLink :to="`/agents/${item.agentId}`" class="font-medium text-blue-600 hover:underline">
              {{ item.hostname || item.agentUid }}
            </RouterLink>
            <div class="flex items-center gap-1.5 shrink-0">
              <span v-if="item.status === 'pending'"
                class="rounded-full border px-2 py-0.5 text-xs"
                :class="connectivityBadgeClass(item.connectivityStatus)"
                title="Da li je agent online dok komanda čeka">
                {{ connectivityLabel(item.connectivityStatus) }}
              </span>
              <span class="rounded-full border px-2 py-0.5 text-xs" :class="jobStatusClass(item.status)">
                {{ item.status }}
              </span>
            </div>
          </div>
          <div class="text-xs text-slate-500 mt-1">
            <span v-if="item.sentAt">Poslato: {{ fmtDate(item.sentAt) }}</span>
            <span v-if="item.completedAt"> · Završeno: {{ fmtDate(item.completedAt) }}</span>
            <span v-if="item.exitCode !== null"> · Exit code: {{ item.exitCode }}</span>
          </div>
          <div v-if="item.output" class="mt-1 text-xs bg-slate-50 rounded p-2 whitespace-pre-wrap break-all">{{ item.output }}</div>
          <div v-if="item.errorOutput" class="mt-1 text-xs bg-red-50 text-red-700 rounded p-2 whitespace-pre-wrap break-all">{{ item.errorOutput }}</div>
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
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RouterLink } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { fmtDate as formatDate } from '@/utils/format.js'
import { COMMAND_LABELS } from '@/constants/agentCommands.js'
import { useToast } from '@/composables/useToast.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const fmtDate = (d) => formatDate(d, 'sr-RS')
const route = useRoute()
const router = useRouter()
const { toast, showToast } = useToast()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()

// Vodi na Agenti stranicu, koja učitava ciljane agente ovog batch-a preko
// repeatBatchId query param-a i predpuni formu (ali ostaje izmenljivo -
// ovo NIJE "pošalji isti batch ponovo").
function repeatWithNewCommand() {
  router.push({ path: '/agents', query: { site: route.query.site, repeatBatchId: route.params.batchId } })
}

const batch = ref(null)
const items = ref([])
const loading = ref(false)
const error = ref('')
const polling = ref(false)
const cancelling = ref(false)

let pollTimer = null

const counts = computed(() => {
  const out = { pending: 0, sent: 0, completed: 0, failed: 0, cancelled: 0 }
  for (const item of items.value) {
    if (out[item.status] !== undefined) out[item.status]++
  }
  return out
})

const statusFilter = ref('')
const connectivityFilter = ref('')

const filteredItems = computed(() => {
  return items.value.filter((item) => {
    if (statusFilter.value && item.status !== statusFilter.value) return false
    if (connectivityFilter.value && item.connectivityStatus !== connectivityFilter.value) return false
    return true
  })
})

function jobStatusClass(status) {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'failed') return 'bg-red-50 text-red-700 border-red-200'
  if (status === 'sent') return 'bg-blue-50 text-blue-700 border-blue-200'
  if (status === 'cancelled') return 'bg-slate-100 text-slate-500 border-slate-200'
  return 'bg-slate-50 text-slate-600 border-slate-200'
}

// Otkazuje samo stavke koje su još "na čekanju" - već poslate komande se ne
// mogu prekinuti (agent nema kanal za prekid usred izvršavanja).
async function cancelBatch() {
  const ok = await askConfirm(
    `Otkazati ${counts.value.pending} komandi na čekanju? Već poslate komande (${counts.value.sent}) se ne mogu prekinuti i nastaviće da se izvršavaju.`,
    { title: 'Otkazivanje batch komande' },
  )
  if (!ok) return

  cancelling.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/agents/jobs/batch/${route.params.batchId}/cancel`, {
      method: 'POST',
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri otkazivanju batch-a'))
    const data = await res.json()
    showToast(data.cancelled ? `Otkazano ${data.cancelled} komandi` : 'Nema više komandi na čekanju')
    await loadStatus()
  } catch (err) {
    console.error('Greška pri otkazivanju batch-a:', err)
    showToast(err?.message || 'Greška pri otkazivanju batch-a', { prefix: '❌ ', duration: 3000 })
  } finally {
    cancelling.value = false
  }
}

// Isto mapiranje/boje kao connectivityLabel/connectivityBadgeClass na
// AgentDetailView.vue, samo po stavci (ovde ima više agenata na jednoj
// strani) - da se na "na čekanju" komandama vidi da li agent uopšte
// odgovara, ne samo da čeka na sledeći poll ciklus.
function connectivityLabel(status) {
  const map = { online: 'Online', stale: 'Neaktivan', offline: 'Offline', unknown: 'Nepoznato' }
  return map[status] || 'Nepoznato'
}
function connectivityBadgeClass(status) {
  if (status === 'online') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'stale') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (status === 'offline') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-slate-100 text-slate-500 border-slate-200'
}

async function loadStatus() {
  try {
    const res = await fetchWithAuth(`/api/protected/agents/jobs/batch/${route.params.batchId}`)
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri učitavanju statusa batch-a'))
    const data = await res.json()
    batch.value = data.batch
    items.value = data.items || []
    error.value = ''

    const stillGoing = items.value.some((i) => i.status === 'pending' || i.status === 'sent')
    if (stillGoing) {
      polling.value = true
      pollTimer = setTimeout(loadStatus, 4000)
    } else {
      polling.value = false
    }
  } catch (err) {
    console.error('Greška pri učitavanju statusa batch-a:', err)
    error.value = err?.message || 'Greška pri učitavanju statusa batch-a'
    polling.value = false
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loading.value = true
  loadStatus()
})

onBeforeUnmount(() => {
  clearTimeout(pollTimer)
})
</script>
