<template>
  <div
    v-if="segments.length"
    class="space-y-2"
  >
    <!-- Legend - status color never carries meaning alone, always paired with a label -->
    <div class="flex items-center gap-4 text-xs text-slate-600">
      <span class="inline-flex items-center gap-1.5">
        <span class="h-2.5 w-2.5 rounded-full bg-emerald-500" />
        Online
      </span>
      <span class="inline-flex items-center gap-1.5">
        <span class="h-2.5 w-2.5 rounded-full bg-rose-500" />
        Offline
      </span>
      <span class="ml-auto text-slate-400">{{ rangeLabel }}</span>
    </div>

    <!-- Proportional segmented timeline bar -->
    <div class="relative flex h-8 w-full overflow-hidden rounded-md bg-slate-100">
      <div
        v-for="(seg, idx) in segments"
        :key="idx"
        class="relative h-full first:rounded-l-md last:rounded-r-md"
        :class="seg.status === 'online' ? 'bg-emerald-500' : 'bg-rose-500'"
        :style="{ flexGrow: seg.durationMs, flexBasis: 0, marginLeft: idx > 0 ? '2px' : 0 }"
        @mouseenter="hovered = seg"
        @mouseleave="hovered = null"
      />
    </div>

    <!-- Hover tooltip - per-mark, appears on hover, not a permanent label -->
    <div
      v-if="hovered"
      class="rounded-lg border bg-white px-3 py-2 text-xs shadow-sm inline-flex items-center gap-2"
    >
      <span
        class="h-2 w-2 rounded-full"
        :class="hovered.status === 'online' ? 'bg-emerald-500' : 'bg-rose-500'"
      />
      <span class="font-medium">{{ hovered.status === 'online' ? 'Online' : 'Offline' }}</span>
      <span class="text-slate-500">
        {{ fmtDate(hovered.from) }} — {{ hovered.to ? fmtDate(hovered.to) : 'u toku' }}
        ({{ formatDuration(hovered.from, hovered.to) }})
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { fmtDate as formatDate } from '@/utils/format.js'

const props = defineProps({
  periods: { type: Array, default: () => [] },
})

const hovered = ref(null)

const fmtDate = (d) => formatDate(d, 'sr-RS')

function formatDuration(fromValue, toValue) {
  const from = new Date(fromValue).getTime()
  const to = toValue ? new Date(toValue).getTime() : Date.now()
  if (Number.isNaN(from) || Number.isNaN(to)) return '—'

  const totalMinutes = Math.max(0, Math.floor((to - from) / 60000))
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) return `${days} d ${hours} h`
  if (hours > 0) return `${hours} h ${minutes} min`
  return `${minutes} min`
}

// Timeline width is proportional to each period's real duration (flex-grow),
// oldest-first left-to-right, matching how a reader scans a timeline.
const segments = computed(() =>
  [...props.periods]
    .slice()
    .reverse()
    .map((p) => {
      const from = new Date(p.from).getTime()
      const to = p.to ? new Date(p.to).getTime() : Date.now()
      const durationMs = Math.max(1, to - from)
      return { ...p, durationMs }
    }),
)

const rangeLabel = computed(() => {
  if (!props.periods.length) return ''
  const oldest = props.periods[props.periods.length - 1]
  const newest = props.periods[0]
  return `${fmtDate(oldest.from)} — ${newest.to ? fmtDate(newest.to) : 'sada'}`
})
</script>
