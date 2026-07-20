<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 via-white to-slate-100"
  >
    <div class="bg-white/70 backdrop-blur-md p-8 rounded-2xl shadow-2xl w-full max-w-md">
      <div class="flex justify-center mb-6">
        <Logo />
      </div>
      <h2 class="text-xl font-semibold text-center text-gray-700 mb-6 tracking-tight">
        👋 Dobrodošli nazad
      </h2>

      <form @submit.prevent="handleLogin" class="space-y-5">
        <div>
          <label for="username" class="block text-sm font-medium text-gray-700 mb-1"
            >Korisničko ime</label
          >
          <div class="relative">
            <input
              id="username"
              v-model.trim="username"
              type="text"
              required
              placeholder="Unesite korisničko ime"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 pl-10"
            />
          </div>
        </div>

        <div>
          <label for="password" class="block text-sm font-medium text-gray-700 mb-1">Lozinka</label>
          <div class="relative">
            <input
              id="password"
              v-model="password"
              type="password"
              required
              placeholder="Unesite lozinku"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 pl-10"
            />
          </div>
        </div>

        <button
          type="submit"
          class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-xl shadow"
        >
          Prijavi se
        </button>

        <p v-if="errorMessage" class="text-red-500 text-sm text-center mt-2 animate-pulse">
          {{ errorMessage }}
        </p>

        <div class="mt-8 text-center text-xs text-slate-500 space-y-1">
          <p>&copy; {{ year }} {{ copyright }}</p>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Logo from '@/components/Logo.vue'
import { useAppInfo } from '@/composables/useAppInfo.js'

const { year, copyright } = useAppInfo()

const router = useRouter()
const route = useRoute()

const username = ref('')
const password = ref('')
const errorMessage = ref('')

const handleLogin = async () => {
  if (!username.value || !password.value) {
    errorMessage.value = 'Korisničko ime i lozinka su obavezna polja'
    return
  }
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.value, password: password.value }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      errorMessage.value = data.message || 'Neuspešna prijava'
      return
    }
    localStorage.setItem('token', data.token)
    const returnTo = route.query.returnTo ? String(route.query.returnTo) : '/'
    router.push(returnTo)
  } catch (err) {
    console.error(err)
    errorMessage.value = 'Greška na serveru'
  }
}
</script>
