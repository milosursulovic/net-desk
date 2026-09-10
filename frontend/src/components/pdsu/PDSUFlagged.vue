<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { fmtDateSr } from '@/utils/format.js'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import { useCurrentSite } from '@/composables/useCurrentSite.js'
import { useToast } from '@/composables/useToast.js'
import NavIcon from '@/components/NavIcon.vue'

const { t } = useI18n()
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
    if (!res.ok) throw new Error(await parseError(res, t('pdsu.errorFindAgents')))
    const data = await res.json()
    const ids = data.agentIds || []
    if (!ids.length) {
      showToast(t('pdsu.noAgentsHaveThis'), {
        kind: 'info',
        duration: 3000,
      })
      return
    }
    router.push({ path: '/agents', query: { site: site.value, agentIds: ids.join(',') } })
  } catch (e) {
    console.error('Neuspešna selekcija agenata za flagged stavku', e)
    showToast(t('pdsu.errorFindAgents'), { kind: 'error', duration: 3000 })
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
          <h5 class="pdsu-card-title inline-flex items-center gap-1.5"><NavIcon name="alert-triangle" /> {{ t('pdsu.unwantedSoftware') }}</h5>
          <div class="text-xs text-ink-muted">
            {{ t('pdsu.unwantedSoftwareHint') }}
          </div>
        </div>
        <span class="pdsu-badge bg-bad text-white">{{ flaggedSoftware.length }}</span>
      </div>

      <div class="p-4 pb-0">
        <input
          v-model="softwareFilter"
          type="text"
          class="app-input w-full"
          :placeholder="t('pdsu.searchByNameOrPublisher')"
        />
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>{{ t('groups.colName') }}</th>
              <th>{{ t('pdsu.colPublisher') }}</th>
              <th>{{ t('pdsu.colNote') }}</th>
              <th>{{ t('pdsu.colFlaggedAt') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredSoftware" :key="item.id">
              <td class="font-semibold text-ink">{{ item.displayName }}</td>
              <td>{{ item.publisher || '—' }}</td>
              <td>{{ item.reason || '—' }}</td>
              <td>{{ fmtDateSr(item.createdAt) }}</td>
              <td class="text-right space-x-3 whitespace-nowrap">
                <button
                  type="button"
                  class="rounded p-1 text-accent hover:bg-surface-sunken disabled:opacity-50"
                  :title="t('pdsu.selectAgents')"
                  :disabled="selectingAgentsFor === `software-${item.id}`"
                  @click="selectAgentsFor('software', item.id)"
                >
                  <NavIcon name="target" />
                </button>
                <button
                  type="button"
                  class="rounded p-1 text-bad hover:bg-surface-sunken"
                  :title="t('pdsu.remove')"
                  @click="emit('remove-software', item.id)"
                >
                  <NavIcon name="trash" />
                </button>
              </td>
            </tr>
            <tr v-if="filteredSoftware.length === 0">
              <td colspan="5" class="text-center text-ink-muted py-4">
                {{
                  flaggedSoftware.length === 0
                    ? t('pdsu.noneFlaggedSoftware')
                    : t('pdsu.noFilterResults')
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
          <h5 class="pdsu-card-title inline-flex items-center gap-1.5"><NavIcon name="alert-triangle" /> {{ t('pdsu.unwantedServices') }}</h5>
          <div class="text-xs text-ink-muted">
            {{ t('pdsu.unwantedServicesHint') }}
          </div>
        </div>
        <span class="pdsu-badge bg-bad text-white">{{ flaggedServices.length }}</span>
      </div>

      <div class="p-4 pb-0">
        <input
          v-model="serviceFilter"
          type="text"
          class="app-input w-full"
          :placeholder="t('pdsu.searchByName')"
        />
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>{{ t('groups.colName') }}</th>
              <th>{{ t('pdsu.colDisplayName') }}</th>
              <th>{{ t('pdsu.colNote') }}</th>
              <th>{{ t('pdsu.colFlaggedAt') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredServices" :key="item.id">
              <td class="font-semibold text-ink">{{ item.name }}</td>
              <td>{{ item.displayName || '—' }}</td>
              <td>{{ item.reason || '—' }}</td>
              <td>{{ fmtDateSr(item.createdAt) }}</td>
              <td class="text-right space-x-3 whitespace-nowrap">
                <button
                  type="button"
                  class="rounded p-1 text-accent hover:bg-surface-sunken disabled:opacity-50"
                  :title="t('pdsu.selectAgents')"
                  :disabled="selectingAgentsFor === `services-${item.id}`"
                  @click="selectAgentsFor('services', item.id)"
                >
                  <NavIcon name="target" />
                </button>
                <button
                  type="button"
                  class="rounded p-1 text-bad hover:bg-surface-sunken"
                  :title="t('pdsu.remove')"
                  @click="emit('remove-service', item.id)"
                >
                  <NavIcon name="trash" />
                </button>
              </td>
            </tr>
            <tr v-if="filteredServices.length === 0">
              <td colspan="5" class="text-center text-ink-muted py-4">
                {{
                  flaggedServices.length === 0
                    ? t('pdsu.noneFlaggedServices')
                    : t('pdsu.noFilterResults')
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
          <h5 class="pdsu-card-title inline-flex items-center gap-1.5"><NavIcon name="alert-triangle" /> {{ t('pdsu.unwantedDrivers') }}</h5>
          <div class="text-xs text-ink-muted">
            {{ t('pdsu.unwantedDriversHint') }}
          </div>
        </div>
        <span class="pdsu-badge bg-bad text-white">{{ flaggedDrivers.length }}</span>
      </div>

      <div class="p-4 pb-0">
        <input
          v-model="driverFilter"
          type="text"
          class="app-input w-full"
          :placeholder="t('pdsu.searchByDeviceOrProvider')"
        />
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>{{ t('pdsu.colDevice') }}</th>
              <th>Provider</th>
              <th>{{ t('pdsu.colNote') }}</th>
              <th>{{ t('pdsu.colFlaggedAt') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredDrivers" :key="item.id">
              <td class="font-semibold text-ink">{{ item.deviceName }}</td>
              <td>{{ item.driverProviderName || '—' }}</td>
              <td>{{ item.reason || '—' }}</td>
              <td>{{ fmtDateSr(item.createdAt) }}</td>
              <td class="text-right space-x-3 whitespace-nowrap">
                <button
                  type="button"
                  class="rounded p-1 text-accent hover:bg-surface-sunken disabled:opacity-50"
                  :title="t('pdsu.selectAgents')"
                  :disabled="selectingAgentsFor === `drivers-${item.id}`"
                  @click="selectAgentsFor('drivers', item.id)"
                >
                  <NavIcon name="target" />
                </button>
                <button
                  type="button"
                  class="rounded p-1 text-bad hover:bg-surface-sunken"
                  :title="t('pdsu.remove')"
                  @click="emit('remove-driver', item.id)"
                >
                  <NavIcon name="trash" />
                </button>
              </td>
            </tr>
            <tr v-if="filteredDrivers.length === 0">
              <td colspan="5" class="text-center text-ink-muted py-4">
                {{
                  flaggedDrivers.length === 0
                    ? t('pdsu.noneFlaggedDrivers')
                    : t('pdsu.noFilterResults')
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
