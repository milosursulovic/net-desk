<template>
  <div ref="rootEl" class="min-h-screen bg-slate-950 flex flex-col">
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
        <!--
          Transport bedž - vidljiv dok se WebRTC put pilotira (Faza 2/3
          plan), da admin na prvi pogled vidi da li je sesija stvarno na
          WebRTC-u ili je (od početka, ili posle fallback-a) na RFB-u.
          Bezbedno ukloniti kad se fallback mehanizam potvrdi pouzdanim.
        -->
        <span
          v-if="sessionType"
          class="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none"
          :class="sessionType === 'webrtc'
            ? 'border-emerald-200/40 bg-emerald-500/10 text-emerald-400'
            : 'border-slate-500/40 bg-slate-500/10 text-slate-400'"
        >
          {{ sessionType === 'webrtc' ? 'WEBRTC' : 'RFB' }}
        </span>
      </div>
      <div class="flex items-center gap-3">
        <span v-if="isFullscreen" class="text-xs text-slate-500 hidden sm:inline">
          Drži Esc da izađeš iz punog ekrana
        </span>
        <!--
          Dijagnostički log - čita vnc_webrtc_signaling audit tabelu preko
          backend-a. Postoji jer se WebRtcBridge.exe-ov lokalni fajl log na
          klijentskoj mašini uživo pokazao nepouzdanim (CreateProcessAsUser
          token bez učitanog korisničkog profila) - agent sad iste poruke
          šalje i preko signaling kanala, koji backend bezuslovno snima.
          Bezbedno ukloniti kad se WebRTC put potvrdi pouzdanim.
        -->
        <AppButton v-if="sessionType" variant="neutral" :disabled="diagLogLoading" @click="toggleDiagLog">
          {{ diagLogOpen ? 'Sakrij log' : 'Dijagnostički log' }}
        </AppButton>
        <AppButton v-if="!viewOnly" variant="neutral" @click="pasteToRemote">
          Nalepi na udaljeni računar
        </AppButton>
        <AppButton variant="neutral" @click="toggleFullscreen">
          {{ isFullscreen ? 'Izađi iz punog ekrana' : 'Ceo ekran' }}
        </AppButton>
        <AppButton variant="danger" :disabled="stopping" @click="stopAndClose">
          {{ stopping ? 'Zatvaram…' : 'Zatvori sesiju' }}
        </AppButton>
      </div>
    </div>

    <div v-if="diagLogOpen" class="max-h-48 overflow-auto bg-slate-900 border-b border-slate-800 px-4 py-2 text-xs font-mono text-slate-300 space-y-0.5">
      <div v-if="diagLogLoading">Učitavanje…</div>
      <div v-else-if="!diagLog.length" class="text-slate-500">Nema zabeleženih poruka za ovu sesiju.</div>
      <div v-for="(entry, i) in diagLog" :key="i" class="whitespace-pre-wrap break-all">
        <span class="text-slate-500">{{ entry.createdAt }}</span>
        <span :class="entry.direction === 'agent_to_viewer' ? 'text-emerald-400' : 'text-sky-400'">[{{ entry.direction }}]</span>
        {{ entry.payload }}
      </div>
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
      <!--
        Oba elementa uvek postoje u DOM-u (v-show, ne v-if) - fallback sa
        WebRTC na RFB menja samo koji je vidljiv, bez remount-a. Za RFB granu
        noVNC meri screenEl pri konekciji (vidi min-h-0 napomenu iznad) - da
        se ta ista zamka ne ponovi, screenEl NIKAD ne izlazi iz DOM-a preko
        v-if, samo preko v-show (display:none ne utiče na getBoundingClientRect
        merenje koje se dešava POSLE display:block povratka, isto kao pre).
      -->
      <div ref="screenEl" v-show="sessionType !== 'webrtc'" class="w-full h-full"></div>
      <video
        ref="videoEl"
        v-show="sessionType === 'webrtc'"
        autoplay
        playsinline
        muted
        class="w-full h-full object-contain"
        @mousemove="onVideoPointerMove"
        @mousedown="onVideoPointerButton($event, true)"
        @mouseup="onVideoPointerButton($event, false)"
        @wheel.prevent="onVideoWheel"
        @contextmenu.prevent
      ></video>
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
import { scanCodeFor } from '@/utils/keyScanCodes.js'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'

