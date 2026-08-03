<script setup>
import { ref, computed, onMounted } from 'vue'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { useToast } from '@/composables/useToast.js'
import { usePdsuFormatters } from '@/composables/usePdsuFormatters.js'
import AppButton from '@/components/AppButton.vue'

const props = defineProps({
  printers: {
    type: Object,
    default: () => ({}),
  },
})

const emit = defineEmits(['patterns-changed'])

const { formatNumber, formatDate: formatDateBase, splitValues } = usePdsuFormatters()
const { showToast } = useToast()

function formatDate(value) {
  return formatDateBase(value, true)
}

const stats = computed(() => props.printers?.stats ?? {})
const tables = computed(() => props.printers?.tables ?? {})

const topNames = computed(() => tables.value?.topNames ?? [])
const topDrivers = computed(() => tables.value?.topDrivers ?? [])
const problemStatus = computed(() => tables.value?.problemStatus ?? [])
const rarePrinters = computed(() => tables.value?.rarePrinters ?? [])
const computersWithMostPrinters = computed(() => tables.value?.computersWithMostPrinters ?? [])
const activePerComputer = computed(() => tables.value?.activePerComputer ?? [])

const totalPrinters = computed(() => Number(stats.value?.totalPrinters) || 0)

function statusBadgeClass(status) {
  const s = String(status || '').trim().toLowerCase()
  if (['ok', 'idle', 'unknown', ''].includes(s)) {
    return 'bg-green-600 text-white'
  }
  return 'bg-red-600 text-white'
}

// Ignorisani obrasci imena (Microsoft Print to PDF, AnyDesk Printer, itd.) -
// admin-upravljiva lista, isti CRUD obrazac kao crna lista domena na DNS
// Logovima. Backend već isključuje ove obrasce iz SVIH tabela/statistika
// iznad - ovaj panel samo upravlja SAMOM listom.
const patterns = ref([])
const newPattern = ref('')
const newPatternReason = ref('')
const savingPattern = ref(false)

async function fetchPatterns() {
  try {
    const res = await fetchWithAuth('/api/protected/pdsu-analytics/printer-patterns')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    patterns.value = data.items || []
  } catch (e) {
    console.error('Neuspešno dohvatanje ignorisanih obrazaca štampača', e)
  }
}

