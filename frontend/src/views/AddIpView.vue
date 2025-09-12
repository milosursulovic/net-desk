<template>
  <div class="bg-white/80 backdrop-blur-md p-8 rounded-2xl shadow-2xl w-full max-w-xl mx-auto">
    <h1 class="text-2xl font-bold text-gray-800 mb-6">➕ Dodaj novu IP adresu</h1>

    <form @submit.prevent="handleSubmit" class="space-y-5">
      <div>
        <label for="ip" class="block text-sm font-medium text-gray-700 mb-1">IP Adresa *</label>
        <div class="relative">
          <input
            id="ip"
            v-model.trim="form.ip"
            type="text"
            placeholder="Unesite IP adresu"
            class="w-full border border-gray-300 px-4 py-2 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pl-10"
            required
            :class="ipError ? 'border-red-400' : ''"
          />
          <span class="absolute left-3 top-2.5 text-gray-400">🌐</span>
        </div>
        <p v-if="ipError" class="text-xs text-red-600 mt-1">{{ ipError }}</p>
      </div>

      <div v-for="field in optionalFields" :key="field.name">
        <label :for="field.name" class="block text-sm font-medium text-gray-700 mb-1">
          {{ field.label }}
        </label>
        <div class="relative">
          <input
            :id="field.name"
            v-model.trim="form[field.name]"
            type="text"
            :placeholder="`Unesite ${field.label.toLowerCase()}`"
            class="w-full border border-gray-300 px-4 py-2 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pl-10"
          />
          <span class="absolute left-3 top-2.5 text-gray-400">
            {{ field.icon }}
          </span>
        </div>
      </div>

      <div class="flex justify-between pt-4">
        <button
          type="button"
          @click="goBack"
          class="bg-gray-400 hover:bg-gray-500 text-white px-4 py-2 rounded-lg"
        >
          ◀️ Poništi
        </button>
        <button
          type="submit"
          class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow"
        >
          ✅ Dodaj
        </button>
      </div>
    </form>

    <p v-if="error" class="text-red-500 mt-4 text-center animate-pulse">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'

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
  dnsLog: '',
  anyDesk: '',
  system: '',
  department: '',
})

const optionalFields = [
  { name: 'computerName', label: 'Ime računara', icon: '🖥️' },
  { name: 'username', label: 'Korisničko ime', icon: '👤' },
  { name: 'fullName', label: 'Puno ime', icon: '🙍‍♂️' },
  { name: 'password', label: 'Lozinka', icon: '🔒' },
  { name: 'rdp', label: 'RDP', icon: '🖧' },
  { name: 'dnsLog', label: 'DNS Log', icon: '🌐' },
  { name: 'anyDesk', label: 'AnyDesk', icon: '💻' },
  { name: 'system', label: 'Sistem', icon: '🧩' },
  { name: 'department', label: 'Odeljenje', icon: '🏢' },
]

const ipError = computed(() => {
  if (!form.value.ip) return null
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(form.value.ip) ? null : 'Neispravna IPv4 adresa'
})

const handleSubmit = async () => {
  if (ipError.value) {
    error.value = ipError.value
    return
  }
  try {
    const res = await fetchWithAuth('/api/protected/ip-addresses', {
      method: 'POST',
      body: JSON.stringify(form.value),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      error.value = err.message || 'Neuspešno dodata adresa'
      return
    }
    router.push('/')
  } catch (err) {
    console.error(err)
    error.value = 'Greška na serveru'
  }
}

const goBack = () => router.push('/')

onMounted(() => {
  if (route.query.ip) form.value.ip = String(route.query.ip)
})
</script>
