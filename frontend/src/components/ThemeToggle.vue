<template>
  <button
    type="button"
    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-sm text-ink-secondary transition-colors hover:text-ink"
    :title="titles[theme]"
    @click="cycle"
  >
    {{ icons[theme] }}
  </button>
</template>

<script setup>
import { useTheme } from '@/composables/useTheme.js'

const { theme, setTheme } = useTheme()

const order = ['light', 'dark', 'system']
const icons = { light: '☀️', dark: '🌙', system: '🖥️' }
const titles = {
  light: 'Tema: svetla (klikni za tamnu)',
  dark: 'Tema: tamna (klikni za sistemsku)',
  system: 'Tema: prati sistem (klikni za svetlu)',
}

function cycle() {
  const next = order[(order.indexOf(theme.value) + 1) % order.length]
  setTheme(next)
}
</script>
