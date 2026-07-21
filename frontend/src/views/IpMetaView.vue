<template>
  <div class="glass-container w-full max-w-3xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-slate-800">
        Metapodaci — {{ entry?.computerName || entry?.ip || 'Nepoznato' }}
      </h1>
      <AppButton variant="neutral" @click="goBack">Nazad</AppButton>
    </div>

    <div v-if="entryLoading" class="text-slate-600">Učitavanje…</div>
    <div v-else-if="entryError" class="text-red-600">{{ entryError }}</div>

    <template v-else>
      <section class="rounded-lg border p-4 mb-6">
        <h2 class="font-semibold mb-2">Istorija dostupnosti</h2>

        <div v-if="uptimeLoading" class="text-sm text-slate-600">Učitavanje…</div>
        <div v-else-if="uptimeError" class="text-sm text-red-600">{{ uptimeError }}</div>
        <div v-else-if="!uptimePeriods.length" class="text-sm text-slate-500">
          Nema zabeležene istorije dostupnosti.
        </div>

        <template v-else>
          <UptimeTimeline :periods="uptimePeriods" class="mb-4" />

          <details class="group">
            <summary class="cursor-pointer text-xs text-slate-500 hover:text-slate-700 select-none">
              Detaljna lista perioda ({{ uptimePeriods.length }})
            </summary>
            <div class="mt-2 space-y-2">
          <div
            v-for="(period, idx) in uptimePeriods"
            :key="idx"
            class="flex items-center justify-between gap-3 border rounded-lg p-3 bg-white text-sm"
          >
            <div class="flex items-center gap-2">
              <span
                class="inline-block w-2 h-2 rounded-full"
                :class="period.status === 'online' ? 'bg-green-500' : 'bg-red-500'"
              />
              <span class="font-medium">{{ period.status === 'online' ? 'Online' : 'Offline' }}</span>
            </div>

            <div class="text-slate-500 text-right">
              <div>{{ formatDuration(period.from, period.to) }}</div>
              <div class="text-xs">
                {{ fmtDate(period.from) }} — {{ period.to ? fmtDate(period.to) : 'u toku' }}
              </div>
            </div>
          </div>
            </div>
          </details>
        </template>
      </section>

      <div v-if="metaLoading" class="text-slate-600">Učitavanje metapodataka…</div>
      <div v-else-if="metaError" class="text-red-600">{{ metaError }}</div>
      <div v-else-if="!meta" class="text-slate-600">Nema metapodataka za ovu IP adresu.</div>

      <div v-else class="space-y-6">
        <div class="rounded-lg border p-4 bg-slate-50">
          <div class="flex flex-col gap-1">
            <div><span class="font-semibold">Računar:</span> {{ safe(meta.ComputerName) }}</div>
            <div><span class="font-semibold">Korisnik:</span> {{ safe(meta.UserName) }}</div>
            <div>
              <span class="font-semibold">Prikupljeno:</span>
              {{ fmtDate(meta.CollectedAt) }}
            </div>
            <div class="text-xs text-slate-500 mt-1">
              Last update: {{ fmtDate(meta.updatedAt) }} • Created:
              {{ fmtDate(meta.createdAt) }}
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-4">
          <section class="rounded-lg border p-4">
            <h4 class="font-semibold mb-2">Operativni sistem</h4>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div class="text-slate-500">Caption</div>
              <div>{{ safe(meta.OS?.Caption) }}</div>
              <div class="text-slate-500">Verzija</div>
              <div>{{ safe(meta.OS?.Version) }}</div>
              <div class="text-slate-500">Build</div>
              <div>{{ safe(meta.OS?.Build) }}</div>
              <div class="text-slate-500">Install date</div>
              <div>{{ fmtDate(meta.OS?.InstallDate) }}</div>
            </div>
          </section>

          <section class="rounded-lg border p-4">
            <h4 class="font-semibold mb-2">Sistem</h4>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div class="text-slate-500">Proizvođač</div>
              <div>{{ safe(meta.System?.Manufacturer) }}</div>
              <div class="text-slate-500">Model</div>
              <div>{{ safe(meta.System?.Model) }}</div>
              <div class="text-slate-500">RAM ukupno</div>
              <div>{{ fmtGb(meta.System?.TotalRAM_GB) }}</div>
            </div>
          </section>

          <section class="rounded-lg border p-4">
            <h4 class="font-semibold mb-2">CPU</h4>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div class="text-slate-500">Naziv</div>
              <div>{{ safe(meta.CPU?.Name) }}</div>
              <div class="text-slate-500">Jezgra</div>
              <div>{{ safe(meta.CPU?.Cores) }}</div>
              <div class="text-slate-500">Logičkih</div>
              <div>{{ safe(meta.CPU?.LogicalCPUs) }}</div>
              <div class="text-slate-500">Max MHz</div>
              <div>{{ safe(meta.CPU?.MaxClockMHz) }}</div>
              <div class="text-slate-500">Socket</div>
              <div>{{ safe(meta.CPU?.Socket) }}</div>
            </div>
          </section>

          <section class="rounded-lg border p-4">
            <h4 class="font-semibold mb-2">RAM moduli ({{ meta.RAMModules?.length || 0 }})</h4>
            <div v-if="meta.RAMModules?.length" class="space-y-2">
              <div
                v-for="(r, idx) in meta.RAMModules"
                :key="idx"
                class="border rounded-lg p-3 bg-white"
              >
                <div class="text-sm">
                  <span class="text-slate-500">Slot:</span> {{ safe(r.Slot) }}
                </div>
                <div class="text-sm">
                  <span class="text-slate-500">Mfr/PN:</span>
                  {{ [r.Manufacturer, r.PartNumber].filter(Boolean).join(' · ') || '—' }}
                </div>
                <div class="text-sm">
                  <span class="text-slate-500">Serijski:</span> {{ safe(r.Serial) }}
                </div>
                <div class="text-sm">
                  <span class="text-slate-500">Kapacitet:</span> {{ fmtGb(r.CapacityGB) }}
                </div>
                <div class="text-sm">
                  <span class="text-slate-500">Brzina:</span> {{ safe(r.SpeedMTps) }}
                </div>
                <div class="text-sm">
                  <span class="text-slate-500">Form factor:</span> {{ safe(r.FormFactor) }}
                </div>
              </div>
            </div>
            <div v-else class="text-sm text-slate-500">Nema podataka.</div>
          </section>

          <section class="rounded-lg border p-4">
            <h4 class="font-semibold mb-2">Diskovi ({{ meta.Storage?.length || 0 }})</h4>
            <div v-if="meta.Storage?.length" class="space-y-2">
              <div v-for="(s, idx) in meta.Storage" :key="idx" class="border rounded-lg p-3 bg-white">
                <div class="text-sm">
                  <span class="text-slate-500">Model:</span> {{ safe(s.Model) }}
                </div>
                <div class="text-sm">
                  <span class="text-slate-500">Serijski/FW:</span>
                  {{ [s.Serial, s.Firmware].filter(Boolean).join(' · ') || '—' }}
                </div>
                <div class="text-sm">
                  <span class="text-slate-500">Veličina:</span>
                  {{ s.SizeGB ? `${s.SizeGB} GB` : '—' }}
                </div>
                <div class="text-sm">
                  <span class="text-slate-500">Tip/BUS:</span>
                  {{ [s.MediaType, s.BusType].filter(Boolean).join(' · ') || '—' }}
                </div>
                <div class="text-sm">
                  <span class="text-slate-500">DeviceID:</span> {{ safe(s.DeviceID) }}
                </div>
              </div>
            </div>
            <div v-else class="text-sm text-slate-500">Nema podataka.</div>
          </section>

          <section class="rounded-lg border p-4">
            <h4 class="font-semibold mb-2">GPU ({{ meta.GPUs?.length || 0 }})</h4>
            <div v-if="meta.GPUs?.length" class="space-y-2">
              <div v-for="(g, idx) in meta.GPUs" :key="idx" class="border rounded-lg p-3 bg-white">
                <div class="text-sm">
                  <span class="text-slate-500">Naziv:</span> {{ safe(g.Name) }}
                </div>
                <div class="text-sm">
                  <span class="text-slate-500">Driver:</span> {{ safe(g.DriverVers) }}
                </div>
                <div class="text-sm">
                  <span class="text-slate-500">VRAM:</span>
                  {{ g.VRAM_GB ? `${g.VRAM_GB} GB` : '—' }}
                </div>
              </div>
            </div>
            <div v-else class="text-sm text-slate-500">Nema podataka.</div>
          </section>

          <section class="rounded-lg border p-4">
            <h4 class="font-semibold mb-2">Mreža ({{ meta.NICs?.length || 0 }})</h4>
            <div v-if="meta.NICs?.length" class="space-y-2">
              <div v-for="(n, idx) in meta.NICs" :key="idx" class="border rounded-lg p-3 bg-white">
                <div class="text-sm">
                  <span class="text-slate-500">Naziv:</span> {{ safe(n.Name) }}
                </div>
                <div class="text-sm"><span class="text-slate-500">MAC:</span> {{ safe(n.MAC) }}</div>
                <div class="text-sm">
                  <span class="text-slate-500">Brzina:</span> {{ fmtMbps(n.SpeedMbps) }}
                </div>
              </div>
            </div>
            <div v-else class="text-sm text-slate-500">Nema podataka.</div>
          </section>

          <section class="rounded-lg border p-4">
            <h4 class="font-semibold mb-2">BIOS / Matična</h4>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div class="text-slate-500">BIOS Vendor</div>
              <div>{{ safe(meta.BIOS?.Vendor) }}</div>
              <div class="text-slate-500">BIOS Ver.</div>
              <div>{{ safe(meta.BIOS?.Version) }}</div>
              <div class="text-slate-500">BIOS Release</div>
              <div>{{ fmtDate(meta.BIOS?.ReleaseDate) }}</div>
              <div class="text-slate-500">MB Proizvođač</div>
              <div>{{ safe(meta.Motherboard?.Manufacturer) }}</div>
              <div class="text-slate-500">MB Model</div>
              <div>{{ safe(meta.Motherboard?.Product) }}</div>
              <div class="text-slate-500">MB Serijski</div>
              <div>{{ safe(meta.Motherboard?.Serial) }}</div>
            </div>
          </section>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { fmtDate, fmtGb, fmtMbps, safe } from '@/utils/format.js'
