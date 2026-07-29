<script setup>
import { ref, computed } from 'vue'
import { fmtDateSr } from '@/utils/format.js'

const props = defineProps({
  flaggedSoftware: {
    type: Array,
    default: () => [],
  },
  flaggedServices: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['remove-software', 'remove-service'])

const softwareFilter = ref('')
const serviceFilter = ref('')

const filteredSoftware = computed(() => {
  const q = softwareFilter.value.trim().toLowerCase()
  if (!q) return props.flaggedSoftware
  return props.flaggedSoftware.filter((item) =>
    [item.displayName, item.publisher].some((v) => String(v ?? '').toLowerCase().includes(q)),
  )
})

const filteredServices = computed(() => {
  const q = serviceFilter.value.trim().toLowerCase()
  if (!q) return props.flaggedServices
  return props.flaggedServices.filter((item) =>
    [item.name, item.displayName].some((v) => String(v ?? '').toLowerCase().includes(q)),
  )
})
</script>

<template>
  <section class="pdsu-flagged space-y-4">
    <div class="pdsu-card">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">⚠ Neželjeni programi</h5>
          <div class="text-xs text-slate-500">
            Programi koji, ako se pojave na bilo kom računaru, izazivaju upozorenje na kartici
          </div>
        </div>
        <span class="pdsu-badge bg-red-600 text-white">{{ flaggedSoftware.length }}</span>
      </div>

      <div class="p-4 pb-0">
        <input
          v-model="softwareFilter"
          type="text"
          class="app-input w-full"
          placeholder="Pretraži po nazivu ili izdavaču..."
        />
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>Naziv</th>
              <th>Izdavač</th>
              <th>Napomena</th>
              <th>Označeno</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredSoftware" :key="item.id">
              <td class="font-semibold text-slate-900">{{ item.displayName }}</td>
              <td>{{ item.publisher || '—' }}</td>
              <td>{{ item.reason || '—' }}</td>
              <td>{{ fmtDateSr(item.createdAt) }}</td>
              <td class="text-right">
                <button
                  type="button"
                  class="text-red-600 hover:underline text-sm"
                  @click="emit('remove-software', item.id)"
                >
                  Ukloni
                </button>
              </td>
            </tr>
            <tr v-if="filteredSoftware.length === 0">
              <td colspan="5" class="text-center text-slate-500 py-4">
                {{
                  flaggedSoftware.length === 0
                    ? 'Još uvek nema označenih neželjenih programa. Pretraži programe iznad i klikni "Označi kao neželjen".'
                    : 'Nema rezultata za dati filter.'
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="pdsu-card">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">⚠ Neželjeni servisi</h5>
          <div class="text-xs text-slate-500">
            Servisi koji, ako se pojave na bilo kom računaru, izazivaju upozorenje na kartici
          </div>
        </div>
        <span class="pdsu-badge bg-red-600 text-white">{{ flaggedServices.length }}</span>
      </div>

      <div class="p-4 pb-0">
        <input
          v-model="serviceFilter"
          type="text"
          class="app-input w-full"
          placeholder="Pretraži po nazivu..."
        />
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>Naziv</th>
              <th>Prikazni naziv</th>
              <th>Napomena</th>
              <th>Označeno</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredServices" :key="item.id">
              <td class="font-semibold text-slate-900">{{ item.name }}</td>
              <td>{{ item.displayName || '—' }}</td>
              <td>{{ item.reason || '—' }}</td>
              <td>{{ fmtDateSr(item.createdAt) }}</td>
              <td class="text-right">
                <button
                  type="button"
                  class="text-red-600 hover:underline text-sm"
                  @click="emit('remove-service', item.id)"
                >
                  Ukloni
                </button>
              </td>
            </tr>
            <tr v-if="filteredServices.length === 0">
              <td colspan="5" class="text-center text-slate-500 py-4">
                {{
                  flaggedServices.length === 0
                    ? 'Još uvek nema označenih neželjenih servisa. Pretraži servise iznad i klikni "Označi kao neželjen".'
                    : 'Nema rezultata za dati filter.'
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
