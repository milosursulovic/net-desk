<script setup>
import NavIcon from '@/components/NavIcon.vue'

defineProps({
  status: {
    type: String,
    default: 'neutral', // good | bad | warn | info | neutral
  },
  label: {
    type: String,
    required: true,
  },
  dot: {
    type: Boolean,
    default: true,
  },
  // Kad je prosleđena, zamenjuje dot indikator ikonicom (NavIcon name) -
  // za pill-ove gde je konkretna ikona informativnija od generičke tačkice.
  icon: {
    type: String,
    default: '',
  },
})

const TONE_CLASSES = {
  good: 'bg-good-subtle text-good',
  bad: 'bg-bad-subtle text-bad',
  warn: 'bg-warn-subtle text-warn',
  info: 'bg-info-subtle text-info',
  neutral: 'bg-surface-sunken text-ink-muted',
}

const DOT_CLASSES = {
  good: 'bg-good',
  bad: 'bg-bad',
  warn: 'bg-warn',
  info: 'bg-info',
  neutral: 'bg-ink-muted',
}
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
    :class="TONE_CLASSES[status] || TONE_CLASSES.neutral"
  >
    <NavIcon v-if="icon" :name="icon" class="shrink-0" />
    <span v-else-if="dot" class="h-1.5 w-1.5 shrink-0 rounded-full" :class="DOT_CLASSES[status] || DOT_CLASSES.neutral"></span>
    {{ label }}
  </span>
</template>
