<template>
  <div class="glass-container w-full max-w-3xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-slate-800">
        Inventar — {{ entry?.computer_name || entry?.ip || 'Nepoznato' }}
      </h1>
      <AppButton variant="neutral" @click="goBack">Nazad</AppButton>
    </div>

    <div v-if="entryLoading" class="text-slate-600">Učitavanje…</div>
    <div v-else-if="entryError" class="text-red-600">{{ entryError }}</div>

    <div v-else class="space-y-4">
      <div class="flex flex-wrap gap-2 border-b pb-3">
        <button
          type="button"
          @click="selectTab('software')"
          class="px-3 py-2 rounded-md text-sm font-medium transition"
          :class="
            tab === 'software'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          "
        >
          Softver
          <span v-if="loaded.software" class="ml-1"> ({{ software.length }}) </span>
        </button>

        <button
          type="button"
          @click="selectTab('drivers')"
          class="px-3 py-2 rounded-md text-sm font-medium transition"
          :class="
            tab === 'drivers'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          "
        >
          Drajveri
          <span v-if="loaded.drivers" class="ml-1"> ({{ drivers.length }}) </span>
        </button>

        <button
          type="button"
          @click="selectTab('services')"
          class="px-3 py-2 rounded-md text-sm font-medium transition"
          :class="
            tab === 'services'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          "
        >
          Servisi
          <span v-if="loaded.services" class="ml-1"> ({{ services.length }}) </span>
        </button>

        <button
          type="button"
          @click="selectTab('updates')"
          class="px-3 py-2 rounded-md text-sm font-medium transition"
          :class="
            tab === 'updates'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          "
        >
          Ažuriranja
          <span v-if="loaded.updates" class="ml-1"> ({{ updates.length }}) </span>
        </button>
      </div>

      <div class="relative">
        <input
          v-model="search"
          type="text"
          :placeholder="
            tab === 'software'
              ? 'Pretraži softver, verziju ili izdavača...'
              : tab === 'drivers'
              ? 'Pretraži uređaj, drajver ili proizvođača...'
              : tab === 'services'
              ? 'Pretraži servis, status ili putanju...'
              : 'Pretraži KB, opis ili korisnika...'
          "
          class="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
        />

        <button
          v-if="search"
          type="button"
          @click="search = ''"
          class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
          title="Obriši pretragu"
        >
          ✕
        </button>
      </div>

      <div v-if="search" class="text-xs text-slate-500">
        Pronađeno:
        <template v-if="tab === 'software'">
          {{ filteredSoftware.length }} od {{ software.length }}
        </template>

        <template v-else-if="tab === 'drivers'">
          {{ filteredDrivers.length }} od {{ drivers.length }}
        </template>

        <template v-else-if="tab === 'services'">
          {{ filteredServices.length }} od {{ services.length }}
        </template>

        <template v-else> {{ filteredUpdates.length }} od {{ updates.length }} </template>
      </div>

      <div v-if="tabLoading" class="text-slate-600">Učitavanje inventara…</div>

      <div v-else-if="tabError" class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
        {{ tabError }}
      </div>

      <div v-else>
        <div v-if="tab === 'software'">
          <div v-if="filteredSoftware.length === 0" class="text-slate-500">
            Nema podataka o instaliranom softveru.
          </div>

          <div v-else class="space-y-2">
            <div v-for="item in filteredSoftware" :key="item.id" class="rounded-lg border bg-white p-3">
              <div class="font-medium text-slate-800">
                {{ item.display_name || 'Nepoznat program' }}
              </div>

              <div class="mt-1 text-sm text-slate-600">Verzija: {{ item.display_version || '—' }}</div>

              <div class="text-sm text-slate-600">Izdavač: {{ item.publisher || '—' }}</div>

              <div class="text-sm text-slate-600">Instalirano: {{ fmtDate(item.install_date) }}</div>

              <div class="mt-1 text-xs text-slate-400">Inventar: {{ fmtDate(item.inventory_date) }}</div>
            </div>
          </div>
        </div>

        <div v-else-if="tab === 'drivers'">
          <div v-if="filteredDrivers.length === 0" class="text-slate-500">
            Nema podataka o drajverima.
          </div>

          <div v-else class="space-y-2">
            <div v-for="item in filteredDrivers" :key="item.id" class="rounded-lg border bg-white p-3">
              <div class="font-medium text-slate-800">{{ item.device_name || 'Nepoznat uređaj' }}</div>

              <div class="mt-1 text-sm text-slate-600">Verzija: {{ item.driver_version || '—' }}</div>

              <div class="text-sm text-slate-600">Datum drajvera: {{ fmtDate(item.driver_date) }}</div>

              <div class="text-sm text-slate-600">Proizvođač: {{ item.manufacturer || '—' }}</div>

              <div class="text-sm text-slate-600">Provider: {{ item.driver_provider_name || '—' }}</div>

              <div class="mt-1 text-xs text-slate-400">Inventar: {{ fmtDate(item.inventory_date) }}</div>
            </div>
          </div>
        </div>

        <div v-else-if="tab === 'services'">
          <div v-if="filteredServices.length === 0" class="text-slate-500">
            Nema podataka o servisima.
          </div>

          <div v-else class="space-y-2">
            <div v-for="item in filteredServices" :key="item.id" class="rounded-lg border bg-white p-3">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="font-medium text-slate-800">
                    {{ item.display_name || item.name || 'Nepoznat servis' }}
                  </div>

                  <div class="text-xs text-slate-500">{{ item.name || '—' }}</div>
                </div>

                <span
                  class="rounded-full border px-2 py-0.5 text-xs"
                  :class="
                    item.state === 'Running'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-50 text-slate-600'
                  "
                >
                  {{ item.state || 'Nepoznato' }}
                </span>
              </div>

              <div class="mt-2 text-sm text-slate-600">Start mode: {{ item.start_mode || '—' }}</div>

              <div class="text-sm text-slate-600">Korisnik: {{ item.start_name || '—' }}</div>

              <div class="mt-1 break-all text-xs text-slate-500">{{ item.path_name || '—' }}</div>

              <div class="mt-1 text-xs text-slate-400">Inventar: {{ fmtDate(item.inventory_date) }}</div>
            </div>
          </div>
        </div>

        <div v-else-if="tab === 'updates'">
          <div v-if="filteredUpdates.length === 0" class="text-slate-500">
            Nema podataka o Windows ažuriranjima.
          </div>

          <div v-else class="space-y-2">
            <div v-for="item in filteredUpdates" :key="item.id" class="rounded-lg border bg-white p-3">
              <div class="flex items-start justify-between gap-3">
                <div class="font-medium text-slate-800">{{ item.hotfix_id || 'Nepoznat KB' }}</div>

                <div class="text-xs text-slate-500">{{ fmtDate(item.installed_on) }}</div>
              </div>

              <div class="mt-1 text-sm text-slate-600">{{ item.description || '—' }}</div>

              <div class="mt-1 text-sm text-slate-600">Instalirao: {{ item.installed_by || '—' }}</div>

              <div class="mt-1 text-xs text-slate-400">Inventar: {{ fmtDate(item.inventory_date) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { fmtDate } from '@/utils/format.js'
import AppButton from '@/components/AppButton.vue'

const route = useRoute()
const router = useRouter()

const entry = ref(null)
const entryLoading = ref(false)
const entryError = ref('')

const tab = ref('software')
const tabLoading = ref(false)
const tabError = ref('')

const software = ref([])
const drivers = ref([])
const services = ref([])
const updates = ref([])

const loaded = ref({ software: false, drivers: false, services: false, updates: false })

const search = ref('')

function goBack() {
  router.push('/')
}

async function loadTab(name) {
  tab.value = name

  if (loaded.value[name]) return

  tabLoading.value = true
  tabError.value = ''

  try {
    const res = await fetchWithAuth(`/api/protected/pdsu/${route.params.id}/${name}`)

    if (!res.ok) {
      throw new Error(await parseError(res, `Greška pri učitavanju inventara. HTTP ${res.status}`))
    }

    const data = await res.json()
    const rows = Array.isArray(data) ? data : []

    if (name === 'software') software.value = rows
    else if (name === 'drivers') drivers.value = rows
    else if (name === 'services') services.value = rows
    else if (name === 'updates') updates.value = rows

    loaded.value[name] = true
  } catch (err) {
    console.error('Greška pri učitavanju inventara:', err)
    tabError.value = err?.message || 'Neuspešno učitavanje inventara.'
  } finally {
    tabLoading.value = false
  }
}

async function selectTab(name) {
  search.value = ''
  await loadTab(name)
}

const filteredSoftware = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return software.value
  return software.value.filter((item) =>
    [item.display_name, item.display_version, item.publisher, item.install_date].some((value) =>
      String(value ?? '').toLowerCase().includes(q)
    )
  )
})

