<template>
  <div>
    <label class="block text-sm font-medium text-slate-700 mb-1">{{ label }}</label>
    <input :value="modelValue" :placeholder="placeholder" class="app-input w-full"
      @input="$emit('update:modelValue', $event.target.value)" />
  </div>
</template>

<script setup>
defineProps({
  modelValue: String,
  label: String,
  placeholder: String,
})

defineEmits(['update:modelValue'])
</script>
