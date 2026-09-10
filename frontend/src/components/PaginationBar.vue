<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import NavIcon from '@/components/NavIcon.vue'

const { t } = useI18n()

const props = defineProps({
  page: { type: Number, required: true },
  limit: { type: Number, required: true },
  total: { type: Number, required: true },
  totalPages: { type: Number, required: true },
  loading: { type: Boolean, default: false },
  limitOptions: { type: Array, default: () => [10, 20, 50, 100] },
})

const emit = defineEmits(['prev', 'next', 'update:limit'])

const prevDisabled = computed(() => props.page === 1 || props.loading)
const nextDisabled = computed(() => props.page * props.limit >= props.total || props.loading)
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
    <label class="text-ink-secondary" for="pagination-limit">{{ t('common.perPage') }}</label>
    <select
      id="pagination-limit"
      class="app-input w-auto py-1.5 text-sm"
      :value="limit"
      @change="$emit('update:limit', Number($event.target.value))"
    >
      <option v-for="n in limitOptions" :key="n" :value="n">{{ n }}</option>
    </select>

    <span class="mx-1 hidden h-5 w-px bg-line sm:inline-block"></span>

    <button
      type="button"
      class="rounded-lg border border-line bg-surface p-1.5 hover:bg-surface-sunken disabled:opacity-50"
      :disabled="prevDisabled"
      :aria-label="t('common.prevPage')"
      @click="$emit('prev')"
    >
      <NavIcon name="chevron-left" />
    </button>
    <span class="font-mono tabular-nums">{{ t('common.pageOfShort', { page: totalPages === 0 ? '0' : page, total: totalPages }) }}</span>
    <button
      type="button"
      class="rounded-lg border border-line bg-surface p-1.5 hover:bg-surface-sunken disabled:opacity-50"
      :disabled="nextDisabled"
      :aria-label="t('common.nextPage')"
      @click="$emit('next')"
    >
      <NavIcon name="chevron-right" />
    </button>
  </div>
</template>
