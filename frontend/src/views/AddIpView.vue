<template>
  <div class="bg-white/80 backdrop-blur-md p-8 rounded-2xl shadow-2xl w-full max-w-xl mx-auto">
    <h1 class="text-2xl font-bold text-gray-800 mb-6">➕ Dodaj novu IP adresu</h1>

    <form @submit.prevent="handleSubmit" class="space-y-5">
      <div v-for="field in fields" :key="field.name">
        <label :for="field.name" class="block text-sm font-medium text-gray-700 mb-1">
          {{ field.label }}
        </label>
        <div class="relative">
          <input
            :id="field.name"
            v-model="form[field.name]"
            type="text"
            :placeholder="`Unesite ${field.label.toLowerCase()}`"
            class="w-full border border-gray-300 px-4 py-2 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pl-10"
            required
          />
          <span class="absolute left-3 top-2.5 text-gray-400">
            {{ getFieldIcon(field.name) }}
          </span>
        </div>
      </div>

      <div class="flex justify-between pt-4">
        <button
          type="button"
          @click="goBack"
          class="bg-gray-400 hover:bg-gray-500 text-white px-4 py-2 rounded-lg transition"
        >
          ◀️ Poništi
        </button>
        <button
          type="submit"
          class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow transition"
        >
          ✅ Dodaj
        </button>
      </div>
    </form>

    <p v-if="error" class="text-red-500 mt-4 text-center animate-pulse">
      {{ error }}
    </p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import LogoutButton from '@/components/LogoutButton.vue'
import { getFieldIcon } from '@/utils/icons.js'

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
})

const fields = [
  { name: 'ip', label: 'IP Adresa' },
  { name: 'computerName', label: 'Ime računara' },
  { name: 'username', label: 'Korisničko ime' },
  { name: 'fullName', label: 'Puno ime' },
  { name: 'password', label: 'Lozinka' },
  { name: 'rdp', label: 'RDP' },
]

const handleSubmit = async () => {
  try {
    const res = await fetchWithAuth('/api/protected/ip-addresses', {
      method: 'POST',
      body: JSON.stringify(form.value),
    })

    if (!res.ok) {
      const err = await res.json()
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
  document.title = `Dodaj IP - Net Desk`
  if (route.query.ip) {
    form.value.ip = route.query.ip
  }
})
</script>
