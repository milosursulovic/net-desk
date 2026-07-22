<template>
  <button
    v-if="isSupported"
    type="button"
    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm transition-colors"
    :class="isSubscribed ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500 hover:text-slate-700'"
    :disabled="loading"
    :title="isSubscribed ? 'Isključi push notifikacije na ovom uređaju' : 'Uključi push notifikacije na ovom uređaju'"
    @click="toggle"
  >
    {{ isSubscribed ? '🔔' : '🔕' }}
  </button>
</template>

<script setup>
import { onMounted } from 'vue'
import { usePushNotifications } from '@/composables/usePushNotifications.js'

const { isSupported, isSubscribed, loading, error, checkSubscription, subscribe, unsubscribe } =
  usePushNotifications()

async function toggle() {
  if (isSubscribed.value) {
    await unsubscribe()
  } else {
    await subscribe()
  }
  if (error.value) console.error(error.value)
}

onMounted(checkSubscription)
</script>
