<template>
  <div
    class="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-white text-center px-4"
  >
    <!-- Logo -->
    <Logo class="mb-6 scale-125" />

    <h1 class="text-6xl font-extrabold text-red-600 mb-4 tracking-wider">404</h1>
    <p class="text-xl text-gray-700 mb-4">Stranica nije pronađena</p>

    <router-link
      to="/"
      class="bg-blue-600 text-white px-6 py-2 rounded shadow hover:bg-blue-700 transition"
    >
      ⬅️ Vrati se na početnu
    </router-link>
    <p class="text-center text-xs text-slate-500 mt-6">Verzija: {{ appVersion }}</p>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import Logo from '@/components/Logo.vue'

const appVersion = import.meta.env.VITE_APP_VERSION

onMounted(() => {
  document.title = `Stranica nije pronađena - Net Desk`
})
</script>
