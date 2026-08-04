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
      </div>

      <div class="space-y-2">
        <div v-for="item in items" :key="item.id" class="rounded-lg border bg-white p-3 text-sm">
          <div class="flex items-start justify-between gap-3">
            <RouterLink :to="`/agents/${item.agentId}`" class="font-medium text-blue-600 hover:underline">
              {{ item.hostname || item.agentUid }}
            </RouterLink>
            <span class="rounded-full border px-2 py-0.5 text-xs" :class="jobStatusClass(item.status)">
              {{ item.status }}
            </span>
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
import AppButton from '@/components/AppButton.vue'

const fmtDate = (d) => formatDate(d, 'sr-RS')
const route = useRoute()
const router = useRouter()

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

let pollTimer = null

const counts = computed(() => {
  const out = { pending: 0, sent: 0, completed: 0, failed: 0 }
  for (const item of items.value) {
    if (out[item.status] !== undefined) out[item.status]++
  }
  return out
})

function jobStatusClass(status) {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'failed') return 'bg-red-50 text-red-700 border-red-200'
  if (status === 'sent') return 'bg-blue-50 text-blue-700 border-blue-200'
  return 'bg-slate-50 text-slate-600 border-slate-200'
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
