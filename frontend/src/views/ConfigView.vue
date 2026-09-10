<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">{{ t('config.title') }}</h1>

    <div v-if="loading" class="text-ink-secondary">{{ t('common.loading') }}</div>
    <div v-else-if="error" class="text-bad">{{ error }}</div>

    <div v-else class="space-y-3">
      <div
        v-for="setting in settings"
        :key="setting.key"
        class="rounded-xl border border-line bg-surface p-4 shadow-sm flex items-start justify-between gap-4"
      >
        <div class="min-w-0">
          <div class="font-medium text-ink">{{ setting.label }}</div>
          <p v-if="setting.description" class="text-sm text-ink-muted mt-0.5">
            {{ setting.description }}
          </p>
          <p v-if="setting.updatedAt" class="text-xs text-ink-muted mt-1 font-mono">
            {{ t('config.lastChanged', { date: fmtDate(setting.updatedAt) }) }}
          </p>
        </div>

        <select
          v-if="setting.type === 'select'"
          class="app-input w-auto shrink-0"
          :value="setting.value"
          :disabled="saving === setting.key"
          @change="selectChanged(setting, $event.target.value)"
        >
          <option v-for="o in setting.options" :key="o.value" :value="o.value">
            {{ o.flag ? `${o.flag} ` : '' }}{{ o.label }}
          </option>
        </select>

        <label v-else class="inline-flex shrink-0 cursor-pointer items-center">
          <input
            type="checkbox"
            class="sr-only peer"
            :checked="setting.value"
            :disabled="saving === setting.key"
            @change="toggle(setting)"
          />
          <div
            class="h-6 w-11 rounded-full bg-surface-sunken peer-checked:bg-accent transition-colors relative after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5"
          ></div>
        </label>
      </div>

      <div v-if="!settings.length" class="text-sm text-ink-muted">{{ t('config.noSettings') }}</div>
    </div>

    <ToastNotification :message="toast" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { fmtDate as formatDate } from '@/utils/format.js'
import { useToast } from '@/composables/useToast.js'
import { setAppLanguage } from '@/i18n/index.js'
import ToastNotification from '@/components/ToastNotification.vue'

const { t, locale } = useI18n()
const { toast, showToast } = useToast()
const fmtDate = (d) => formatDate(d, locale.value === 'en' ? 'en-US' : 'sr-RS')

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
    error.value = t('config.loadError')
  } finally {
    loading.value = false
  }
}

async function saveSetting(setting, nextValue) {
  saving.value = setting.key
  try {
    const res = await fetchWithAuth('/api/protected/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: setting.key, value: nextValue }),
    })
    if (!res.ok) throw new Error(await parseError(res, `HTTP ${res.status}`))
    settings.value = await res.json()
    if (setting.key === 'app_language') setAppLanguage(nextValue)
    showToast(t('config.saveSuccess'))
  } catch (e) {
    console.error('Greška pri izmeni podešavanja:', e)
    showToast(e.message || t('config.saveError'), { kind: 'error', duration: 3000 })
  } finally {
    saving.value = ''
  }
}

const toggle = (setting) => saveSetting(setting, !setting.value)
const selectChanged = (setting, value) => saveSetting(setting, value)

onMounted(fetchData)
</script>
