<script setup>
import NavIcon from '@/components/NavIcon.vue'

defineProps({
  title: {
    type: String,
    default: '',
  },
  // [{ to, label, active, icon }] - `active`/`icon` (an icon-name key for
  // NavIcon) computed by the caller (Sidebar.vue owns isActive()/the icon
  // map), this component just renders.
  items: {
    type: Array,
    required: true,
  },
})
</script>

<template>
  <div>
    <div v-if="title" class="px-2.5 pt-3.5 pb-1.5 text-[10.5px] font-semibold tracking-wider text-ink-muted uppercase" style="font-family: var(--font-display)">
      {{ title }}
    </div>
    <RouterLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium no-underline"
      :class="item.active ? 'bg-accent-subtle font-semibold text-accent-emphasis' : 'text-ink-secondary hover:bg-surface-sunken hover:text-ink'"
    >
      <NavIcon :name="item.icon" class="shrink-0" />
      {{ item.label }}
    </RouterLink>
  </div>
</template>
