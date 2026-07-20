<template>
  <div class="glass-container w-full max-w-2xl mx-auto">
    <h1 class="text-2xl font-bold mb-6 text-slate-800">Izmeni IP Unos</h1>

    <form @submit.prevent="handleUpdate" class="space-y-4">
      <div>
        <label for="entryType" class="block text-sm font-medium text-slate-700 mb-1">Tip</label>
        <select id="entryType" v-model="entryTypeModel" class="app-input w-full">
          <option value="">— Nije određeno —</option>
          <option v-for="opt in ENTRY_TYPE_OPTIONS" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>

      <div v-for="field in fields" :key="field.name">
        <label :for="field.name" class="block text-sm font-medium text-slate-700 mb-1">
          {{ field.label }} <span v-if="field.name === 'ip'">*</span>
        </label>

        <textarea
          v-if="field.name === 'description'"
          :id="field.name"
          v-model.trim="form[field.name]"
          rows="6"
          placeholder="Unesi opis..."
          class="app-input w-full resize-y"
        />

        <input
          v-else
          :id="field.name"
          v-model.trim="form[field.name]"
          type="text"
          class="app-input w-full"
          :required="field.name === 'ip'"
          :class="field.name === 'ip' && ipError ? 'border-red-400' : ''"
        />

        <p v-if="field.name === 'ip' && ipError" class="text-xs text-red-600 mt-1">
          {{ ipError }}
        </p>
      </div>

      <div class="flex justify-between mt-6">
        <AppButton type="button" variant="neutral" @click="goBack">Poništi</AppButton>
        <AppButton type="submit" variant="primary">Sačuvaj izmene</AppButton>
      </div>

      <p v-if="error" class="text-red-500 mt-4 text-center">{{ error }}</p>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth'
import { parseError } from '@/utils/api.js'
import AppButton from '@/components/AppButton.vue'
import {
  createIpEntryForm,
  IP_ENTRY_FIELDS,
  validateIpv4,
} from '@/constants/ipEntryFields.js'
import { ENTRY_TYPE_OPTIONS } from '@/constants/entryTypes.js'

const route = useRoute()
const router = useRouter()
const error = ref('')
const form = ref(createIpEntryForm())
const fields = IP_ENTRY_FIELDS

const ipError = computed(() => validateIpv4(form.value.ip, { required: true }))

const entryTypeModel = computed({
  get: () => form.value.entryType ?? '',
  set: (value) => {
    form.value.entryType = value || null
  },
})

const fetchEntry = async () => {
  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses/${route.params.id}`)
    if (!res.ok) {
      error.value = 'Unos nije pronađen'
      return
    }
    form.value = createIpEntryForm(await res.json())
  } catch (err) {
    console.error(err)
    error.value = 'Neuspešno učitan unos'
  }
}

const handleUpdate = async () => {
  if (ipError.value) {
    error.value = ipError.value
    return
  }
  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses/${route.params.id}`, {
      method: 'PUT',
      body: JSON.stringify(form.value),
    })

    if (!res.ok) {
      error.value = await parseError(res, 'Izmena neuspešna')
      return
    }

    router.push('/')
  } catch (err) {
    console.error(err)
    error.value = 'Greška na serveru'
  }
}

const goBack = () => router.push('/')

onMounted(fetchEntry)
</script>
