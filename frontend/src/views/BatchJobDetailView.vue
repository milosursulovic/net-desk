<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">
          {{ batch ? (COMMAND_LABELS[batch.commandType] || batch.commandType) : 'Batch komanda' }}
        </h1>
        <p v-if="batch" class="text-sm text-ink-muted mt-1">
          Poslato: {{ fmtDate(batch.createdAt) }} · {{ items.length }} agenata
          <span v-if="polling" class="text-accent">· automatski se osvežava…</span>
        </p>
      </div>
      <div class="flex gap-2 shrink-0">
        <AppButton v-if="cancellableCount" variant="danger" :disabled="cancelling" @click="cancelBatch">
          <span v-if="cancelling">Otkazujem…</span>
          <span v-else class="inline-flex items-center gap-1"><NavIcon name="x" />Otkaži ({{ cancellableCount }})</span>
        </AppButton>
        <AppButton v-if="items.length" variant="secondary" @click="repeatWithNewCommand">
          <NavIcon name="refresh" /> Ponovi sa novom komandom
        </AppButton>
        <AppButton variant="neutral" to="/agent-batches">Nazad na istoriju</AppButton>
      </div>
    </div>

    <div v-if="loading" class="text-ink-secondary">Učitavanje…</div>
    <div v-else-if="error" class="text-bad">{{ error }}</div>

    <div v-else class="space-y-4">
      <div class="flex flex-wrap gap-1.5">
        <StatusPill status="neutral" :label="`Na čekanju: ${counts.pending}`" :dot="false" />
        <StatusPill status="info" :label="`Poslato: ${counts.sent}`" :dot="false" />
        <StatusPill status="good" :label="`Završeno: ${counts.completed}`" :dot="false" />
        <StatusPill status="bad" :label="`Neuspešno: ${counts.failed}`" :dot="false" />
        <StatusPill v-if="counts.cancelled" status="neutral" :label="`Otkazano: ${counts.cancelled}`" :dot="false" />
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <label class="text-xs text-ink-muted">Status:</label>
        <select v-model="statusFilter" class="app-input text-sm py-1 w-auto">
          <option value="">Svi ({{ items.length }})</option>
          <option value="pending">Na čekanju ({{ counts.pending }})</option>
          <option value="sent">Poslato ({{ counts.sent }})</option>
          <option value="completed">Završeno ({{ counts.completed }})</option>
          <option value="failed">Neuspešno ({{ counts.failed }})</option>
          <option v-if="counts.cancelled" value="cancelled">Otkazano ({{ counts.cancelled }})</option>
        </select>

        <label class="text-xs text-ink-muted ml-2">Dostupnost:</label>
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
          class="text-xs text-accent hover:underline ml-1"
          @click="statusFilter = ''; connectivityFilter = ''"
        >
          Poništi filter
        </button>
      </div>

      <div class="space-y-2">
        <div v-if="items.length && !filteredItems.length" class="text-sm text-ink-muted py-4 text-center">
          Nema stavki koje odgovaraju filteru.
        </div>
        <div v-for="item in filteredItems" :key="item.id" class="rounded-lg border border-line bg-surface p-3 text-sm">
          <div class="flex items-start justify-between gap-3">
            <RouterLink :to="`/agents/${item.agentId}`" class="font-medium text-accent hover:underline">
              {{ item.hostname || item.agentUid }}
            </RouterLink>
            <div class="flex items-center gap-1.5 shrink-0">
              <StatusPill
                v-if="item.status === 'pending'"
                :status="connectivityTone(item.connectivityStatus)"
                :label="connectivityLabel(item.connectivityStatus)"
                :dot="false"
                title="Da li je agent online dok komanda čeka"
              />
              <StatusPill :status="jobStatusTone(item.status)" :label="item.status" :dot="false" />
              <button
                v-if="item.status === 'pending' || item.status === 'sent'"
                :disabled="cancellingItemId === item.id"
                @click="cancelSingleJob(item)"
                class="text-bad hover:underline text-xs whitespace-nowrap"
              >
                {{ cancellingItemId === item.id ? 'Otkazujem…' : 'Otkaži' }}
              </button>
            </div>
          </div>
          <div class="text-xs text-ink-muted mt-1 font-mono">
            <span v-if="item.sentAt">Poslato: {{ fmtDate(item.sentAt) }}</span>
            <span v-if="item.completedAt"> · Završeno: {{ fmtDate(item.completedAt) }}</span>
            <span v-if="item.exitCode !== null"> · Exit code: {{ item.exitCode }}</span>
          </div>
          <div v-if="item.output" class="relative mt-1">
            <button @click="copyToClipboard(item.output, 'Izlaz kopiran!')"
              class="absolute top-1 right-1 text-xs text-accent hover:underline" title="Kopiraj izlaz"><NavIcon name="copy" /></button>
            <div class="text-xs font-mono bg-surface-sunken rounded p-2 pr-7 whitespace-pre-wrap break-all">{{ item.output }}</div>
          </div>
          <div v-if="item.errorOutput" class="relative mt-1">
            <button @click="copyToClipboard(item.errorOutput, 'Izlaz greške kopiran!')"
              class="absolute top-1 right-1 text-xs text-accent hover:underline" title="Kopiraj izlaz greške"><NavIcon name="copy" /></button>
            <div class="text-xs font-mono bg-bad-subtle text-bad rounded p-2 pr-7 whitespace-pre-wrap break-all">{{ item.errorOutput }}</div>
          </div>
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
import { connectivityTone, connectivityLabel, jobStatusTone } from '@/utils/statusTones.js'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import StatusPill from '@/components/StatusPill.vue'
import NavIcon from '@/components/NavIcon.vue'

