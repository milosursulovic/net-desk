<template>
  <div class="w-full max-w-2xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">Duplirana imena računara</h1>
      <AppButton variant="neutral" @click="goBack">Nazad</AppButton>
    </div>

    <div v-if="loading" class="text-ink-secondary">Učitavanje…</div>
    <div v-else-if="error" class="text-bad">{{ error }}</div>

    <template v-else>
      <div v-if="duplicateGroups.length === 0" class="text-ink-secondary">
        Nema duplih imena računara.
      </div>

      <div v-else class="space-y-3">
        <div v-for="g in duplicateGroups" :key="g.key || g.name" class="rounded-lg border border-line bg-surface-sunken p-3">
          <div class="flex items-center justify-between">
            <div class="font-medium text-ink">
              {{ g.name }} <span class="text-xs text-ink-muted">({{ g.count }} kom)</span>
            </div>
            <div class="flex items-center gap-2">
              <button
                class="text-xs px-2 py-1 rounded bg-accent text-white hover:bg-accent-emphasis"
                @click="filterOn(g.name)"
                title="Filtriraj na ovo ime (search)"
              >
                Filtriraj
              </button>
              <button
                class="text-xs px-2 py-1 rounded border border-line text-ink-secondary hover:bg-surface"
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
              class="bg-surface rounded-lg border border-line p-2 text-sm flex items-center justify-between gap-2"
            >
              <div class="min-w-0">
                <div class="font-medium text-ink font-mono truncate">{{ it.ip }}</div>
                <div class="text-xs text-ink-muted truncate">{{ it.department || '—' }}</div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button
                  class="text-xs text-accent hover:underline"
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
                  <NavIcon name="copy" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="duplicateGroups.length" class="mt-3 text-xs text-ink-muted">
        Savet: U idealnom slučaju svaka mašina ima jedinstveno ime (npr. standardizovan prefiks i
        inventarski broj). Ove grupe pomažu da brzo uočite konfliktne nazive.
      </div>
    </template>

    <ToastNotification :message="toast" />
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { useToast } from '@/composables/useToast.js'
import { useCurrentSite } from '@/composables/useCurrentSite.js'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import NavIcon from '@/components/NavIcon.vue'

const router = useRouter()
const site = useCurrentSite()
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
    const params = new URLSearchParams({ search: '', status: 'all', site: site.value })
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
watch(site, loadDuplicates)
</script>
