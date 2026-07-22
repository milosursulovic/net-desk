<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'

const notifications = ref([])
const POLL_MS = 60000

const levelClass = {
  critical: 'bg-red-600 text-white',
  warning: 'bg-amber-500 text-amber-950',
  info: 'bg-blue-600 text-white',
}

const levelIcon = {
  critical: '⛔',
  warning: '⚠️',
  info: 'ℹ️',
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
        <span>{{ levelIcon[n.level] || levelIcon.info }}</span>
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
  background-color: #f1f5f9;
  mask-image: linear-gradient(
    to right,
    transparent 0,
    black 1.5rem,
    black calc(100% - 1.5rem),
    transparent 100%
  );
}

.dark .notification-ticker {
  background-color: #1e293b;
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
