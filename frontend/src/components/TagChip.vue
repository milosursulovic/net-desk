<script setup>
defineProps({
  label: {
    type: String,
    required: true,
  },
  variant: {
    type: String,
    default: 'neutral', // neutral | accent
  },
  removable: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['remove'])
</script>

<template>
  <span
    class="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium"
    :class="
      variant === 'accent'
        ? 'border-accent-subtle bg-accent-subtle text-accent-emphasis'
        : 'border-line bg-surface-sunken text-ink-secondary'
    "
  >
    <span class="truncate">{{ label }}</span>
    <button
      v-if="removable"
      type="button"
      class="shrink-0 leading-none opacity-70 hover:opacity-100"
      :aria-label="`Ukloni ${label}`"
      @click="$emit('remove')"
    >
      ×
    </button>
  </span>
</template>
