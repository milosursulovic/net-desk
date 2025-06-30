<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-100 to-white">
    <header class="bg-white bg-opacity-90 shadow p-4 sticky top-0 z-50">
      <div class="max-w-7xl mx-auto flex justify-between items-center px-4">
        <Logo />
        <LogoutButton />
      </div>
    </header>
    <main class="max-w-7xl mx-auto px-4 py-6">
      <router-view />
    </main>
    <footer class="text-sm text-slate-500 text-center py-4">Verzija: {{ appVersion }}</footer>
  </div>
</template>

<script setup>
const appVersion = import.meta.env.VITE_APP_VERSION
import Logo from '@/components/Logo.vue'
import LogoutButton from '@/components/LogoutButton.vue'
</script>
