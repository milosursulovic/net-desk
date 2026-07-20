<template>
  <teleport to="body">
    <transition name="fade">
      <div v-if="open" class="fixed inset-0 z-[9997] flex" @click.self="$emit('close')" role="dialog" aria-modal="true">
        <div class="absolute inset-0 bg-black/40" />

        <div class="relative ml-auto h-full w-full bg-white shadow-xl overflow-y-auto" :class="widthClass">
          <div class="sticky top-0 z-10 bg-white/90 backdrop-blur border-b p-4 flex items-center justify-between">
            <h3 class="text-lg font-semibold">
              <slot name="title">{{ title }}</slot>
            </h3>
            <button @click="$emit('close')" class="text-slate-400 hover:text-red-600 text-2xl leading-none"
              aria-label="Zatvori">
              &times;
            </button>
          </div>

          <div class="p-4">
            <slot />
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
defineProps({
  open: Boolean,
  title: String,
  widthClass: { type: String, default: 'sm:w-[640px]' },
})

defineEmits(['close'])
</script>
