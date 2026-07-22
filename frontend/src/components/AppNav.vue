<script setup>
import { RouterLink, useRoute } from 'vue-router'

const links = [
  { to: '/', label: 'IP Adrese' },
  { to: '/metadata', label: 'Metapodaci' },
  { to: '/pdsu', label: 'PDSU' },
  { to: '/printers', label: 'Štampači' },
  { to: '/inventory', label: 'Inventar' },
  { to: '/agents', label: 'Agenti' },
]

const route = useRoute()

function isActive(to) {
  if (to === '/') return route.path === '/' || route.name === 'add-ip' || route.name === 'edit-ip'
  return route.path.startsWith(to)
}
</script>

<template>
  <nav class="w-full border-t border-slate-200 bg-white/70 px-4" aria-label="Glavna navigacija">
    <!-- Ispod sm: horizontalni scroll umesto lomljenja u više redova - jedan
         red koji se prevlači je čitljiviji na uskom ekranu od 2-3 zbijena
         reda linkova. Na sm i više, ponaša se kao obična traka koja se lomi. -->
    <div class="flex flex-nowrap gap-1 overflow-x-auto py-2 sm:flex-wrap sm:overflow-visible no-scrollbar">
      <RouterLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        class="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition"
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
