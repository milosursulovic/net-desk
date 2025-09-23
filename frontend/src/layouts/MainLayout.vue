<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-100 to-white flex flex-col">
    <header class="bg-white/90 shadow p-4 sticky top-0 z-50">
      <div class="w-full flex justify-between items-center px-4">
        <Logo />

        <div class="flex items-center gap-4">
          <span class="text-sm text-gray-700 font-medium" title="Prijavljen korisnik">
            👤 {{ currentUser?.username || 'Nepoznat' }}
          </span>
          <LogoutButton />
        </div>
      </div>
    </header>

    <main class="w-full px-4 py-6 flex-1">
      <router-view />
    </main>

    <footer class="w-full text-center text-sm text-gray-500 py-4 border-t">
      <div>&copy; {{ year }} Informacioni sistem Opšte bolnice Bor</div>
      <div class="mt-1 text-xs text-gray-400">Verzija: {{ appVersion }}</div>
    </footer>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import Logo from '@/components/Logo.vue'
import LogoutButton from '@/components/LogoutButton.vue'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'

const appVersion = import.meta.env.VITE_APP_VERSION
const year = computed(() => new Date().getFullYear())

const currentUser = ref(null)

onMounted(async () => {
  try {
    const res = await fetchWithAuth('/api/auth/me')
    if (res.ok) currentUser.value = await res.json()
  } catch (err) {
    console.error('Greška pri učitavanju korisnika', err)
  }
})
</script>
