<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import NavGroup from '@/components/NavGroup.vue'

// Isti route spisak i role-gating logika kao staro AppNav.vue - samo
// grupisano po sekcijama umesto ravne trake, ništa dodato/oduzeto.
const monitoringLinks = [
  { to: '/', label: 'IP Adrese', icon: 'home' },
  { to: '/metadata', label: 'Metapodaci', icon: 'metadata' },
  { to: '/pdsu', label: 'PDSU', icon: 'pdsu' },
  { to: '/printers', label: 'Štampači', icon: 'printers' },
  { to: '/inventory', label: 'Inventar', icon: 'inventory' },
  { to: '/agents', label: 'Agenti', icon: 'agents' },
]

const { isOperatorOrAdmin, isRootAdmin } = useCurrentUser()

const reportLinks = computed(() => {
  const links = [{ to: '/reports', label: 'Izveštaji', icon: 'reports' }]
  if (isOperatorOrAdmin.value) {
    links.push(
      { to: '/server-health', label: 'Server', icon: 'server' },
      { to: '/dns-logs', label: 'DNS Logovi', icon: 'dns' },
      { to: '/process-detections', label: 'Sumnjivi procesi', icon: 'processes' },
    )
  }
  return links
})

const adminLinks = computed(() => {
  if (!isRootAdmin.value) return []
  return [
    { to: '/users', label: 'Korisnici', icon: 'users' },
    { to: '/logs', label: 'Logovi', icon: 'logs' },
    { to: '/config', label: 'Konfiguracija', icon: 'settings' },
  ]
})

const route = useRoute()

function isActive(to) {
  if (to === '/') return route.path === '/' || route.name === 'add-ip' || route.name === 'edit-ip'
  return route.path.startsWith(to)
}

function withActive(links) {
  return links.map((link) => ({ ...link, active: isActive(link.to) }))
}

const monitoringItems = computed(() => withActive(monitoringLinks))
const reportItems = computed(() => withActive(reportLinks.value))
const adminItems = computed(() => withActive(adminLinks.value))
</script>

<template>
  <nav
    class="no-print flex w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line bg-surface px-2.5 py-3"
    aria-label="Glavna navigacija"
  >
    <NavGroup title="Nadzor" :items="monitoringItems" />
    <NavGroup title="Izveštaji" :items="reportItems" />
    <NavGroup v-if="adminItems.length" title="Administracija" :items="adminItems" />
  </nav>
</template>
