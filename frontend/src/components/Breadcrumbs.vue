<script setup>
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()

const trail = computed(() => {
  const crumbs = [{ label: 'Početna', to: '/' }]

  if (route.name === 'home') {
    return crumbs
  }

  if (route.meta?.breadcrumbParent) {
    crumbs.push(route.meta.breadcrumbParent)
  }

  crumbs.push({
    label: route.meta?.breadcrumb || route.meta?.title || '',
    to: route.fullPath,
  })

  return crumbs
})
</script>

<template>
  <nav v-if="trail.length > 1" class="mb-4 flex flex-wrap items-center gap-1.5 text-sm" aria-label="Breadcrumb">
    <template v-for="(crumb, idx) in trail" :key="`${crumb.to}-${idx}`">
      <RouterLink
        v-if="idx < trail.length - 1"
        :to="crumb.to"
        class="text-slate-500 hover:text-blue-600 hover:underline"
      >
        {{ crumb.label }}
      </RouterLink>
      <span v-else class="font-medium text-slate-700">{{ crumb.label }}</span>

      <span v-if="idx < trail.length - 1" class="text-slate-300">/</span>
    </template>
  </nav>
</template>
