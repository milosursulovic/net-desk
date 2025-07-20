<template>
  <div class="flex items-center space-x-2 text-2xl font-bold text-blue-700">
    <img :src="Icon" alt="Ikona" class="w-6 h-6" />
    <router-link to="/" class="hover:underline"> NetDesk </router-link>
  </div>
</template>

<script setup>
import Icon from '@/assets/icons/netdesk.png'
</script>
