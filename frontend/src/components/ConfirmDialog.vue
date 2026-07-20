<script setup>
import AppButton from '@/components/AppButton.vue'

defineProps({
  open: Boolean,
  title: { type: String, default: 'Potvrda' },
  message: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Potvrdi' },
  cancelLabel: { type: String, default: 'Otkaži' },
})

const emit = defineEmits(['confirm', 'cancel'])
</script>

<template>
  <teleport to="body">
    <transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-[9997] flex items-center justify-center bg-black/50 p-4"
        @click.self="emit('cancel')"
        role="dialog"
        aria-modal="true"
      >
        <div class="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
          <h2 class="text-lg font-semibold text-slate-800 mb-2">{{ title }}</h2>
          <p class="text-sm text-slate-600 mb-6">{{ message }}</p>
          <div class="flex justify-end gap-2">
            <AppButton variant="neutral" @click="emit('cancel')">{{ cancelLabel }}</AppButton>
            <AppButton variant="danger" @click="emit('confirm')">{{ confirmLabel }}</AppButton>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>
