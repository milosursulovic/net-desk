<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-100 to-white flex flex-col">
    <header class="bg-white/90 shadow sticky top-0 z-50">
      <div class="w-full flex justify-between items-center px-4 py-3">
        <div class="flex items-center gap-3">
          <Logo />

          <span class="hidden h-8 w-px bg-slate-200 md:inline-block"></span>

          <span class="hidden max-w-xs text-xs leading-tight text-slate-500 md:block">
            {{ copyright }}
          </span>
        </div>

        <div class="flex items-center gap-3">
          <div class="hidden items-center gap-2 rounded-full bg-slate-100 py-1.5 pl-1.5 pr-3 sm:flex">
            <div
              class="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white"
            >
              {{ userInitial }}
            </div>
            <span class="text-sm font-medium text-slate-700" title="Prijavljen korisnik">
              {{ currentUser?.username || 'Nepoznat' }}
            </span>
          </div>

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
import { ref, computed, onMounted } from 'vue'
import Logo from '@/components/Logo.vue'
import LogoutButton from '@/components/LogoutButton.vue'
import AppFooter from '@/components/AppFooter.vue'
import AppNav from '@/components/AppNav.vue'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { useAppInfo } from '@/composables/useAppInfo.js'

const { copyright } = useAppInfo()

const currentUser = ref(null)

const userInitial = computed(() => {
  const name = currentUser.value?.username || ''
  return name ? name.charAt(0).toUpperCase() : '?'
})

onMounted(async () => {
  try {
    const res = await fetchWithAuth('/api/auth/me')
    if (res.ok) currentUser.value = await res.json()
  } catch (err) {
    console.error('Greška pri učitavanju korisnika', err)
  }
})
</script>
