<template>
  <div class="glass-container w-full max-w-2xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-slate-800">Duplirana imena računara</h1>
      <AppButton variant="neutral" @click="goBack">Nazad</AppButton>
    </div>

    <div v-if="loading" class="text-slate-600">Učitavanje…</div>
    <div v-else-if="error" class="text-red-600">{{ error }}</div>

    <template v-else>
      <div v-if="duplicateGroups.length === 0" class="text-slate-600">
        Nema duplih imena računara.
      </div>

      <div v-else class="space-y-3">
        <div v-for="g in duplicateGroups" :key="g.key || g.name" class="rounded border bg-slate-50 p-3">
          <div class="flex items-center justify-between">
            <div class="font-medium">
              {{ g.name }} <span class="text-xs text-slate-500">({{ g.count }} kom)</span>
            </div>
            <div class="flex items-center gap-2">
              <button
                class="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                @click="filterOn(g.name)"
                title="Filtriraj na ovo ime (search)"
              >
                Filtriraj
              </button>
              <button
                class="text-xs px-2 py-1 rounded border"
                @click="copyToClipboard(g.name, `Ime '${g.name}' kopirano!`)"
              >
                Kopiraj ime
              </button>
            </div>
          </div>

          <div class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div
              v-for="it in g.items"
              :key="it.id"
              class="bg-white rounded border p-2 text-sm flex items-center justify-between gap-2"
            >
              <div class="min-w-0">
                <div class="font-medium truncate">{{ it.ip }}</div>
                <div class="text-xs text-slate-500 truncate">{{ it.department || '—' }}</div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button
                  class="text-xs text-blue-600 hover:underline"
                  @click="router.push(`/edit/${it.id}`)"
                  title="Otvori za izmenu"
                >
                  Izmeni
                </button>
                <button
                  class="text-xs"
                  @click="copyToClipboard(it.ip, `IP ${it.ip} kopiran!`)"
                  title="Kopiraj IP"
                >
                  📋
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="duplicateGroups.length" class="mt-3 text-xs text-slate-500">
        Savet: U idealnom slučaju svaka mašina ima jedinstveno ime (npr. standardizovan prefiks i
        inventarski broj). Ove grupe pomažu da brzo uočite konfliktne nazive.
      </div>
    </template>

    <ToastNotification :message="toast" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { useToast } from '@/composables/useToast.js'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'

const router = useRouter()
const { toast, copyToClipboard } = useToast()

const loading = ref(false)
const error = ref('')
const duplicateGroups = ref([])

function goBack() {
  router.push('/')
}

function filterOn(name) {
  router.push({ path: '/', query: { search: name, page: 1 } })
}

async function loadDuplicates() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ search: '', status: 'all' })
    const res = await fetchWithAuth(`/api/protected/ip-addresses/duplicates?${params.toString()}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    duplicateGroups.value = Array.isArray(data.groups) ? data.groups : []
  } catch (err) {
    console.error('Neuspešno dohvatanje duplikata:', err)
    error.value = 'Neuspešno dohvatanje duplikata.'
  } finally {
    loading.value = false
  }
}

onMounted(loadDuplicates)
</script>