const filteredDrivers = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return drivers.value
  return drivers.value.filter((item) =>
    [item.device_name, item.driver_version, item.driver_date, item.manufacturer, item.driver_provider_name].some(
      (value) => String(value ?? '').toLowerCase().includes(q)
    )
  )
})

const filteredServices = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return services.value
  return services.value.filter((item) =>
    [item.name, item.display_name, item.state, item.start_mode, item.start_name, item.path_name].some(
      (value) => String(value ?? '').toLowerCase().includes(q)
    )
  )
})

const filteredUpdates = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return updates.value
  return updates.value.filter((item) =>
    [item.description, item.hotfix_id, item.installed_on, item.installed_by].some((value) =>
      String(value ?? '').toLowerCase().includes(q)
    )
  )
})

async function loadEntry() {
  entryLoading.value = true
  entryError.value = ''
  try {
    const res = await fetchWithAuth(`/api/protected/pdsu/${route.params.id}`)
    if (!res.ok) {
      entryError.value = 'Računar nije pronađen'
      return
    }
    entry.value = await res.json()
    await loadTab('software')
  } catch (err) {
    console.error(err)
    entryError.value = 'Neuspešno učitan računar'
  } finally {
    entryLoading.value = false
  }
}

onMounted(loadEntry)
</script>
