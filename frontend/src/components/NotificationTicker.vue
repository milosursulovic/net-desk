<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import NavIcon from '@/components/NavIcon.vue'

const notifications = ref([])
const POLL_MS = 60000

const levelClass = {
  critical: 'bg-bad text-white',
  warning: 'bg-warn text-white',
  info: 'bg-info text-white',
}

const levelIcon = {
  critical: 'ban',
  warning: 'alert-triangle',
  info: 'info',
}

// Duplirano radi bešavne petlje animacije (drugi set je duplikat prvog).
const loopItems = computed(() => [...notifications.value, ...notifications.value])

async function load() {
  try {
    const res = await fetchWithAuth('/api/protected/notifications')
    if (!res.ok) return
    const data = await res.json()
    notifications.value = Array.isArray(data.notifications) ? data.notifications : []
  } catch (err) {
    console.error('Neuspešno učitavanje obaveštenja', err)
  }
}

let timer = null
onMounted(() => {
  load()
  timer = setInterval(load, POLL_MS)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div v-if="notifications.length" class="notification-ticker">
    <div class="notification-ticker-track">
      <RouterLink
        v-for="(n, idx) in loopItems"
        :key="`${n.id}-${idx}`"
        :to="n.to || '/'"
        class="notification-chip"
        :class="levelClass[n.level] || levelClass.info"
      >
        <NavIcon :name="levelIcon[n.level] || levelIcon.info" />
        <span>{{ n.message }}</span>
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.notification-ticker {
  overflow: hidden;
  width: 100%;
  border-radius: 999px;
  background-color: var(--surface-sunken);
  mask-image: linear-gradient(
    to right,
    transparent 0,
    black 1.5rem,
    black calc(100% - 1.5rem),
    transparent 100%
  );
}

.notification-ticker-track {
  display: flex;
  width: max-content;
  align-items: center;
  gap: 0.6rem;
  padding: 0.35rem 0.6rem;
  animation: notification-scroll 30s linear infinite;
}

.notification-ticker:hover .notification-ticker-track {
  animation-play-state: paused;
}

.notification-chip {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  transition: opacity 0.15s ease;
}

.notification-chip:hover {
  opacity: 0.85;
}

@keyframes notification-scroll {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}
</style>
