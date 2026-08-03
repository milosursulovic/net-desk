<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => [],
  },
  options: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['update:modelValue'])

const customInput = ref('')

// Unija predloženih opcija i već selektovanih vrednosti (npr. custom grupa
// dodata ranije, ili grupa koja više ne postoji u predlozima) - da se ništa
// selektovano ne "izgubi" iz prikaza.
const allOptions = computed(() => {
  const set = new Set([...props.options, ...props.modelValue])
  return [...set].sort((a, b) => a.localeCompare(b))
})

function isChecked(group) {
  return props.modelValue.includes(group)
}

function toggle(group) {
  const next = isChecked(group)
    ? props.modelValue.filter((g) => g !== group)
    : [...props.modelValue, group]
  emit('update:modelValue', next)
}

function addCustom() {
  const value = customInput.value.trim()
  if (!value || props.modelValue.includes(value)) return
  emit('update:modelValue', [...props.modelValue, value])
  customInput.value = ''
}
</script>

<template>
  <div class="space-y-2">
    <div class="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
      <label v-for="g in allOptions" :key="g" class="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" :checked="isChecked(g)" @change="toggle(g)" class="rounded" />
        {{ g }}
      </label>
      <p v-if="!allOptions.length" class="text-xs text-slate-500 p-1">Nema predloženih grupa - dodaj novu ispod.</p>
    </div>
    <div class="flex gap-2">
      <input
        v-model.trim="customInput"
        type="text"
        class="app-input flex-1 text-sm"
        placeholder="Dodaj novu grupu..."
        @keydown.enter.prevent="addCustom"
      />
      <button type="button" @click="addCustom" class="px-3 py-1.5 border rounded-lg text-sm hover:bg-slate-50">
        Dodaj
      </button>
    </div>
  </div>
</template>
