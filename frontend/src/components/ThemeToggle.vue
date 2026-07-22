<template>
  <button
    type="button"
    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm text-slate-500 transition-colors hover:text-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
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
