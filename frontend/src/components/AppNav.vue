<script setup>
import { RouterLink, useRoute } from 'vue-router'

const links = [
  { to: '/', label: 'IP Adrese' },
  { to: '/metadata', label: 'Metapodaci' },
  { to: '/pdsu', label: 'PDSU' },
  { to: '/printers', label: 'Štampači' },
  { to: '/inventory', label: 'Inventar' },
]

const route = useRoute()

function isActive(to) {
  if (to === '/') return route.path === '/' || route.name === 'add-ip' || route.name === 'edit-ip'
  return route.path.startsWith(to)
}
</script>

<template>
  <nav class="w-full border-t border-slate-200 bg-white/70 px-4" aria-label="Glavna navigacija">
    <div class="flex flex-wrap gap-1 py-2">
      <RouterLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        class="rounded-lg px-3 py-1.5 text-sm font-medium transition"
        :class="
          isActive(link.to)
            ? 'bg-blue-600 text-white'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        "
      >
        {{ link.label }}
      </RouterLink>
    </div>
  </nav>
</template>
