<template>
  <div class="min-h-screen bg-slate-950 flex flex-col">
    <div class="flex items-center justify-between gap-3 px-4 py-2 bg-slate-900 border-b border-slate-800">
      <div class="flex items-center gap-2 text-slate-200 font-medium truncate">
        {{ viewOnly ? 'Pregled ekrana' : 'Udaljena kontrola ekrana' }}
        <span class="text-slate-500 text-sm truncate">{{ agent?.hostname || agent?.agentUid || '' }}</span>
        <span class="rounded-full border border-amber-200/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-amber-400">
          BETA
        </span>
        <span
          v-if="viewOnly"
          class="rounded-full border border-sky-200/40 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-sky-400"
        >
          SAMO PREGLED
        </span>
      </div>
      <AppButton variant="danger" :disabled="stopping" @click="stopAndClose">
        {{ stopping ? 'Zatvaram…' : 'Zatvori sesiju' }}
      </AppButton>
    </div>

    <!--
      min-h-0 je namerno - bez njega, flex stavka sa overflow-auto po
      default-u računa min-height na osnovu sadržaja (flexbox min-height:auto
      pravilo), umesto na osnovu dodeljenog flex prostora. To pravi cirkularan
      problem baš u trenutku kad noVNC meri veličinu ovog kontejnera da
      izračuna scaleViewport skaliranje (kontejner čeka sadržaj, sadržaj čeka
      kontejner -> izmereno 0, canvas ostaje "sa scale 0" tj. nevidljiv).
    -->
    <div class="relative flex-1 min-h-0 overflow-auto bg-black">
      <div v-if="!connected" class="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
        {{ starting ? 'Povezujem…' : 'Nije povezano' }}
      </div>
      <div ref="screenEl" class="w-full h-full"></div>
    </div>

    <ToastNotification :message="toast" />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import RFB from '@novnc/novnc'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { useToast } from '@/composables/useToast.js'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'

const route = useRoute()
const agentId = route.params.id
const viewOnly = route.query.viewOnly === '1'

const { toast, showToast } = useToast()

const agent = ref(null)
const connected = ref(false)
const starting = ref(false)
const stopping = ref(false)
const screenEl = ref(null)

let rfb = null
let sessionId = null

function buildWsUrl(id) {
  const token = localStorage.getItem('token')
  const base = window.location.origin.replace(/^http/, 'ws')
  return `${base}/api/protected/vnc-stream/${id}?token=${encodeURIComponent(token)}`
}

async function loadAgent() {
  try {
    const res = await fetchWithAuth(`/api/protected/agents/${agentId}`)
    if (res.ok) agent.value = await res.json()
  } catch (e) {
    console.error('Neuspešno učitan agent:', e)
  }
}

async function start() {
  starting.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/agents/${agentId}/vnc/start`, { method: 'POST' })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri pokretanju sesije'))
    const session = await res.json()
    sessionId = session.id

    rfb = new RFB(screenEl.value, buildWsUrl(sessionId), {
      credentials: { password: session.vncPassword || '' },
    })
    rfb.viewOnly = viewOnly
    // noVNC-ova ugrađena scaleViewport logika je u ovoj verziji/okruženju
    // ostajala zaglavljena na scale=0 (canvas ispravne rezolucije, ali
    // nevidljiv) bez obzira na layout kontejnera - probano i sa i bez
    // display:none tajminga i flexbox min-h-0 fix-a, ništa nije pomoglo.
    // Umesto toga, skaliranje računamo sami preko iste Display.scale
    // metode koju noVNC interno koristi (ista _rescale() logika, isti
    // efekat na mapiranje mišnih koordinata preko _display.absX/absY),
    // samo je pozivamo MI, u trenutku kad smo sigurni da je kontejner
    // stvarno izmeren - videti applyManualScale().
    rfb.scaleViewport = false
    rfb.resizeSession = false

    rfb.addEventListener('connect', () => {
      connected.value = true
      starting.value = false
      requestAnimationFrame(applyManualScale)
    })
    rfb.addEventListener('disconnect', (e) => {
      if (starting.value) {
        showToast('Neuspešno povezivanje na ekran', { prefix: '❌ ', duration: 3000 })
      } else if (connected.value && !e.detail?.clean) {
        showToast('VNC konekcija je prekinuta', { prefix: '⚠️ ', duration: 3000 })
      }
      cleanup()
    })
    rfb.addEventListener('credentialsrequired', () => {
      rfb.sendCredentials({ password: '' })
    })
  } catch (e) {
    console.error('Neuspešno pokretanje VNC sesije:', e)
    showToast(e.message || 'Greška pri pokretanju sesije', { prefix: '❌ ', duration: 3000 })
    starting.value = false
  }
}

async function stop() {
  try {
    if (sessionId) {
      await fetchWithAuth(`/api/protected/agents/${agentId}/vnc/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
    }
  } catch (e) {
    console.error('Greška pri zaustavljanju VNC sesije:', e)
  } finally {
    rfb?.disconnect()
    cleanup()
  }
}

async function stopAndClose() {
  stopping.value = true
  await stop()
  window.close()
}

function cleanup() {
  connected.value = false
  starting.value = false
  rfb = null
  sessionId = null
}

// Ručno "fit to window" skaliranje - vidi napomenu uz rfb.scaleViewport
// iznad. rfb._display je isti (samo ne-zvanično izložen, single underscore)
// Display objekat čiji public scale setter noVNC sam koristi interno
// (core/display.js - set scale(scale) { this._rescale(scale); }); ovde ga
// zovemo direktno sa faktorom koji SAMI izračunamo iz stvarne, već
// izmerene veličine kontejnera i canvas-a, čime zaobilazimo autoscale()
// računicu koja je ostajala zaglavljena na 0.
function applyManualScale() {
  if (!rfb || !screenEl.value) return
  const canvas = screenEl.value.querySelector('canvas')
  if (!canvas || !canvas.width || !canvas.height) return

  const containerWidth = screenEl.value.clientWidth
  const containerHeight = screenEl.value.clientHeight
  if (!containerWidth || !containerHeight) return

  const factor = Math.min(containerWidth / canvas.width, containerHeight / canvas.height)
  if (factor > 0 && Number.isFinite(factor)) {
    rfb._display.scale = factor
  }
}

function handleWindowResize() {
  requestAnimationFrame(applyManualScale)
}

onMounted(() => {
  loadAgent()
  start()
  window.addEventListener('resize', handleWindowResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleWindowResize)
  rfb?.disconnect()
})
</script>
