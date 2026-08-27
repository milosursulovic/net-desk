<template>
  <router-link
    to="/"
    class="flex items-center gap-2 text-lg font-bold text-ink hover:opacity-90"
    style="font-family: var(--font-display)"
  >
    <img :src="Icon" alt="NetDesk" class="w-6 h-6" />
    <span>NetDesk</span>
  </router-link>
</template>

<script setup>
import Icon from '@/assets/icons/netdesk.png'
</script>
