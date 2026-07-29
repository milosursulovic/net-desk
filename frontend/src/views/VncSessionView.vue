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
    // scaleViewport je ranije, ugrađen u AgentDetailView-ov tab, ostavljao
    // canvas nevidljiv (verovatno zbog kontejnera koji se menjao veličinom
    // dok se tab prebacivao). Ovde je ceo prozor posvećen samo ovoj sesiji
    // od početka, pa se sad ponovo probava - ako ekran opet ostane prazan,
    // vratiti na false.
    rfb.scaleViewport = true
    rfb.resizeSession = false

    rfb.addEventListener('connect', () => {
      connected.value = true
      starting.value = false
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

onMounted(() => {
  loadAgent()
  start()
})

onBeforeUnmount(() => {
  rfb?.disconnect()
})
</script>
