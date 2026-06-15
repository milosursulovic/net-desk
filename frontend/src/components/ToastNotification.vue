<template>
  <teleport to="body">
    <transition name="fade">
      <div v-if="message"
        class="fixed top-6 right-6 bg-gray-800 text-white px-4 py-2 rounded shadow-lg text-sm z-[9999]" role="status"
        aria-live="polite">
        {{ message }}
      </div>
    </transition>
  </teleport>
</template>

<script setup>
defineProps({
  message: String,
})
</script>
