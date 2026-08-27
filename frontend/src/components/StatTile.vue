<script setup>
defineProps({
  label: {
    type: String,
    required: true,
  },
  value: {
    type: [String, Number],
    required: true,
  },
  tone: {
    type: String,
    default: 'accent', // accent | good | bad | warn | info
  },
  // 0-1, omit to hide the proportion bar entirely (e.g. a plain "total" tile).
  proportion: {
    type: Number,
    default: null,
  },
})

const TEXT_CLASSES = {
  accent: 'text-accent',
  good: 'text-good',
  bad: 'text-bad',
  warn: 'text-warn',
  info: 'text-info',
}

const BAR_CLASSES = {
  accent: 'bg-accent',
  good: 'bg-good',
  bad: 'bg-bad',
  warn: 'bg-warn',
  info: 'bg-info',
}
</script>

<template>
  <div class="rounded-xl border border-line bg-surface p-4">
    <div class="text-[11px] font-semibold tracking-wider text-ink-muted uppercase" style="font-family: var(--font-display)">
      {{ label }}
    </div>
    <div class="mt-2 font-mono text-2xl font-semibold tabular-nums" :class="TEXT_CLASSES[tone] || TEXT_CLASSES.accent">
      {{ value }}
    </div>
    <div v-if="proportion !== null" class="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
      <span
        class="block h-full rounded-full"
        :class="BAR_CLASSES[tone] || BAR_CLASSES.accent"
        :style="{ width: `${Math.max(0, Math.min(100, Math.round(proportion * 100)))}%` }"
      ></span>
    </div>
  </div>
</template>