const route = useRoute()
const agentId = route.params.id
const viewOnly = route.query.viewOnly === '1'

const { toast, showToast, copyToClipboard } = useToast()

const agent = ref(null)
const connected = ref(false)
const starting = ref(false)
const stopping = ref(false)
const isFullscreen = ref(false)
const screenEl = ref(null)
const rootEl = ref(null)
const videoEl = ref(null)
// 'rfb' | 'webrtc' | null (null dok /vnc/start odgovor ne stigne) - backend
// (vncSessions.service.js) odlučuje ovo na osnovu agent-ovog uživo
// prijavljenog remote_control_tier + vnc_webrtc_enabled flag-a, frontend
// samo grana prema onome što odgovor kaže, nikad sam ne pogađa.
const sessionType = ref(null)

const diagLogOpen = ref(false)
const diagLogLoading = ref(false)
const diagLog = ref([])

async function toggleDiagLog() {
  diagLogOpen.value = !diagLogOpen.value
  if (!diagLogOpen.value || !sessionId) return

  diagLogLoading.value = true
  try {
    const res = await fetchWithAuth(`/api/protected/agents/${agentId}/vnc/${sessionId}/signaling-log`)
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri učitavanju loga'))
    const data = await res.json()
    diagLog.value = data.items || []
  } catch (e) {
    console.error('Neuspešno učitan dijagnostički log', e)
    showToast(e.message || 'Greška pri učitavanju loga', { prefix: '❌ ', duration: 3000 })
  } finally {
    diagLogLoading.value = false
  }
}

let rfb = null
let sessionId = null
let currentSession = null // ceo /vnc/start odgovor - treba i posle, za RFB re-dial na fallback (vncPassword)
let pc = null
let signalingWs = null
let dataChannel = null

function buildWsUrl(id) {
  const token = localStorage.getItem('token')
  const base = window.location.origin.replace(/^http/, 'ws')
  return `${base}/api/protected/vnc-stream/${id}?token=${encodeURIComponent(token)}`
}

function buildSignalingWsUrl(id) {
  const token = localStorage.getItem('token')
  const base = window.location.origin.replace(/^http/, 'ws')
  return `${base}/api/protected/webrtc-signaling/${id}?token=${encodeURIComponent(token)}`
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
    currentSession = session
    sessionId = session.id
    sessionType.value = session.sessionType || 'rfb'

    if (sessionType.value === 'webrtc') {
      startWebrtc(session)
    } else {
      startRfb(session)
    }
  } catch (e) {
    console.error('Neuspešno pokretanje VNC sesije:', e)
    showToast(e.message || 'Greška pri pokretanju sesije', { prefix: '❌ ', duration: 3000 })
    starting.value = false
  }
}

