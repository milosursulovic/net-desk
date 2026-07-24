<template>
  <div class="glass-container">
    <h1 class="text-2xl font-bold text-slate-800 mb-4">Konfiguracija</h1>

    <div v-if="loading" class="text-slate-600">Učitavanje…</div>
    <div v-else-if="error" class="text-red-600">{{ error }}</div>

    <div v-else class="space-y-3">
      <div
        v-for="setting in settings"
        :key="setting.key"
        class="rounded-xl border bg-white p-4 shadow-sm flex items-start justify-between gap-4"
      >
        <div class="min-w-0">
          <div class="font-medium">{{ setting.label }}</div>
          <p v-if="setting.description" class="text-sm text-slate-500 mt-0.5">
            {{ setting.description }}
          </p>
          <p v-if="setting.updatedAt" class="text-xs text-slate-400 mt-1">
            Poslednja izmena: {{ fmtDate(setting.updatedAt) }}
          </p>
        </div>

        <label class="inline-flex shrink-0 cursor-pointer items-center">
          <input
            type="checkbox"
            class="sr-only peer"
            :checked="setting.value"
            :disabled="saving === setting.key"
            @change="toggle(setting)"
          />
          <div
            class="h-6 w-11 rounded-full bg-slate-200 peer-checked:bg-blue-600 transition-colors relative after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5"
          ></div>
        </label>
      </div>

      <div v-if="!settings.length" class="text-sm text-slate-500">Nema podešavanja.</div>
    </div>

    <ToastNotification :message="toast" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { fmtDate as formatDate } from '@/utils/format.js'
import { useToast } from '@/composables/useToast.js'
import ToastNotification from '@/components/ToastNotification.vue'

const { toast, showToast } = useToast()
const fmtDate = (d) => formatDate(d, 'sr-RS')

const settings = ref([])
const loading = ref(false)
const error = ref('')
const saving = ref('')

async function fetchData() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetchWithAuth('/api/protected/settings')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    settings.value = await res.json()
  } catch (e) {
    console.error('Neuspešno učitavanje podešavanja:', e)
    error.value = 'Neuspešno učitavanje podešavanja.'
  } finally {
    loading.value = false
  }
}

async function toggle(setting) {
  const nextValue = !setting.value
  saving.value = setting.key
  try {
    const res = await fetchWithAuth('/api/protected/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: setting.key, value: nextValue }),
    })
    if (!res.ok) throw new Error(await parseError(res, `HTTP ${res.status}`))
    settings.value = await res.json()
    showToast('Podešavanje sačuvano')
  } catch (e) {
    console.error('Greška pri izmeni podešavanja:', e)
    showToast(e.message || 'Greška pri izmeni podešavanja.', { prefix: '❌ ', duration: 3000 })
  } finally {
    saving.value = ''
  }
}

onMounted(fetchData)
</script>
