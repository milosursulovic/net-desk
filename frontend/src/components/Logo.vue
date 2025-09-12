<template>
  <router-link
    to="/"
    class="flex items-center space-x-2 text-2xl font-bold text-blue-700 hover:opacity-90"
  >
    <img :src="Icon" alt="NetDesk" class="w-6 h-6" />
    <span>NetDesk</span>
  </router-link>
</template>

<script setup>
import Icon from '@/assets/icons/netdesk.png'
</script>
