<script setup>
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const { t } = useI18n()

const trail = computed(() => {
  const crumbs = [{ label: t('routes.home'), to: '/' }]

  if (route.name === 'home') {
    return crumbs
  }

  if (route.meta?.breadcrumbParent) {
    const { labelKey, label, to } = route.meta.breadcrumbParent
    crumbs.push({ label: labelKey ? t(labelKey) : label, to })
  }

  crumbs.push({
    label: route.meta?.breadcrumbKey ? t(route.meta.breadcrumbKey) : route.meta?.breadcrumb || route.meta?.title || '',
    to: route.fullPath,
  })

  return crumbs
})
</script>

<template>
  <nav v-if="trail.length > 1" class="mb-4 flex flex-wrap items-center gap-1.5 text-sm" :aria-label="t('routes.breadcrumbAriaLabel')">
    <template v-for="(crumb, idx) in trail" :key="`${crumb.to}-${idx}`">
      <RouterLink
        v-if="idx < trail.length - 1"
        :to="crumb.to"
        class="text-ink-muted hover:text-accent hover:underline"
      >
        {{ crumb.label }}
      </RouterLink>
      <span v-else class="font-medium text-ink">{{ crumb.label }}</span>

      <span v-if="idx < trail.length - 1" class="text-line-strong">/</span>
    </template>
  </nav>
</template>