function startRfb(session) {
    rfb = new RFB(screenEl.value, buildWsUrl(session.id), {
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
    // noVNC internally watches its own wrapper div (_screen, NOT screenEl)
    // via a ResizeObserver, and on every fire calls the prototype's
    // _updateScale(), which - since scaleViewport is false - unconditionally
    // resets _display.scale back to 1.0. That ResizeObserver also fires as
    // a side effect of OUR OWN scale changes: shrinking the canvas removes
    // the need for _screen's native overflow:auto scrollbars, and the
    // scrollbar disappearing changes _screen's measured content-box size,
    // which re-triggers the observer -> resets scale to 1.0 -> canvas back
    // at full remote resolution -> scrollbars reappear. That feedback loop
    // (not the scale math itself) is what caused "puno se skrolla" on
    // higher-resolution targets. Overriding _updateScale as a no-op on this
    // instance neutralizes every internal reset path (ResizeObserver AND
    // the direct call from _resize() during the initial handshake), leaving
    // applyManualScale() as the only thing that ever touches _display.scale.
    rfb._updateScale = () => {}

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
    // RFB ClientCutText/ServerCutText - noVNC ovo već parsira i emituje kao
    // "clipboard" event (core/rfb.js), samo nije bilo ožičeno nigde do sada.
    rfb.addEventListener('clipboard', (e) => {
      copyToClipboard(e.detail.text, 'Kopirano sa udaljenog računara')
    })
}

// Namerno BEZ iceServers (nema ni javnog STUN-a) - TURN infrastruktura je
// van dosega ove promene (vidi plan, Faza 4 pominje TURN kao pretpostavku
// koja tek treba da se postavi). Bez toga, ICE gathering daje samo host
// kandidate (isti lokalni segment) - u praksi će ovo raditi samo kad su
// admin i target mašina na istoj mreži dok TURN ne postoji, ne preko NAT-a.
// Ograničenje je namerno ostavljeno vidljivim ovde umesto tiho zaobiđeno.
function startWebrtc(session) {
  pc = new RTCPeerConnection()

  pc.ontrack = (e) => {
    if (videoEl.value) videoEl.value.srcObject = e.streams[0]
  }
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      sendSignaling({
        type: 'ice',
        candidate: e.candidate.candidate,
        sdpMid: e.candidate.sdpMid,
        sdpMLineIndex: e.candidate.sdpMLineIndex,
      })
    }
  }
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') {
      connected.value = true
      starting.value = false
    } else if (pc.connectionState === 'failed') {
      // Prijavi nazad - backend prebacuje sesiju na RFB i šalje "fallback"
      // poruku (webrtcSignaling.js triggerFallback), koju onSignalingMessage
      // ispod hvata i tek TADA stvarno prelazi UI na RFB - ne odmah ovde,
      // da se izbegne trka sa bazom (frontend ne sme sam da pretpostavi da
      // je start_vnc_bridge job već upisan).
      sendSignaling({ type: 'failed' })
    }
    // 'disconnected' se namerno ne tretira kao konačno - isti razlog kao
    // agent-strana (WebRtcSession.cs onconnectionstatechange), često
    // privremeno, ICE ume sam da se oporavi.
  }
  pc.ondatachannel = (e) => {
    dataChannel = e.channel
  }

  signalingWs = new WebSocket(buildSignalingWsUrl(session.id))
  signalingWs.onmessage = onSignalingMessage
  signalingWs.onerror = () => {
    if (starting.value) showToast('Neuspešno povezivanje na signaling kanal', { prefix: '❌ ', duration: 3000 })
  }
}

async function onSignalingMessage(event) {
  let msg
  try {
    msg = JSON.parse(event.data)
  } catch {
    return
  }

  if (msg.type === 'offer') {
    await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp })
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    sendSignaling({ type: 'answer', sdp: answer.sdp })
  } else if (msg.type === 'ice') {
    try {
      await pc.addIceCandidate({
        candidate: msg.candidate, sdpMid: msg.sdpMid, sdpMLineIndex: msg.sdpMLineIndex,
      })
    } catch (e) {
      console.error('Neuspešno dodavanje ICE kandidata:', e)
    }
  } else if (msg.type === 'fallback') {
    teardownWebrtc()
    showToast('Prebačeno na standardni prikaz ekrana (WebRTC nedostupan)', { prefix: '⚠️ ', duration: 4000 })
    sessionType.value = 'rfb'
    starting.value = true
    startRfb(currentSession)
  }
}

function sendSignaling(msg) {
  if (signalingWs?.readyState === WebSocket.OPEN) signalingWs.send(JSON.stringify(msg))
}

function teardownWebrtc() {
  try { pc?.close() } catch { /* već zatvoren */ }
  try { signalingWs?.close() } catch { /* već zatvoren */ }
  pc = null
  dataChannel = null
  signalingWs = null
  connected.value = false
}

// Koordinate normalizovane na [0,1] u odnosu na STVARNI prikazani video
// sadržaj (ne ceo <video> element) - object-fit:contain ume da ostavi
// letterbox trake, isti problem koji applyManualScale rešava za RFB granu,
// samo ovde je matematika unapred (element -> sadržaj) umesto unazad
// (sadržaj -> element).
function videoContentRect() {
  const el = videoEl.value
  if (!el || !el.videoWidth || !el.videoHeight) return null
  const rect = el.getBoundingClientRect()
  const scale = Math.min(rect.width / el.videoWidth, rect.height / el.videoHeight)
  const contentWidth = el.videoWidth * scale
  const contentHeight = el.videoHeight * scale
  return {
    left: rect.left + (rect.width - contentWidth) / 2,
    top: rect.top + (rect.height - contentHeight) / 2,
    width: contentWidth,
    height: contentHeight,
  }
}

function sendInputMessage(msg) {
  if (viewOnly || !dataChannel || dataChannel.readyState !== 'open') return
  dataChannel.send(JSON.stringify(msg))
}

