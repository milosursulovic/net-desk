<script setup>
defineProps({
  variant: {
    type: String,
    default: 'primary', // primary | secondary | neutral | danger | success
  },
  to: {
    type: [String, Object],
    default: null,
  },
  type: {
    type: String,
    default: 'button',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})
</script>

<template>
  <RouterLink v-if="to" :to="to" class="app-btn" :class="`app-btn-${variant}`">
    <slot />
  </RouterLink>

  <button v-else :type="type" :disabled="disabled" class="app-btn" :class="`app-btn-${variant}`">
    <slot />
  </button>
</template>
