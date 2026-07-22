<template>
  <div
    class="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-white dark:from-slate-950 dark:to-slate-900 text-center px-4">
    <Logo class="mb-6 scale-125" />
    <h1 class="text-6xl font-extrabold text-red-600 mb-4 tracking-wider">404</h1>
    <p class="text-xl text-slate-700 mb-4">Stranica nije pronađena</p>

    <AppButton variant="primary" to="/" aria-label="Vrati se na početnu">
      Vrati se na početnu
    </AppButton>

    <AppFooter wrapper-class="text-center text-xs text-slate-500 mt-6" />
  </div>
</template>

<script setup>
import Logo from '@/components/Logo.vue'
import AppFooter from '@/components/AppFooter.vue'
import AppButton from '@/components/AppButton.vue'
</script>
