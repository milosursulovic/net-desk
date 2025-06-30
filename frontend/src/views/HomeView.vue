<template>
  <div class="glass-container">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <h1 class="text-xl sm:text-2xl font-semibold text-slate-700">🖥️ IP Adrese</h1>

      <div class="flex flex-wrap items-center gap-2">
        <button
          @click="addEntry"
          class="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700"
        >
          ➕ Dodaj
        </button>
        <button
          @click="exportToCsv"
          class="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700"
        >
          📤 Izvezi CSV
        </button>

        <label
          class="inline-flex items-center bg-yellow-500 text-white px-4 py-2 rounded cursor-pointer hover:bg-yellow-600 shadow"
        >
          <input type="file" @change="handleFileUpload" accept=".csv" class="hidden" />
          📥 Uvezi CSV
        </label>

        <button
          @click="showAvailableIps"
          class="bg-purple-600 text-white px-4 py-2 rounded shadow hover:bg-purple-700"
        >
          📡 Slobodne IP adrese
        </button>
      </div>
    </div>

    <!-- Search + Pagination -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <input
        v-model="search"
        @input="page = 1"
        type="text"
        placeholder="🔎 Pretraga..."
        class="border border-gray-300 px-3 py-2 rounded w-full sm:w-1/2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />

      <div class="flex flex-col items-start sm:items-end gap-1">
        <div class="flex items-center gap-2">
          <button
            @click="prevPage"
            :disabled="page === 1"
            class="px-2 py-1 bg-gray-300 rounded disabled:opacity-50"
          >
            ⬅️
          </button>
          <span>📄 Strana {{ isThereAnyPages() }} / {{ totalPages }}</span>
          <button
            @click="nextPage"
            :disabled="page * limit >= total"
            class="px-2 py-1 bg-gray-300 rounded disabled:opacity-50"
          >
            ➡️
          </button>
        </div>
        <p class="text-sm text-gray-600">Ukupno {{ entries.length }} od {{ total }} unosa</p>
      </div>
    </div>

    <!-- Toggle passwords -->
    <button
      @click="showPasswords = !showPasswords"
      class="text-sm text-gray-700 underline hover:text-gray-900"
    >
      {{ showPasswords ? '🔒 Sakrij lozinke' : '🔓 Prikaži lozinke' }}
    </button>

    <!-- Table -->
    <div class="overflow-x-auto rounded-lg shadow mt-4">
      <table class="min-w-full border border-gray-300 text-left bg-white bg-opacity-80">
        <thead class="bg-gray-200 text-sm sm:text-base">
          <tr>
            <th class="p-2 cursor-pointer whitespace-nowrap" @click="toggleSort('ip')">
              🌐 IP adresa <span v-if="sortBy === 'ip'">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
            </th>
            <th class="p-2 cursor-pointer whitespace-nowrap" @click="toggleSort('computerName')">
              🖥️ Ime računara
              <span v-if="sortBy === 'computerName'">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
            </th>
            <th class="p-2 cursor-pointer whitespace-nowrap" @click="toggleSort('username')">
              👤 Korisničko ime
              <span v-if="sortBy === 'username'">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
            </th>
            <th class="p-2 cursor-pointer whitespace-nowrap" @click="toggleSort('fullName')">
              🙍‍♂️ Puno ime
              <span v-if="sortBy === 'fullName'">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
            </th>
            <th class="p-2 whitespace-nowrap">🔑 Lozinka</th>
            <th class="p-2 cursor-pointer whitespace-nowrap" @click="toggleSort('rdp')">
              🖧 RDP <span v-if="sortBy === 'rdp'">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
            </th>
            <th class="p-2 whitespace-nowrap">⚙️ Akcije</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in entries"
            :key="entry._id"
            class="border-t text-sm sm:text-base hover:bg-slate-50 transition"
          >
            <td class="p-2">
              {{ entry.ip }}
              <button
                @click="copyToClipboard(entry.ip, `IP ${entry.ip} kopiran!`)"
                class="ml-2 text-blue-500 hover:underline text-xs"
              >
                📋
              </button>
            </td>
            <td class="p-2">{{ entry.computerName }}</td>
            <td class="p-2">{{ entry.username }}</td>
            <td class="p-2">{{ entry.fullName }}</td>
            <td class="p-2">
              {{ showPasswords ? entry.password : '••••••' }}
              <button
                v-if="showPasswords"
                @click="copyToClipboard(entry.password, 'Lozinka kopirana!')"
                class="ml-2 text-blue-500 hover:underline text-xs"
              >
                📋
              </button>
            </td>
            <td class="p-2">{{ entry.rdp }}</td>
            <td class="p-2 space-x-2 whitespace-nowrap">
              <button @click="editEntry(entry)" class="text-blue-600 hover:underline">
                ✏️ Izmeni
              </button>
              <button @click="deleteEntry(entry._id)" class="text-red-600 hover:underline">
                🗑️ Obriši
              </button>
              <button @click="generateRdpFile(entry)" class="text-green-600 hover:underline">
                🔗 RDP
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <transition name="fade">
    <div
      v-if="copiedText"
      class="fixed top-6 right-6 bg-gray-800 text-white px-4 py-2 rounded shadow-lg text-sm z-[999]"
    >
      {{ copiedText }}
    </div>
  </transition>

  <transition name="fade">
    <div
      v-if="showingAvailableModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      @click.self="closeAvailableModal"
    >
      <div class="bg-white rounded-xl shadow-lg p-6 w-full max-w-lg">
        <div class="mb-4">
          <div class="flex justify-between items-center mb-2">
            <h2 class="text-lg font-semibold text-gray-800 flex items-center gap-2">
              📡 Slobodne IP adrese
            </h2>
            <button
              @click="closeAvailableModal"
              class="text-gray-500 hover:text-red-600 text-2xl leading-none"
            >
              &times;
            </button>
          </div>
          <input
            v-model="ipSearch"
            type="text"
            placeholder="🔍 Pretraga IP adresa..."
            class="w-full border border-gray-300 px-3 py-2 rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div v-if="availableIps.length > 0">
          <ul class="space-y-2 max-h-60 overflow-y-auto">
            <li
              v-for="(ip, index) in filteredAvailableIps"
              :key="index"
              @click="goToAddWithIp(ip)"
              class="p-2 bg-slate-100 rounded hover:bg-slate-200 transition flex justify-between items-center cursor-pointer"
            >
              <span>{{ ip }}</span>
              <button
                @click.stop="copyToClipboard(ip, `IP ${ip} kopiran!`)"
                class="text-blue-500 text-sm hover:underline"
              >
                📋 Kopiraj
              </button>
            </li>
          </ul>
        </div>
        <div v-else class="text-gray-500 text-center">Nema slobodnih IP adresa.</div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'