import AppButton from '@/components/AppButton.vue'
import UptimeTimeline from '@/components/UptimeTimeline.vue'

const route = useRoute()
const router = useRouter()

const entry = ref(null)
const entryLoading = ref(false)
const entryError = ref('')

const meta = ref(null)
const metaLoading = ref(false)
const metaError = ref('')

const uptimePeriods = ref([])
const uptimeLoading = ref(false)
const uptimeError = ref('')

function goBack() {
  router.push('/')
}

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

async function loadMeta(ip) {
  metaLoading.value = true
  metaError.value = ''
  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses/${encodeURIComponent(ip)}/metadata`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    meta.value = data?.metadata ?? data
  } catch (err) {
    console.error(err)
    metaError.value = 'Neuspešno učitavanje metapodataka.'
  } finally {
    metaLoading.value = false
  }
}

async function loadUptime(id) {
  uptimeLoading.value = true
  uptimeError.value = ''
  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses/${id}/uptime`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    uptimePeriods.value = Array.isArray(data?.periods) ? data.periods : []
  } catch (err) {
    console.error(err)
    uptimeError.value = 'Neuspešno učitavanje istorije dostupnosti.'
  } finally {
    uptimeLoading.value = false
  }
}

async function loadEntry() {
  entryLoading.value = true
  entryError.value = ''
  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses/${route.params.id}`)
    if (!res.ok) {
      entryError.value = 'Unos nije pronađen'
      return
    }
    entry.value = await res.json()
    await Promise.all([loadMeta(entry.value.ip), loadUptime(route.params.id)])
  } catch (err) {
    console.error(err)
    entryError.value = 'Neuspešno učitan unos'
  } finally {
    entryLoading.value = false
  }
}

onMounted(loadEntry)
</script>
