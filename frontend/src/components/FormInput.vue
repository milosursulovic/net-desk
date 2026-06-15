<template>
  <div>
    <label class="text-sm text-gray-600">{{ label }}</label>
    <input :value="modelValue" :placeholder="placeholder" class="w-full border px-3 py-2 rounded"
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
