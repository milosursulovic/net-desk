<template>
  <div class="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-3">
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2 font-medium">
        Ekran
        <span class="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-amber-700">
          BETA
        </span>
      </div>
      <div class="flex gap-2">
        <AppButton v-if="!connected" variant="success" :disabled="starting" @click="start">
          {{ starting ? 'Povezujem…' : 'Uzmi kontrolu ekrana' }}
        </AppButton>
        <AppButton v-else variant="danger" :disabled="stopping" @click="stop">
          {{ stopping ? 'Zaustavljam…' : 'Zaustavi' }}
        </AppButton>
      </div>
    </div>

    <p v-if="!connected" class="text-sm text-slate-500">
      Otvara se bez obaveštenja korisniku za tim računarom. Zahteva UltraVNC
      instaliran i pokrenut na ciljnoj mašini.
    </p>

    <!--
      Kontejner mora UVEK biti realno renderovan (nikad display:none) -
      noVNC pri new RFB(...) meri clientWidth/clientHeight ovog elementa i
      na osnovu toga računa skaliranje canvas-a; ako je u tom trenutku
      display:none (v-show), izmeri 0x0 i slika ostaje nevidljiva čak i
      kad kontejner posle postane vidljiv. "Nije povezano" stanje se zato
      prikazuje kao overlay PREKO uvek-prisutnog kontejnera, ne kroz
      sakrivanje samog kontejnera.
    -->
    <div
      ref="screenEl"
      class="relative w-full min-h-90 max-h-[80vh] bg-slate-900 rounded-lg border-2 border-slate-200 overflow-hidden"
    >
      <div v-if="!connected" class="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
        Nije povezano
      </div>
    </div>

    <ToastNotification :message="toast" />
  </div>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue'
import RFB from '@novnc/novnc'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { useToast } from '@/composables/useToast.js'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'

const props = defineProps({
  agentId: { type: [String, Number], required: true },
})

const { toast, showToast } = useToast()

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

async function start() {
  starting.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/agents/${props.agentId}/vnc/start`, {
      method: 'POST',
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri pokretanju sesije'))
    const session = await res.json()
    sessionId = session.id

    rfb = new RFB(screenEl.value, buildWsUrl(sessionId), {
      credentials: { password: session.vncPassword || '' },
    })
    // Privremeno isključeno (dijagnostika) - proveravamo da li scaleViewport
    // CSS skaliranje krije stvarno iscrtan canvas.
    rfb.scaleViewport = false
    rfb.resizeSession = false

    rfb.addEventListener('connect', () => {
      connected.value = true
      starting.value = false
    })
    rfb.addEventListener('disconnect', (e) => {
      if (starting.value) {
        // Konekcija nikad nije uspostavljena (npr. UltraVNC nije pokrenut
        // na ciljnoj mašini) - detail.clean razlikuje čisto zatvaranje od
        // pada konekcije, ali oba slučaja ovde vraćaju na "nepovezano".
        showToast('Neuspešno povezivanje na ekran', { prefix: '❌ ', duration: 3000 })
      } else if (connected.value && !e.detail?.clean) {
        showToast('VNC konekcija je prekinuta', { prefix: '⚠️ ', duration: 3000 })
      }
      cleanup()
    })
    rfb.addEventListener('credentialsrequired', () => {
      // Fallback ako UltraVNC ipak traži lozinku a nismo je unapred poslali
      // (VNC_SHARED_PASSWORD nepodešen na backend-u).
      rfb.sendCredentials({ password: '' })
    })
  } catch (e) {
    console.error('Neuspešno pokretanje VNC sesije:', e)
    showToast(e.message || 'Greška pri pokretanju sesije', { prefix: '❌ ', duration: 3000 })
    starting.value = false
  }
}

async function stop() {
  stopping.value = true
  try {
    if (sessionId) {
      await fetchWithAuth(`/api/protected/agents/${props.agentId}/vnc/stop`, {
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
    stopping.value = false
  }
}

function cleanup() {
  connected.value = false
  starting.value = false
  rfb = null
  sessionId = null
}

onBeforeUnmount(() => {
  rfb?.disconnect()
})
</script>
