<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { fmtDateSr } from '@/utils/format.js'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import { useCurrentSite } from '@/composables/useCurrentSite.js'
import { useToast } from '@/composables/useToast.js'

const { isAdmin } = useCurrentUser()
const router = useRouter()
const site = useCurrentSite()
const { showToast } = useToast()

const props = defineProps({
  flaggedSoftware: {
    type: Array,
    default: () => [],
  },
  flaggedServices: {
    type: Array,
    default: () => [],
  },
  flaggedDrivers: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['remove-software', 'remove-service', 'remove-driver'])

const softwareFilter = ref('')
const serviceFilter = ref('')
const driverFilter = ref('')

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

const filteredDrivers = computed(() => {
  const q = driverFilter.value.trim().toLowerCase()
  if (!q) return props.flaggedDrivers
  return props.flaggedDrivers.filter((item) =>
    [item.deviceName, item.driverProviderName].some((v) => String(v ?? '').toLowerCase().includes(q)),
  )
})

const selectingAgentsFor = ref(null)

// Jednim klikom: nadji sve agente (na trenutnom sajtu) na kojima je
// instaliran/prisutan ovaj konkretan neželjeni program/servis/drajver
// (isti LIKE-substring pattern match kao is_flagged kolona), pa ih
// prosledi na stranicu Agenti kao već selektovane za batch komandu -
// isti obrazac kao "Ponovi batch" (?repeatBatchId=), samo sa ?agentIds=.
async function selectAgentsFor(kind, id) {
  const key = `${kind}-${id}`
  selectingAgentsFor.value = key
  try {
    const res = await fetchWithAuth(`/api/protected/flagged/${kind}/${id}/agents?site=${site.value}`)
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri traženju agenata'))
    const data = await res.json()
    const ids = data.agentIds || []
    if (!ids.length) {
      showToast('Nijedan agent na ovom sajtu trenutno nema ovo instalirano/prisutno.', {
        prefix: 'ℹ️ ',
        duration: 3000,
      })
      return
    }
    router.push({ path: '/agents', query: { site: site.value, agentIds: ids.join(',') } })
  } catch (e) {
    console.error('Neuspešna selekcija agenata za flagged stavku', e)
    showToast('Greška pri traženju agenata', { prefix: '❌ ', duration: 3000 })
  } finally {
    selectingAgentsFor.value = null
  }
}
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
              <td class="text-right space-x-3 whitespace-nowrap">
                <button
                  type="button"
                  class="text-blue-600 hover:underline text-sm disabled:opacity-50"
                  :disabled="selectingAgentsFor === `software-${item.id}`"
                  @click="selectAgentsFor('software', item.id)"
                >
                  🎯 Selektuj agente
                </button>
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
              <td class="text-right space-x-3 whitespace-nowrap">
                <button
                  type="button"
                  class="text-blue-600 hover:underline text-sm disabled:opacity-50"
                  :disabled="selectingAgentsFor === `services-${item.id}`"
                  @click="selectAgentsFor('services', item.id)"
                >
                  🎯 Selektuj agente
                </button>
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

    <div class="pdsu-card">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">⚠ Neželjeni drajveri</h5>
          <div class="text-xs text-slate-500">
            Drajveri koji, ako se pojave na bilo kom računaru, izazivaju upozorenje na kartici
          </div>
        </div>
        <span class="pdsu-badge bg-red-600 text-white">{{ flaggedDrivers.length }}</span>
      </div>

      <div class="p-4 pb-0">
        <input
          v-model="driverFilter"
          type="text"
          class="app-input w-full"
          placeholder="Pretraži po nazivu uređaja ili provideru..."
        />
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>Uređaj</th>
              <th>Provider</th>
              <th>Napomena</th>
              <th>Označeno</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredDrivers" :key="item.id">
              <td class="font-semibold text-slate-900">{{ item.deviceName }}</td>
              <td>{{ item.driverProviderName || '—' }}</td>
              <td>{{ item.reason || '—' }}</td>
              <td>{{ fmtDateSr(item.createdAt) }}</td>
              <td class="text-right space-x-3 whitespace-nowrap">
                <button
                  type="button"
                  class="text-blue-600 hover:underline text-sm disabled:opacity-50"
                  :disabled="selectingAgentsFor === `drivers-${item.id}`"
                  @click="selectAgentsFor('drivers', item.id)"
                >
                  🎯 Selektuj agente
                </button>
                <button
                  type="button"
                  class="text-red-600 hover:underline text-sm"
                  @click="emit('remove-driver', item.id)"
                >
                  Ukloni
                </button>
              </td>
            </tr>
            <tr v-if="filteredDrivers.length === 0">
              <td colspan="5" class="text-center text-slate-500 py-4">
                {{
                  flaggedDrivers.length === 0
                    ? 'Još uvek nema označenih neželjenih drajvera. Pretraži drajvere iznad i klikni "Označi kao neželjen".'
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