function onVideoPointerMove(e) {
  const r = videoContentRect()
  if (!r) return
  const x = (e.clientX - r.left) / r.width
  const y = (e.clientY - r.top) / r.height
  if (x < 0 || x > 1 || y < 0 || y > 1) return // u letterbox traci, van stvarnog ekrana
  sendInputMessage({ t: 'move', x, y })
}

function onVideoPointerButton(e, down) {
  const button = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left'
  sendInputMessage({ t: 'button', b: button, down })
}

function onVideoWheel(e) {
  sendInputMessage({ t: 'wheel', d: e.deltaY })
}

function onWebrtcKeyDown(e) {
  if (sessionType.value !== 'webrtc' || !connected.value) return
  const mapped = scanCodeFor(e.code)
  if (!mapped) return
  e.preventDefault()
  sendInputMessage({ t: 'key', scan: mapped.scan, down: true, ext: mapped.ext })
}

function onWebrtcKeyUp(e) {
  if (sessionType.value !== 'webrtc' || !connected.value) return
  const mapped = scanCodeFor(e.code)
  if (!mapped) return
  e.preventDefault()
  sendInputMessage({ t: 'key', scan: mapped.scan, down: false, ext: mapped.ext })
}

// clipboardPasteFrom je noVNC-ova ugrađena metoda (core/rfb.js) - šalje
// ClientCutText/extended-clipboard poruku RFB serveru, već postojala u
// biblioteci, samo nije bila pozvana odavde. viewOnly sesije je rfb sam
// odbija (proverava this._viewOnly interno), dugme je ovde svejedno
// sakriveno za tu vrstu sesije radi jasnoće u UI-ju.
async function pasteToRemote() {
  if (!rfb) return
  try {
    const text = await navigator.clipboard.readText()
    rfb.clipboardPasteFrom(text)
    showToast('Nalepljeno na udaljeni računar')
  } catch (e) {
    console.error('Neuspešno čitanje clipboard-a:', e)
    showToast('Nije moguće pročitati clipboard (dozvoli pristup u browseru)', { prefix: '❌ ', duration: 3000 })
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
    teardownWebrtc()
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

// OS-rezervisane kombinacije (Win+R, Win+L, Alt+Tab, Ctrl+Alt+Del...) ne
// može da presretne obična web stranica - to je namerno browser
// ograničenje, ne bag. Fullscreen + Keyboard Lock API je standardan način
// da se to zaobiđe (isti mehanizam koristi npr. Chrome Remote Desktop),
// ali radi pouzdano samo u Chromium browserima (Chrome/Edge), ne u
// Firefox-u - zato je feature-detected, ne pretpostavljeno dostupno.
async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    try {
      await rootEl.value.requestFullscreen()
    } catch (e) {
      console.error('Fullscreen zahtev neuspešan:', e)
      showToast('Puni ekran nije dozvoljen u ovom browseru', { prefix: '❌ ', duration: 3000 })
      return
    }
    if (navigator.keyboard?.lock) {
      try {
        await navigator.keyboard.lock()
      } catch (e) {
        console.warn('Keyboard Lock API nije uspeo (nastavljamo bez njega):', e)
      }
    }
  } else {
    await document.exitFullscreen()
  }
}

function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
  if (!isFullscreen.value) {
    navigator.keyboard?.unlock?.()
  }
  requestAnimationFrame(applyManualScale)
}

onMounted(() => {
  loadAgent()
  start()
  window.addEventListener('resize', handleWindowResize)
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  // Prozor-nivo (ne na <video> elementu) - <video> nije prirodno
  // fokusabilan/ne prima keydown pouzdano bez dodatnog tabindex+focus()
  // upravljanja; filtrirano unutar handlera na sessionType==='webrtc' &&
  // connected, isti obrazac kao noVNC-ova sopstvena globalna keyboard
  // kaptura za RFB granu.
  window.addEventListener('keydown', onWebrtcKeyDown)
  window.addEventListener('keyup', onWebrtcKeyUp)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleWindowResize)
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  window.removeEventListener('keydown', onWebrtcKeyDown)
  window.removeEventListener('keyup', onWebrtcKeyUp)
  navigator.keyboard?.unlock?.()
  rfb?.disconnect()
  teardownWebrtc()
})
</script>
