<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-100 to-white flex flex-col">
    <header class="bg-white bg-opacity-90 shadow p-4 sticky top-0 z-50">
      <div class="max-w-7xl mx-auto flex justify-between items-center px-4">
        <Logo />
        <LogoutButton />
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 py-6 flex-1 w-full">
      <router-view />
    </main>

    <footer class="text-center text-sm text-gray-500 py-4 border-t">
      <div>&copy; {{ year }} Informacioni sistem Opšte bolnice Bor</div>
      <div class="mt-1 text-xs text-gray-400">Verzija: {{ appVersion }}</div>
    </footer>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Logo from '@/components/Logo.vue'
import LogoutButton from '@/components/LogoutButton.vue'

const appVersion = import.meta.env.VITE_APP_VERSION
const year = computed(() => new Date().getFullYear())
</script>