const fmtDate = (d) => formatDate(d, 'sr-RS')
const route = useRoute()
const router = useRouter()
const { toast, showToast, copyToClipboard } = useToast()
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
const cancellingItemId = ref(null)

let pollTimer = null

const counts = computed(() => {
  const out = { pending: 0, sent: 0, completed: 0, failed: 0, cancelled: 0 }
  for (const item of items.value) {
    if (out[item.status] !== undefined) out[item.status]++
  }
  return out
})

// Sve što nije Završeno ili Neuspešno - agent nema kanal za prekid usred
// izvršavanja, pa se već poslata ("sent") komanda i dalje može fizički
// izvršiti na mašini, ali otkazivanje ovde markira nameru korisnika i
// sprečava da kasniji rezultat prepiše status (backend odbija rezultat za
// komandu koja više nije "sent" - vidi cancelJob u agentJobs.repo.js).
const cancellableCount = computed(() => counts.value.pending + counts.value.sent)

const statusFilter = ref('')
const connectivityFilter = ref('')

const filteredItems = computed(() => {
  return items.value.filter((item) => {
    if (statusFilter.value && item.status !== statusFilter.value) return false
    if (connectivityFilter.value && item.connectivityStatus !== connectivityFilter.value) return false
    return true
  })
})

// Otkazuje sve stavke koje nisu Završeno/Neuspešno (pending + sent) - vidi
// komentar uz cancellableCount.
async function cancelBatch() {
  const ok = await askConfirm(
    `Otkazati ${cancellableCount.value} komandi koje nisu završene? Već poslate komande (${counts.value.sent}) agent možda i dalje izvrši (nema kanal za prekid usred izvršavanja), ali status će biti markiran kao otkazan.`,
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
    showToast(data.cancelled ? `Otkazano ${data.cancelled} komandi` : 'Nema više komandi za otkazivanje')
    await loadStatus()
  } catch (err) {
    console.error('Greška pri otkazivanju batch-a:', err)
    showToast(err?.message || 'Greška pri otkazivanju batch-a', { kind: 'error', duration: 3000 })
  } finally {
    cancelling.value = false
  }
}

async function cancelSingleJob(item) {
  const ok = await askConfirm(
    `Otkazati ovu komandu na agentu "${item.hostname || item.agentUid}"?`,
    { title: 'Otkazivanje komande' },
  )
  if (!ok) return

  cancellingItemId.value = item.id
  try {
    const res = await fetchWithAuth(`/api/protected/agents/jobs/${item.id}/cancel`, { method: 'POST' })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri otkazivanju komande'))
    showToast('Komanda otkazana')
    await loadStatus()
  } catch (err) {
    console.error('Greška pri otkazivanju komande:', err)
    showToast(err?.message || 'Greška pri otkazivanju komande', { kind: 'error', duration: 3000 })
  } finally {
    cancellingItemId.value = null
  }
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