async function addPattern() {
  if (!newPattern.value.trim()) return
  savingPattern.value = true
  try {
    const res = await fetchWithAuth('/api/protected/pdsu-analytics/printer-patterns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern: newPattern.value.trim(), reason: newPatternReason.value.trim() }),
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri dodavanju obrasca'))
    newPattern.value = ''
    newPatternReason.value = ''
    await fetchPatterns()
    emit('patterns-changed')
    showToast('Obrazac dodat')
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri dodavanju obrasca', { prefix: '❌ ', duration: 3000 })
  } finally {
    savingPattern.value = false
  }
}

async function removePattern(id) {
  try {
    const res = await fetchWithAuth(`/api/protected/pdsu-analytics/printer-patterns/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri uklanjanju'))
    await fetchPatterns()
    emit('patterns-changed')
    showToast('Obrazac uklonjen')
  } catch (err) {
    console.error(err)
    showToast(err?.message || 'Greška pri uklanjanju', { prefix: '❌ ', duration: 3000 })
  }
}

onMounted(fetchPatterns)
</script>

<template>
  <section class="pdsu-printers">
    <!-- KPI kartice -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5 mb-4">
      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Ukupno štampača</div>
          <div class="text-2xl font-bold tracking-tight text-slate-900">
            {{ formatNumber(stats.totalPrinters) }}
          </div>
          <div class="text-xs text-slate-500 mt-2">
            Na {{ formatNumber(stats.computersWithPrinters) }} računara
          </div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Jedinstveni štampači</div>
          <div class="text-2xl font-bold tracking-tight text-slate-900">
            {{ formatNumber(stats.uniquePrinters) }}
          </div>
          <div class="text-xs text-slate-500 mt-2">Različitih naziva štampača</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Prosek po računaru</div>
          <div class="text-2xl font-bold tracking-tight text-slate-900">
            {{ formatNumber(stats.avgPerComputer) }}
          </div>
          <div class="text-xs text-slate-500 mt-2">Štampača po računaru sa štampačem</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Podrazumevani</div>
          <div class="text-2xl font-bold tracking-tight text-slate-900">
            {{ formatNumber(stats.defaultCount) }}
          </div>
          <div class="text-xs text-slate-500 mt-2">Označeni kao podrazumevani</div>
        </div>
      </div>

      <div class="pdsu-card">
        <div class="p-4">
          <div class="text-xs text-slate-500 mb-1">Problematičan status</div>
          <div
            class="text-2xl font-bold tracking-tight"
            :class="Number(stats.problemStatus) > 0 ? 'text-red-600' : 'text-green-600'"
          >
            {{ formatNumber(stats.problemStatus) }}
          </div>
          <div class="text-xs text-slate-500 mt-2">Status različit od OK/Idle</div>
        </div>
      </div>
    </div>

    <!-- Period inventara -->
    <div class="pdsu-card mb-4">
      <div class="p-4">
        <div class="flex flex-col justify-between gap-3 md:flex-row">
          <div>
            <div class="text-xs text-slate-500">Najstariji PDSU zapis štampača</div>
            <div class="font-semibold text-slate-900">{{ formatDate(stats.oldestInventoryDate) }}</div>
          </div>
          <div class="md:text-right">
            <div class="text-xs text-slate-500">Najnoviji PDSU zapis štampača</div>
            <div class="font-semibold text-slate-900">{{ formatDate(stats.newestInventoryDate) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Aktivni štampač po računaru (unikatan, jedan red po računaru) -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">Aktivni štampač po računaru</h5>
          <div class="text-xs text-slate-500">
            Jedan red po računaru - podrazumevani (trenutno korišćeni) štampač, bez virtuelnih/softverskih.
            Ovo je isto što se izvozi u "Aktivni štampači" list pri XLSX izvozu.
          </div>
        </div>
        <span class="pdsu-badge bg-blue-600 text-white">{{ formatNumber(activePerComputer.length) }}</span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>Računar</th>
              <th>IP</th>
              <th>Odeljenje</th>
              <th>Štampač</th>
              <th>Drajver</th>
              <th class="text-center">Status</th>
              <th>Datum inventara</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in activePerComputer" :key="item.ipEntryId ?? `${item.ip}-${index}`">
              <td class="font-semibold text-slate-900">{{ item.computerName || 'Nepoznat računar' }}</td>
              <td><code class="pdsu-code">{{ item.ip || '—' }}</code></td>
              <td>{{ item.department || '—' }}</td>
              <td>{{ item.name || '—' }}</td>
              <td>{{ item.driverName || '—' }}</td>
              <td class="text-center">
                <span class="pdsu-badge" :class="statusBadgeClass(item.status)">
                  {{ item.status || 'Nepoznato' }}
                </span>
              </td>
              <td>{{ formatDate(item.inventoryDate) }}</td>
            </tr>
            <tr v-if="activePerComputer.length === 0">
              <td colspan="7" class="text-center text-slate-500 py-4">
                Nema računara sa podešenim podrazumevanim (ne-virtuelnim) štampačem.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Štampači sa problematičnim statusom -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">Štampači sa problematičnim statusom</h5>
          <div class="text-xs text-slate-500">Status različit od OK/Idle/Unknown - potencijalno zahtevaju proveru</div>
        </div>
        <span class="pdsu-badge" :class="problemStatus.length > 0 ? 'bg-red-600 text-white' : 'bg-green-600 text-white'">
          {{ formatNumber(problemStatus.length) }}
        </span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>Štampač</th>
              <th>Računar</th>
              <th>Drajver</th>
              <th>Port</th>
              <th class="text-center">Status</th>
              <th>Datum inventara</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(item, index) in problemStatus"
              :key="item.id ?? `${item.ipEntryId}-${item.name}-${index}`"
            >
              <td>
                <div class="font-semibold text-slate-900">{{ item.name || 'Nepoznat štampač' }}</div>
                <span v-if="item.isDefault" class="text-xs text-blue-600">Podrazumevani</span>
              </td>
              <td>
                <div class="font-semibold text-slate-900">{{ item.computerName || 'Nepoznat računar' }}</div>
                <div><code class="pdsu-code">{{ item.ip || '—' }}</code></div>
                <div class="text-xs text-slate-500">{{ item.department || '—' }}</div>
              </td>
              <td>{{ item.driverName || '—' }}</td>
              <td>{{ item.portName || '—' }}</td>
              <td class="text-center">
                <span class="pdsu-badge" :class="statusBadgeClass(item.status)">
                  {{ item.status || 'Nepoznato' }}
                </span>
              </td>
              <td>{{ formatDate(item.inventoryDate) }}</td>
            </tr>
            <tr v-if="problemStatus.length === 0">
              <td colspan="6" class="text-center text-slate-500 py-4">Nema štampača sa problematičnim statusom.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Najčešći štampači -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">Najčešći štampači</h5>
          <div class="text-xs text-slate-500">Rangirano po broju računara koji imaju konfigurisan taj štampač</div>
        </div>
        <span class="pdsu-badge bg-slate-900 text-white">Top {{ formatNumber(topNames.length) }}</span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Štampač</th>
              <th class="text-center">Računari</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in topNames" :key="`${item.name}-${index}`">
              <td class="text-slate-500">{{ index + 1 }}</td>
              <td class="font-semibold text-slate-900">{{ item.name }}</td>
              <td class="text-center">
                <span class="pdsu-badge bg-slate-500 text-white">{{ formatNumber(item.computers) }}</span>
              </td>
            </tr>
            <tr v-if="topNames.length === 0">
              <td colspan="3" class="text-center text-slate-500 py-4">Nema rezultata.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Najčešći drajveri -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">Najčešći drajveri štampača</h5>
          <div class="text-xs text-slate-500">Korisno za planiranje ažuriranja drajvera</div>
        </div>
        <span class="pdsu-badge bg-slate-900 text-white">Top {{ formatNumber(topDrivers.length) }}</span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Drajver</th>
              <th class="text-center">Štampači</th>
              <th class="text-center">Računari</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in topDrivers" :key="`${item.driverName}-${index}`">
              <td class="text-slate-500">{{ index + 1 }}</td>
              <td class="font-semibold text-slate-900">{{ item.driverName }}</td>
              <td class="text-center">{{ formatNumber(item.printers) }}</td>
              <td class="text-center">
                <span class="pdsu-badge bg-slate-500 text-white">{{ formatNumber(item.computers) }}</span>
              </td>
            </tr>
            <tr v-if="topDrivers.length === 0">
              <td colspan="4" class="text-center text-slate-500 py-4">Nema rezultata.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Retki štampači -->
    <div class="pdsu-card mb-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">Retki štampači</h5>
          <div class="text-xs text-slate-500">Štampači pronađeni na malom broju računara</div>
        </div>
        <span class="pdsu-badge bg-slate-500 text-white">{{ formatNumber(rarePrinters.length) }}</span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>Štampač</th>
              <th class="text-center">Računari</th>
              <th>Pronađen na</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in rarePrinters" :key="`${item.name}-${index}`">
              <td class="font-semibold text-slate-900">{{ item.name }}</td>
              <td class="text-center">
                <span class="pdsu-badge bg-slate-500 text-white">{{ formatNumber(item.computers) }}</span>
              </td>
              <td>
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="computer in splitValues(item.computerNames)"
                    :key="computer"
                    class="pdsu-badge bg-slate-100 text-slate-700 border border-slate-200"
                  >
                    {{ computer }}
                  </span>
                  <span v-if="splitValues(item.computerNames).length === 0" class="text-slate-500">Nema podatka</span>
                </div>
              </td>
            </tr>
            <tr v-if="rarePrinters.length === 0">
              <td colspan="3" class="text-center text-slate-500 py-4">Nema rezultata.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Računari sa najviše štampača -->
    <div class="pdsu-card">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">Računari sa najviše štampača</h5>
          <div class="text-xs text-slate-500">Rangirano prema ukupnom broju konfigurisanih štampača</div>
        </div>
        <span class="pdsu-badge bg-slate-900 text-white">Top {{ formatNumber(computersWithMostPrinters.length) }}</span>
      </div>

      <div class="pdsu-table-wrap">
        <table class="pdsu-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Računar</th>
              <th>IP adresa</th>
              <th>Odeljenje</th>
              <th class="text-center">Broj štampača</th>
              <th>Datum inventara</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(item, index) in computersWithMostPrinters"
              :key="item.ipEntryId ?? `${item.ip}-${index}`"
            >
              <td class="text-slate-500">{{ index + 1 }}</td>
              <td class="font-semibold text-slate-900">{{ item.computerName || 'Nepoznat računar' }}</td>
              <td><code class="pdsu-code">{{ item.ip || '—' }}</code></td>
              <td>{{ item.department || '—' }}</td>
              <td class="text-center">
                <span class="pdsu-badge bg-green-600 text-white">{{ formatNumber(item.printerCount) }}</span>
              </td>
              <td>{{ formatDate(item.inventoryDate) }}</td>
            </tr>
            <tr v-if="computersWithMostPrinters.length === 0">
              <td colspan="6" class="text-center text-slate-500 py-4">Nema rezultata.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Ignorisani obrasci imena (virtuelni/softverski štampači) -->
    <div class="pdsu-card mt-4">
      <div class="pdsu-card-header flex items-center justify-between gap-3">
        <div>
          <h5 class="pdsu-card-title">Ignorisani obrasci imena štampača</h5>
          <div class="text-xs text-slate-500">
            Štampači čije ime SADRŽI neki od ovih obrazaca (npr. "print to pdf", "anydesk printer") se ne
            prikazuju/izvoze nigde iznad - ni u statistici, ni u tabelama, ni po računaru.
          </div>
        </div>
        <span class="pdsu-badge bg-slate-500 text-white">{{ formatNumber(patterns.length) }}</span>
      </div>

      <form @submit.prevent="addPattern" class="flex flex-wrap items-end gap-2 p-4 border-b border-slate-100">
        <div class="flex-1 min-w-40">
          <label class="text-xs text-slate-600">Obrazac (deo imena)</label>
          <input v-model.trim="newPattern" type="text" class="app-input w-full" placeholder="npr. anydesk printer" />
        </div>
        <div class="flex-1 min-w-40">
          <label class="text-xs text-slate-600">Napomena (opciono)</label>
          <input v-model.trim="newPatternReason" type="text" class="app-input w-full" placeholder="npr. virtuelni štampač" />
        </div>
        <AppButton type="submit" variant="danger" :disabled="!newPattern || savingPattern">
          {{ savingPattern ? 'Dodajem…' : 'Dodaj obrazac' }}
        </AppButton>
      </form>

      <div class="pdsu-table-wrap">
        <table v-if="patterns.length" class="pdsu-table">
          <thead>
            <tr>
              <th>Obrazac</th>
              <th>Napomena</th>
              <th>Dodato</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in patterns" :key="item.id">
              <td class="font-mono">{{ item.pattern }}</td>
              <td>{{ item.reason || '—' }}</td>
              <td>{{ formatDate(item.createdAt) }}</td>
              <td class="text-right">
                <button type="button" class="text-red-600 hover:underline text-sm" @click="removePattern(item.id)">
                  Ukloni
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-sm text-slate-500 p-4">Lista je prazna - svi detektovani štampači se prikazuju.</p>
      </div>
    </div>
  </section>
</template>
