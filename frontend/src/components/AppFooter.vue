<template>
  <div :class="wrapperClass">
    <div>&copy; {{ year }} {{ copyright }}</div>
  </div>
</template>

<script setup>
import { useAppInfo } from '@/composables/useAppInfo.js'

defineProps({
  showVersion: { type: Boolean, default: true },
  wrapperClass: { type: String, default: '' },
})

const { year, copyright } = useAppInfo()
</script>
