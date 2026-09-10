<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import NavGroup from '@/components/NavGroup.vue'

const { t } = useI18n()

// Isti route spisak i role-gating logika kao staro AppNav.vue - samo
// grupisano po sekcijama umesto ravne trake, ništa dodato/oduzeto.
const monitoringLinks = computed(() => [
  { to: '/', label: t('nav.ipAddresses'), icon: 'home' },
  { to: '/metadata', label: t('nav.metadata'), icon: 'metadata' },
  { to: '/pdsu', label: t('nav.pdsu'), icon: 'pdsu' },
  { to: '/printers', label: t('nav.printers'), icon: 'printers' },
  { to: '/inventory', label: t('nav.inventory'), icon: 'inventory' },
  { to: '/agents', label: t('nav.agents'), icon: 'agents' },
])

const { isOperatorOrAdmin, isRootAdmin } = useCurrentUser()

const reportLinks = computed(() => {
  const links = [{ to: '/reports', label: t('nav.reports'), icon: 'reports' }]
  if (isOperatorOrAdmin.value) {
    links.push(
      { to: '/server-health', label: t('nav.server'), icon: 'server' },
      { to: '/dns-logs', label: t('nav.dnsLogs'), icon: 'dns' },
      { to: '/process-detections', label: t('nav.suspiciousProcesses'), icon: 'processes' },
    )
  }
  return links
})

const adminLinks = computed(() => {
  if (!isRootAdmin.value) return []
  return [
    { to: '/users', label: t('nav.users'), icon: 'users' },
    { to: '/logs', label: t('nav.logs'), icon: 'logs' },
    { to: '/config', label: t('nav.config'), icon: 'settings' },
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

const monitoringItems = computed(() => withActive(monitoringLinks.value))
const reportItems = computed(() => withActive(reportLinks.value))
const adminItems = computed(() => withActive(adminLinks.value))
</script>

<template>
  <nav
    class="no-print flex w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line bg-surface px-2.5 py-3"
    aria-label="Glavna navigacija"
  >
    <NavGroup :title="t('nav.monitoring')" :items="monitoringItems" />
    <NavGroup :title="t('nav.reports')" :items="reportItems" />
    <NavGroup v-if="adminItems.length" :title="t('nav.administration')" :items="adminItems" />
  </nav>
</template>
