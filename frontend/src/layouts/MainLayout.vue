<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-100 to-white flex flex-col">
    <header class="bg-white/90 shadow sticky top-0 z-50">
      <div class="w-full flex justify-between items-center px-4 py-4">
        <Logo />

        <div class="flex items-center gap-4">
          <span class="text-sm text-gray-700 font-medium" title="Prijavljen korisnik">
            {{ currentUser?.username || 'Nepoznat' }}
          </span>
          <LogoutButton />
        </div>
      </div>

      <AppNav />
    </header>

    <main class="w-full px-4 py-6 flex-1">
      <Breadcrumbs />
      <router-view />
    </main>

    <footer class="w-full text-center text-sm text-gray-500 py-4 border-t">
      <AppFooter />
    </footer>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import Logo from '@/components/Logo.vue'
import LogoutButton from '@/components/LogoutButton.vue'
import AppFooter from '@/components/AppFooter.vue'
import AppNav from '@/components/AppNav.vue'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'

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
