<template>
  <div
    class="glass-container bg-white/80 backdrop-blur-md p-6 rounded-2xl shadow-lg max-w-4xl mx-auto"
  >
    <h1 class="text-2xl font-bold mb-6 text-gray-800">Izmeni IP Unos</h1>

    <form @submit.prevent="handleUpdate" class="space-y-4">
      <div v-for="field in fields" :key="field.name">
        <label :for="field.name" class="block text-sm font-medium text-gray-700 mb-1">
          {{ field.label }} <span v-if="field.name === 'ip'">*</span>
        </label>
        <input
          :id="field.name"
          v-model.trim="form[field.name]"
          type="text"
          class="w-full border px-4 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          :required="field.name === 'ip'"
          :class="field.name === 'ip' && ipError ? 'border-red-400' : ''"
        />
        <p v-if="field.name === 'ip' && ipError" class="text-xs text-red-600 mt-1">{{ ipError }}</p>
      </div>

      <div class="flex justify-between mt-6">
        <button
          type="button"
          @click="goBack"
          class="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
        >
          Poništi
        </button>
        <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          Sačuvaj izmene
        </button>
      </div>

      <p v-if="error" class="text-red-500 mt-4 text-center">{{ error }}</p>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth'

const route = useRoute()
const router = useRouter()
const error = ref('')

const form = ref({
  ip: '',
  computerName: '',
  username: '',
  fullName: '',
  password: '',
  rdp: '',
  anyDesk: '',
  os: '',
  department: '',
  heliantInstalled: ''
})

const fields = [
  { name: 'ip', label: 'IP Adresa' },
  { name: 'computerName', label: 'Ime računara' },
  { name: 'username', label: 'Korisničko ime' },
  { name: 'fullName', label: 'Puno ime' },
  { name: 'password', label: 'Lozinka' },
  { name: 'rdp', label: 'RDP' },
  { name: 'rdpApp', label: 'RDP App' },
  { name: 'os', label: 'Sistem' },
  { name: 'heliantInstalled', label: 'Heliant Instaliran?' },
  { name: 'department', label: 'Odeljenje' },
]

const ipError = computed(() => {
  if (!form.value.ip) return 'IP je obavezan'
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(form.value.ip) ? null : 'Neispravna IPv4 adresa'
})

const fetchEntry = async () => {
  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses/${route.params.id}`)
    if (!res.ok) {
      error.value = 'Unos nije pronađen'
      return
    }
    form.value = await res.json()
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
      const err = await res.json().catch(() => ({}))
      error.value = err.message || 'Izmena neuspešna'
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

<style scoped>
.glass-container {
  backdrop-filter: saturate(140%) blur(2px);
}
</style>
