<template>
  <div :class="wrapperClass">
    <div>
      &copy; {{ year }} {{ copyright }}
      <span v-if="showVersion" class="text-ink-muted"> · v{{ version }}</span>
    </div>
  </div>
</template>

<script setup>
import { useAppInfo } from '@/composables/useAppInfo.js'

defineProps({
  showVersion: { type: Boolean, default: true },
  wrapperClass: { type: String, default: '' },
})

const { year, copyright, version } = useAppInfo()
</script>