const entries = ref([])
const total = ref(0)
const totalPages = ref(0)
const page = ref(parseInt(useRoute().query.page) || 1)
const limit = ref(parseInt(useRoute().query.limit) || 10)
const search = ref(useRoute().query.search || '')
const sortBy = ref(useRoute().query.sortBy || 'ip')
const sortOrder = ref(useRoute().query.sortOrder || 'asc')
const showPasswords = ref(false)
const copiedText = ref(null)
const availableIps = ref([])
const showingAvailableModal = ref(false)
const ipSearch = ref('')

const router = useRouter()
const route = useRoute()

const addEntry = () => router.push('/add')
const editEntry = (entry) => router.push(`/edit/${entry._id}`)

const toggleSort = (column) => {
  if (sortBy.value === column) sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  else {
    sortBy.value = column
    sortOrder.value = 'asc'
  }
}

const isThereAnyPages = () => (totalPages.value === 0 ? '0' : page.value)

const fetchData = async () => {
  const params = new URLSearchParams({
    page: page.value,
    limit: limit.value,
    search: search.value,
    sortBy: sortBy.value,
    sortOrder: sortOrder.value,
  })

  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses?${params.toString()}`)
    if (!res.ok) throw new Error()
    const data = await res.json()
    entries.value = data.entries
    total.value = data.total
    totalPages.value = data.totalPages
  } catch (err) {
    console.error('Neuspešno dohvatanje podataka')
  }
}

const deleteEntry = async (id) => {
  if (!confirm('Da li si siguran da želiš da obrišeš ovaj unos?')) return
  const res = await fetchWithAuth(`/api/protected/ip-addresses/${id}`, { method: 'DELETE' })
  if (res.ok) fetchData()
  else console.log('Neuspešno brisanje')
}

const exportToCsv = async () => {
  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses/export?search=${search.value}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ip-entries.csv'
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    console.log('Greška pri izvozu CSV-a')
  }
}

const handleFileUpload = async (e) => {
  const file = e.target.files[0]
  if (!file) return
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetchWithAuth('/api/protected/ip-addresses/import', {
    method: 'POST',
    body: formData,
  })
  if (res.ok) fetchData()
  else console.log('Greška pri importu')
}

const showAvailableIps = async () => {
  try {
    const res = await fetchWithAuth('/api/protected/ip-addresses/available')
    const data = await res.json()
    availableIps.value = data.available
  } catch {
    availableIps.value = []
  } finally {
    showingAvailableModal.value = true
  }
}

const closeAvailableModal = () => {
  showingAvailableModal.value = false
  availableIps.value = []
}

const copyToClipboard = async (text, label = 'Kopirano!') => {
  try {
    await navigator.clipboard.writeText(text)
    copiedText.value = `✅ ${label}`
  } catch {
    copiedText.value = '❌ Neuspešno kopiranje'
  }
  setTimeout(() => (copiedText.value = null), 2000)
}

const generateRdpFile = (entry) => {
  const rdpContent = `
    full address:s:${entry.ip}
    username:s:${entry.username}
    prompt for credentials:i:1
    authentication level:i:2
    redirectclipboard:i:1
    redirectprinters:i:0
    redirectcomports:i:0
    redirectsmartcards:i:0
  `.trim()

  const blob = new Blob([rdpContent], { type: 'application/x-rdp' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${entry.computerName || entry.ip}.rdp`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const nextPage = () => {
  if (page.value * limit.value < total.value) {
    page.value++
  }
}
const prevPage = () => {
  if (page.value > 1) {
    page.value--
  }
}

watch([page, limit, search, sortBy, sortOrder], () => {
  router.push({
    query: {
      page: page.value,
      limit: limit.value,
      search: search.value,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
    },
  })
})

const goToAddWithIp = (ip) => {
  router.push({ path: '/add', query: { ip } })
}

const filteredAvailableIps = computed(() =>
  availableIps.value.filter((ip) => ip.toLowerCase().includes(ipSearch.value.toLowerCase())),
)

watch(
  () => route.query,
  (query) => {
    page.value = parseInt(query.page) || 1
    limit.value = parseInt(query.limit) || 10
    search.value = query.search || ''
    sortBy.value = query.sortBy || 'ip'
    sortOrder.value = query.sortOrder || 'asc'
    fetchData()
  },
  { immediate: true },
)

onMounted(() => {
  document.title = 'Početna - Net Desk'
})
</script>
