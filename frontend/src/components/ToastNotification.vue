<template>
  <teleport to="body">
    <transition name="fade">
      <div v-if="message"
        class="fixed top-6 right-6 z-9999 flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg shadow-lg text-sm" role="status"
        aria-live="polite">
        <NavIcon :name="iconName" :class="iconClass" />
        {{ message.text }}
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { computed } from 'vue'
import NavIcon from '@/components/NavIcon.vue'

const props = defineProps({
  message: { type: Object, default: null },
})

const ICON_BY_KIND = { success: 'check', error: 'x', warning: 'alert-triangle', info: 'info' }
const COLOR_BY_KIND = { success: 'text-good', error: 'text-bad', warning: 'text-warn', info: 'text-info' }

const iconName = computed(() => ICON_BY_KIND[props.message?.kind] || 'check')
const iconClass = computed(() => COLOR_BY_KIND[props.message?.kind] || 'text-good')
</script>
