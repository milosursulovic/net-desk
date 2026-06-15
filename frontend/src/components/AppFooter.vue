<template>
  <div :class="wrapperClass">
    <div>&copy; {{ year }} {{ copyright }}</div>
    <div v-if="showVersion" class="mt-1 text-xs text-gray-400">Verzija: {{ appVersion }}</div>
  </div>
</template>

<script setup>
import { useAppInfo } from '@/composables/useAppInfo.js'

defineProps({
  showVersion: { type: Boolean, default: true },
  wrapperClass: { type: String, default: '' },
})

const { appVersion, year, copyright } = useAppInfo()
</script>
