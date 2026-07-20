<template>
  <div>
    <label class="text-sm text-gray-600">{{ label }}</label>
    <input :value="modelValue" :placeholder="placeholder" class="app-input"
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
