<template>
  <div ref="rootEl" class="relative">
    <button
      type="button"
      @click="open = !open"
      class="app-input w-full flex items-center justify-between gap-2 text-left py-2 text-sm truncate"
    >
      <span class="truncate" :class="modelValue.length ? '' : 'text-slate-400'">{{ summaryLabel }}</span>
      <span class="text-slate-400 shrink-0">▾</span>
    </button>

    <div
      v-if="open"
      class="absolute z-20 mt-1 w-64 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg p-2 space-y-0.5"
    >
      <input
        v-if="options.length > 8"
        v-model="filterText"
        type="text"
        placeholder="Pretraga..."
        class="app-input w-full text-sm mb-1"
      />

      <p v-if="!filteredOptions.length" class="px-1.5 py-1 text-sm text-slate-400">Nema opcija.</p>

      <label
        v-for="opt in filteredOptions"
        :key="opt"
        class="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-50 text-sm cursor-pointer"
      >
        <input type="checkbox" :checked="modelValue.includes(opt)" @change="toggle(opt)" />
        <span class="truncate">{{ opt }}</span>
      </label>

      <button
        v-if="modelValue.length"
        type="button"
        @click="emit('update:modelValue', [])"
        class="w-full text-left text-xs text-blue-600 hover:underline px-1.5 pt-1 border-t border-slate-100 mt-1"
      >
        Poništi ({{ modelValue.length }})
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

// Zajednička multiselect kontrola za filter dropdown-ove (Home/Agenti) -
// standardni <select multiple> zahteva ctrl/cmd-klik za višestruki izbor
// (loš UX, korisnici ga skoro nikad ne otkriju sami), pa je ovo checkbox
// panel iza dugmeta umesto toga. Namerno bez eksterne biblioteke - svi
// filteri ovde imaju desetine, ne hiljade opcija.
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Sve' },
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const filterText = ref('')
const rootEl = ref(null)

const filteredOptions = computed(() => {
  const q = filterText.value.trim().toLowerCase()
  if (!q) return props.options
  return props.options.filter((o) => String(o).toLowerCase().includes(q))
})

const summaryLabel = computed(() => {
  if (!props.modelValue.length) return props.placeholder
  if (props.modelValue.length <= 2) return props.modelValue.join(', ')
  return `${props.modelValue.length} izabrano`
})

function toggle(opt) {
  const next = props.modelValue.includes(opt)
    ? props.modelValue.filter((v) => v !== opt)
    : [...props.modelValue, opt]
  emit('update:modelValue', next)
}

function onClickOutside(e) {
  if (open.value && rootEl.value && !rootEl.value.contains(e.target)) open.value = false
}
onMounted(() => document.addEventListener('click', onClickOutside))
onBeforeUnmount(() => document.removeEventListener('click', onClickOutside))
</script>
