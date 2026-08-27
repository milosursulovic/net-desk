<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-canvas text-center px-4">
    <Logo class="mb-6 scale-125" />
    <h1 class="text-6xl font-extrabold text-bad mb-4 tracking-wider" style="font-family: var(--font-display)">404</h1>
    <p class="text-xl text-ink mb-4">Stranica nije pronađena</p>

    <AppButton variant="primary" to="/" aria-label="Vrati se na početnu">
      Vrati se na početnu
    </AppButton>

    <AppFooter wrapper-class="text-center text-xs text-ink-muted mt-6" />
  </div>
</template>

<script setup>
import Logo from '@/components/Logo.vue'
import AppFooter from '@/components/AppFooter.vue'
import AppButton from '@/components/AppButton.vue'
</script>
