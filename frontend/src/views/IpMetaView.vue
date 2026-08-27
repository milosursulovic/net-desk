<template>
  <div class="w-full max-w-3xl mx-auto">
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
      <h1 class="text-2xl font-bold text-ink wrap-break-word" style="font-family: var(--font-display)">
        Metapodaci — {{ entry?.computerName || entry?.ip || 'Nepoznato' }}
      </h1>
      <div class="flex flex-wrap items-center gap-2">
        <AppButton v-if="meta" variant="secondary" :disabled="exportingPdf" @click="exportPdf">
          {{ exportingPdf ? 'Izvoz…' : 'Izvezi PDF' }}
        </AppButton>
        <AppButton variant="secondary" :disabled="waking" @click="wakeComputer">
          {{ waking ? 'Buđenje…' : 'Probudi računar' }}
        </AppButton>
        <AppButton v-if="meta && isAdmin" variant="danger" @click="clearMetadata">
          Očisti metapodatke
        </AppButton>
        <AppButton
          v-if="entry"
          variant="secondary"
          :to="{ path: '/', query: { search: entry.ip, site: entry.site } }"
        >
          Na početnoj
        </AppButton>
        <AppButton variant="neutral" @click="goBack">Nazad</AppButton>
      </div>
    </div>

    <div v-if="entryLoading" class="text-ink-secondary">Učitavanje…</div>
    <div v-else-if="entryError" class="text-bad">{{ entryError }}</div>

    <template v-else>
      <section class="rounded-lg border border-line bg-surface p-4 mb-6">
        <h2 class="font-semibold text-ink mb-2">Istorija dostupnosti</h2>

        <div v-if="uptimeLoading" class="text-sm text-ink-secondary">Učitavanje…</div>
        <div v-else-if="uptimeError" class="text-sm text-bad">{{ uptimeError }}</div>
        <div v-else-if="!uptimePeriods.length" class="text-sm text-ink-muted">
          Nema zabeležene istorije dostupnosti.
        </div>

        <template v-else>
          <UptimeTimeline :periods="uptimePeriods" class="mb-4" />

          <details class="group">
            <summary class="cursor-pointer text-xs text-ink-muted hover:text-ink select-none">
              Detaljna lista perioda ({{ uptimePeriods.length }})
            </summary>
            <div class="mt-2 space-y-2">
          <div
            v-for="(period, idx) in uptimePeriods"
            :key="idx"
            class="flex items-center justify-between gap-3 border border-line rounded-lg p-3 bg-surface text-sm"
          >
            <div class="flex items-center gap-2">
              <span
                class="inline-block w-2 h-2 rounded-full"
                :class="period.status === 'online' ? 'bg-good' : 'bg-bad'"
              />
              <span class="font-medium text-ink">{{ period.status === 'online' ? 'Online' : 'Offline' }}</span>
            </div>

            <div class="text-ink-muted text-right font-mono">
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

      <div v-if="metaLoading" class="text-ink-secondary">Učitavanje metapodataka…</div>
      <div v-else-if="metaError" class="text-bad">{{ metaError }}</div>
      <div v-else-if="!meta" class="text-ink-secondary">Nema metapodataka za ovu IP adresu.</div>

      <div v-else class="space-y-6">
        <div class="rounded-lg border border-line bg-surface-sunken p-4">
          <div class="flex flex-col gap-1">
            <div class="text-ink"><span class="font-semibold">Računar:</span> {{ safe(meta.ComputerName) }}</div>
            <div class="text-ink"><span class="font-semibold">Korisnik:</span> {{ safe(meta.UserName) }}</div>
            <div class="text-ink">
              <span class="font-semibold">Prikupljeno:</span>
              {{ fmtDate(meta.CollectedAt) }}
            </div>
            <div class="text-xs text-ink-muted mt-1 font-mono">
              Last update: {{ fmtDate(meta.updatedAt) }} • Created:
              {{ fmtDate(meta.createdAt) }}
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <section class="rounded-lg border border-line bg-surface p-4">
            <h4 class="font-semibold text-ink mb-2">Operativni sistem</h4>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div class="text-ink-muted">Caption</div>
              <div>{{ safe(meta.OS?.Caption) }}</div>
              <div class="text-ink-muted">Verzija</div>
              <div>{{ safe(meta.OS?.Version) }}</div>
              <div class="text-ink-muted">Build</div>
              <div>{{ safe(meta.OS?.Build) }}</div>
              <div class="text-ink-muted">Install date</div>
              <div>{{ fmtDate(meta.OS?.InstallDate) }}</div>
            </div>
          </section>

          <section class="rounded-lg border border-line bg-surface p-4">
            <h4 class="font-semibold text-ink mb-2">Sistem</h4>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div class="text-ink-muted">Proizvođač</div>
              <div>{{ safe(meta.System?.Manufacturer) }}</div>
              <div class="text-ink-muted">Model</div>
              <div>{{ safe(meta.System?.Model) }}</div>
              <div class="text-ink-muted">RAM ukupno</div>
              <div>{{ fmtGb(meta.System?.TotalRAM_GB) }}</div>
            </div>
          </section>

          <section class="rounded-lg border border-line bg-surface p-4">
            <h4 class="font-semibold text-ink mb-2">CPU</h4>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div class="text-ink-muted">Naziv</div>
              <div>{{ safe(meta.CPU?.Name) }}</div>
              <div class="text-ink-muted">Jezgra</div>
              <div>{{ safe(meta.CPU?.Cores) }}</div>
              <div class="text-ink-muted">Logičkih</div>
              <div>{{ safe(meta.CPU?.LogicalCPUs) }}</div>
              <div class="text-ink-muted">Max MHz</div>
              <div>{{ safe(meta.CPU?.MaxClockMHz) }}</div>
              <div class="text-ink-muted">Socket</div>
              <div>{{ safe(meta.CPU?.Socket) }}</div>
            </div>
          </section>

          <section class="rounded-lg border border-line bg-surface p-4">
            <h4 class="font-semibold text-ink mb-2">BIOS / Matična</h4>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div class="text-ink-muted">BIOS Vendor</div>
              <div>{{ safe(meta.BIOS?.Vendor) }}</div>
              <div class="text-ink-muted">BIOS Ver.</div>
              <div>{{ safe(meta.BIOS?.Version) }}</div>
              <div class="text-ink-muted">BIOS Release</div>
              <div>{{ fmtDate(meta.BIOS?.ReleaseDate) }}</div>
              <div class="text-ink-muted">MB Proizvođač</div>
              <div>{{ safe(meta.Motherboard?.Manufacturer) }}</div>
              <div class="text-ink-muted">MB Model</div>
              <div>{{ safe(meta.Motherboard?.Product) }}</div>
              <div class="text-ink-muted">MB Serijski</div>
              <div>{{ safe(meta.Motherboard?.Serial) }}</div>
            </div>
          </section>
        </div>

        <div class="space-y-4">
          <section>
            <h4 class="font-semibold text-ink mb-2">RAM moduli ({{ meta.RAMModules?.length || 0 }})</h4>
            <div v-if="meta.RAMModules?.length" class="table-shell">
              <div class="overflow-x-auto">
                <table class="w-full min-w-150 border-collapse text-sm">
                  <thead>
                    <tr class="table-head-row">
                      <th class="px-3 py-2 text-left">Slot</th>
                      <th class="px-3 py-2 text-left">Mfr / PN</th>
                      <th class="px-3 py-2 text-left">Serijski</th>
                      <th class="px-3 py-2 text-left">Kapacitet</th>
                      <th class="px-3 py-2 text-left">Brzina</th>
                      <th class="px-3 py-2 text-left">Form factor</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(r, idx) in meta.RAMModules" :key="idx" class="border-b border-line last:border-0">
                      <td class="px-3 py-2 align-top">{{ safe(r.Slot) }}</td>
                      <td class="px-3 py-2 align-top">{{ [r.Manufacturer, r.PartNumber].filter(Boolean).join(' · ') || '—' }}</td>
                      <td class="px-3 py-2 align-top font-mono text-xs">{{ safe(r.Serial) }}</td>
                      <td class="px-3 py-2 align-top">{{ fmtGb(r.CapacityGB) }}</td>
                      <td class="px-3 py-2 align-top">{{ safe(r.SpeedMTps) }}</td>
                      <td class="px-3 py-2 align-top">{{ safe(r.FormFactor) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div v-else class="text-sm text-ink-muted">Nema podataka.</div>
          </section>

          <section>
            <h4 class="font-semibold text-ink mb-2">Diskovi ({{ meta.Storage?.length || 0 }})</h4>
            <div v-if="meta.Storage?.length" class="table-shell">
              <div class="overflow-x-auto">
                <table class="w-full min-w-150 border-collapse text-sm">
                  <thead>
                    <tr class="table-head-row">
                      <th class="px-3 py-2 text-left">Model</th>
                      <th class="px-3 py-2 text-left">Serijski / FW</th>
                      <th class="px-3 py-2 text-left">Veličina</th>
                      <th class="px-3 py-2 text-left">Tip / BUS</th>
                      <th class="px-3 py-2 text-left">DeviceID</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(s, idx) in meta.Storage" :key="idx" class="border-b border-line last:border-0">
                      <td class="px-3 py-2 align-top">{{ safe(s.Model) }}</td>
                      <td class="px-3 py-2 align-top font-mono text-xs">{{ [s.Serial, s.Firmware].filter(Boolean).join(' · ') || '—' }}</td>
                      <td class="px-3 py-2 align-top">{{ s.SizeGB ? `${s.SizeGB} GB` : '—' }}</td>
                      <td class="px-3 py-2 align-top">{{ [s.MediaType, s.BusType].filter(Boolean).join(' · ') || '—' }}</td>
                      <td class="px-3 py-2 align-top font-mono text-xs">{{ safe(s.DeviceID) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div v-else class="text-sm text-ink-muted">Nema podataka.</div>
          </section>

          <section>
            <h4 class="font-semibold text-ink mb-2">GPU ({{ meta.GPUs?.length || 0 }})</h4>
            <div v-if="meta.GPUs?.length" class="table-shell">
              <div class="overflow-x-auto">
                <table class="w-full min-w-100 border-collapse text-sm">
                  <thead>
                    <tr class="table-head-row">
                      <th class="px-3 py-2 text-left">Naziv</th>
                      <th class="px-3 py-2 text-left">Driver</th>
                      <th class="px-3 py-2 text-left">VRAM</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(g, idx) in meta.GPUs" :key="idx" class="border-b border-line last:border-0">
                      <td class="px-3 py-2 align-top">{{ safe(g.Name) }}</td>
                      <td class="px-3 py-2 align-top">{{ safe(g.DriverVers) }}</td>
                      <td class="px-3 py-2 align-top">{{ g.VRAM_GB ? `${g.VRAM_GB} GB` : '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div v-else class="text-sm text-ink-muted">Nema podataka.</div>
          </section>

          <section>
            <h4 class="font-semibold text-ink mb-2">Mreža ({{ meta.NICs?.length || 0 }})</h4>
            <div v-if="meta.NICs?.length" class="table-shell">
              <div class="overflow-x-auto">
                <table class="w-full min-w-100 border-collapse text-sm">
                  <thead>
                    <tr class="table-head-row">
                      <th class="px-3 py-2 text-left">Naziv</th>
                      <th class="px-3 py-2 text-left">MAC</th>
                      <th class="px-3 py-2 text-left">Brzina</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(n, idx) in meta.NICs" :key="idx" class="border-b border-line last:border-0">
                      <td class="px-3 py-2 align-top">{{ safe(n.Name) }}</td>
                      <td class="px-3 py-2 align-top font-mono text-xs">{{ safe(n.MAC) }}</td>
                      <td class="px-3 py-2 align-top">{{ fmtMbps(n.SpeedMbps) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div v-else class="text-sm text-ink-muted">Nema podataka.</div>
          </section>
        </div>
      </div>
    </template>

    <ToastNotification :message="toast" />

    <ConfirmDialog
      :open="confirmState.open"
      :title="confirmState.title"
      :message="confirmState.message"
      @confirm="resolveConfirm(true)"
      @cancel="resolveConfirm(false)"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { downloadFromResponse } from '@/utils/download.js'
import { fmtDate, fmtGb, fmtMbps, safe } from '@/utils/format.js'
import { useToast } from '@/composables/useToast.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import AppButton from '@/components/AppButton.vue'
import UptimeTimeline from '@/components/UptimeTimeline.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const { toast, showToast } = useToast()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()
const { isAdmin } = useCurrentUser()

const route = useRoute()
const router = useRouter()

const entry = ref(null)
const entryLoading = ref(false)
const entryError = ref('')

const meta = ref(null)
const metaLoading = ref(false)
const metaError = ref('')
const exportingPdf = ref(false)
const waking = ref(false)

const uptimePeriods = ref([])
const uptimeLoading = ref(false)
const uptimeError = ref('')

function goBack() {
  router.push('/')
}

async function exportPdf() {
  exportingPdf.value = true
  try {
    const filenameSafe = (entry.value?.computerName || entry.value?.ip || route.params.id).replace(/[^\w-]+/g, '_')
    await downloadFromResponse(
      await fetchWithAuth(`/api/protected/metadata/${route.params.id}/export-pdf`),
      `NetDesk_metapodaci_${filenameSafe}.pdf`,
    )
  } catch (err) {
    console.error('Greška pri izvozu PDF-a:', err)
    showToast('Greška pri izvozu PDF-a.', { kind: 'error', duration: 3000 })
  } finally {
    exportingPdf.value = false
  }
}

async function wakeComputer() {
  waking.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/ip-addresses/${route.params.id}/wake`, { method: 'POST' })
    if (!res.ok) throw new Error(await parseError(res, `HTTP ${res.status}`))
    showToast('Magic paket poslat, računar bi trebalo da se upali za par trenutaka.')
  } catch (err) {
    console.error('Greška pri buđenju računara:', err)
    showToast(err.message || 'Greška pri buđenju računara.', { kind: 'error', duration: 3000 })
  } finally {
    waking.value = false
  }
}

async function clearMetadata() {
  const ok = await askConfirm(
    'Da li želiš da obrišeš SVE prikupljene metapodatke za ovaj računar? Ova akcija se ne može poništiti.',
    { title: 'Brisanje metapodataka' },
  )
  if (!ok) return

  try {
    const res = await fetchWithAuth(`/api/protected/metadata/${route.params.id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await parseError(res, `HTTP ${res.status}`))
    meta.value = null
    showToast('Metapodaci obrisani.')
  } catch (err) {
    console.error('Greška pri brisanju metapodataka:', err)
    showToast('Greška pri brisanju metapodataka.', { kind: 'error', duration: 3000 })
  }
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
