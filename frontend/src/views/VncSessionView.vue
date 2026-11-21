<template>
  <div ref="rootEl" class="vnc-hud min-h-screen bg-canvas flex flex-col">
    <div class="vnc-toolbar flex items-center justify-between gap-3 px-4 py-2.5 bg-surface border-b border-line">
      <div class="flex items-center gap-2.5 text-ink font-medium truncate">
        <span class="vnc-dot" :class="connected ? 'vnc-dot-good' : 'vnc-dot-idle'" aria-hidden="true"></span>
        <span class="hud-mono">UDALJENA KONTROLA</span>
        <span class="text-ink-muted text-sm truncate font-mono">{{ agent?.hostname || agent?.agentUid || '' }}</span>
      </div>
      <div class="flex items-center gap-3">
        <span v-if="isFullscreen" class="text-xs text-ink-muted hidden sm:inline">
          Drži Esc da izađeš iz punog ekrana
        </span>
        <AppButton variant="neutral" :disabled="!connected" @click="openFilePanel">
          Fajlovi
        </AppButton>
        <AppButton variant="neutral" @click="toggleFullscreen">
          {{ isFullscreen ? 'Izađi iz punog ekrana' : 'Ceo ekran' }}
        </AppButton>
        <AppButton variant="danger" :disabled="stopping" @click="stopAndClose">
          {{ stopping ? 'Zatvaram…' : 'Zatvori sesiju' }}
        </AppButton>
      </div>
    </div>

    <!--
      min-h-0 is deliberate - without it, a flex item with overflow-auto by
      default computes min-height from its content (the flexbox min-height:auto
      rule), instead of from the assigned flex space. That creates a circular
      problem exactly when noVNC measures the size of this container to
      compute the scaleViewport scaling (the container waits for the content, the content waits for the
      container -> measured 0, the canvas stays "at scale 0", i.e. invisible).
      The sci-fi decoration is deliberately ONLY on this container (border/box-shadow,
      doesn't change the box model) and inside the "!connected" overlay (a separate sibling,
      doesn't affect screenEl's measurement) - screenEl itself stays untouched.
    -->
    <div class="relative flex-1 min-h-0 overflow-auto bg-black vnc-frame">
      <div v-if="!connected" class="absolute inset-0 flex flex-col items-center justify-center gap-4 text-sm overflow-hidden">
        <div class="vnc-connect-grid" aria-hidden="true"></div>
        <div class="vnc-radar" aria-hidden="true"></div>
        <span class="relative z-10 hud-mono text-xs" :class="rejected ? 'text-bad' : 'text-accent'">
          {{ overlayText }}<span v-if="!rejected" class="hud-cursor">_</span>
        </span>
        <span v-if="rejected" class="relative z-10 text-ink-muted text-xs max-w-xs text-center px-4">
          {{ rejectedMessage }}
        </span>
      </div>
      <div ref="screenEl" class="w-full h-full"></div>
    </div>

    <ToastNotification :message="toast" />

    <SlideOverPanel :open="filePanelOpen" title="Fajlovi na udaljenom računaru" @close="closeFilePanel">
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-2 flex-wrap">
          <AppButton variant="neutral" :disabled="!currentFilePath && !fileEntries.length" @click="goToDrives">
            Diskovi
          </AppButton>
          <AppButton variant="neutral" :disabled="!filePathStack.length" @click="goBack">
            Nazad
          </AppButton>
          <span class="text-sm text-ink-muted truncate">{{ currentFilePath || 'Diskovi' }}</span>
        </div>

        <label v-if="isAdmin" class="inline-block">
          <span class="sr-only">Otpremi fajl</span>
          <input
            type="file"
            class="text-sm"
            :disabled="uploading || !currentFilePath"
            @change="handleFileUpload"
          />
        </label>
        <p v-if="uploading" class="text-sm text-ink-muted">Otpremam…</p>

        <p v-if="fileError" class="text-sm text-bad">{{ fileError }}</p>
        <p v-else-if="fileLoading" class="text-sm text-ink-muted">Učitavam…</p>
        <p v-else-if="!fileEntries.length" class="text-sm text-ink-muted">Prazno.</p>

        <ul v-else class="divide-y divide-line">
          <li
            v-for="entry in fileEntries"
            :key="entry.name"
            class="flex items-center justify-between gap-3 py-2"
          >
            <button
              v-if="entry.isDirectory"
              type="button"
              class="inline-flex items-center gap-1.5 text-left text-sm text-accent hover:underline truncate"
              @click="openEntry(entry)"
            >
              <NavIcon name="folder" /> {{ entry.name }}
            </button>
            <span v-else class="inline-flex items-center gap-1.5 text-sm text-ink truncate"><NavIcon name="file" /> {{ entry.name }}</span>

            <div class="flex items-center gap-3 shrink-0">
              <span v-if="!entry.isDirectory" class="text-xs text-ink-muted">{{ formatFileSize(entry.size) }}</span>
              <AppButton v-if="!entry.isDirectory" variant="neutral" @click="downloadEntry(entry)">
                Preuzmi
              </AppButton>
            </div>
          </li>
        </ul>
      </div>
    </SlideOverPanel>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import RFB from '@novnc/novnc'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { downloadFromResponse } from '@/utils/download.js'
import { useToast } from '@/composables/useToast.js'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import SlideOverPanel from '@/components/SlideOverPanel.vue'
import NavIcon from '@/components/NavIcon.vue'

const route = useRoute()
const agentId = route.params.id

const { toast, showToast, copyToClipboard } = useToast()
const { isAdmin } = useCurrentUser()

const agent = ref(null)
const connected = ref(false)
const starting = ref(false)
const stopping = ref(false)
// Ban on unsolicited screen capture: until the user at the
// workstation approves, the bridge doesn't come up. awaitingConsent = waiting for the answer;
// rejected = denied/timed out, we stop trying to connect.
const awaitingConsent = ref(false)
const rejected = ref(false)
const rejectedMessage = ref('')

const overlayText = computed(() => {
  if (rejected.value) return 'PRISTUP ODBIJEN'
  if (awaitingConsent.value) return 'ČEKA SE PRISTANAK KORISNIKA'
  if (starting.value) return 'USPOSTAVLJANJE VEZE'
  return 'SIGNAL PREKINUT'
})
const isFullscreen = ref(false)
const screenEl = ref(null)
const rootEl = ref(null)

const filePanelOpen = ref(false)
const fileEntries = ref([])
const currentFilePath = ref('')
const filePathStack = ref([])
const fileLoading = ref(false)
const fileError = ref('')
const uploading = ref(false)

let rfb = null
let sessionId = null
let fileWs = null
let consentPollTimer = null
const uploadResolvers = new Map()

const REJECTION_MESSAGES = {
  denied: 'Korisnik na radnoj stanici je odbio pristup ekranu.',
  timeout: 'Korisnik nije odgovorio na zahtev za pristanak u predviđenom roku.',
  unavailable: 'Na radnoj stanici nema prijavljenog korisnika koji može da odobri pristup.',
}

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
    awaitingConsent.value = true
    // The viewer WS attaches immediately (the relay waits for the agent and records the IT workstation's IP/MAC
    // for the audit), but the agent brings up the bridge only once the user approves. That's why we
    // poll the session status in parallel, to detect a denial/timeout and stop.
    startRfb(session)
    startConsentPolling(session.id)
  } catch (e) {
    console.error('Neuspešno pokretanje VNC sesije:', e)
    showToast(e.message || 'Greška pri pokretanju sesije', { kind: 'error', duration: 3000 })
    starting.value = false
  }
}

function stopConsentPolling() {
  if (consentPollTimer) {
    clearInterval(consentPollTimer)
    consentPollTimer = null
  }
}

function startConsentPolling(id) {
  stopConsentPolling()
  consentPollTimer = setInterval(async () => {
    // Once RFB connects, the session is approved and active - there's nothing left to
    // wait for. 'granted' only means we've stopped waiting for the user's answer.
    if (connected.value) {
      awaitingConsent.value = false
      stopConsentPolling()
      return
    }
    try {
      const res = await fetchWithAuth(`/api/protected/agents/${agentId}/vnc/${id}`)
      if (!res.ok) return
      const s = await res.json()
      if (s.consentStatus && s.consentStatus !== 'pending') awaitingConsent.value = false
      if (s.status === 'rejected') {
        stopConsentPolling()
        rejected.value = true
        starting.value = false
        rejectedMessage.value = REJECTION_MESSAGES[s.consentStatus] || 'Pristup ekranu nije odobren.'
        showToast(rejectedMessage.value, { kind: 'error', duration: 5000 })
        rfb?.disconnect()
      }
    } catch (e) {
      console.error('Provera statusa pristanka neuspešna:', e)
    }
  }, 2000)
}

function startRfb(session) {
    rfb = new RFB(screenEl.value, buildWsUrl(session.id), {
      credentials: { password: session.vncPassword || '' },
    })
    // noVNC's built-in scaleViewport logic in this version/environment
    // kept getting stuck at scale=0 (a canvas with the correct resolution, but
    // invisible) regardless of the container layout - tried both with and without
    // display:none timing and the flexbox min-h-0 fix, nothing helped.
    // Instead, we compute the scaling ourselves via the same Display.scale
    // method noVNC uses internally (the same _rescale() logic, the same
    // effect on mouse coordinate mapping via _display.absX/absY),
    // we just call it OURSELVES, at a moment when we're sure the container has
    // really been measured - see applyManualScale().
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
    // (not the scale math itself) is what caused heavy scrolling on
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
        showToast('Neuspešno povezivanje na ekran', { kind: 'error', duration: 3000 })
      } else if (connected.value && !e.detail?.clean) {
        showToast('VNC konekcija je prekinuta', { kind: 'warning', duration: 3000 })
      }
      cleanup()
    })
    rfb.addEventListener('credentialsrequired', () => {
      rfb.sendCredentials({ password: '' })
    })
    // RFB ClientCutText/ServerCutText - noVNC already parses this and emits it as a
    // "clipboard" event (core/rfb.js), it just wasn't wired up anywhere until now.
    rfb.addEventListener('clipboard', (e) => {
      copyToClipboard(e.detail.text, 'Kopirano sa udaljenog računara')
    })
}

// clipboardPasteFrom is noVNC's built-in method (core/rfb.js) - it sends a
// ClientCutText/extended-clipboard message to the RFB server, it only UPDATES the
// clipboard buffer on the remote machine, it doesn't perform the paste itself in any
// application there - hence sendPasteKeystroke() right after, the same two steps
// the user would do by hand (copy locally, then Ctrl+V on the remote side).
async function pasteToRemote() {
  if (!rfb) return
  try {
    const text = await navigator.clipboard.readText()
    rfb.clipboardPasteFrom(text)
    sendPasteKeystroke()
  } catch (e) {
    console.error('Neuspešno čitanje clipboard-a:', e)
    showToast('Nije moguće pročitati clipboard (dozvoli pristup u browseru)', { kind: 'error', duration: 3000 })
  }
}

// XK_v=0x0076 (core/input/keysym.js) - not imported directly because
// the @novnc/novnc package, via the "exports" field in package.json, exposes ONLY
// core/rfb.js, deeper paths can't be imported through Vite. sendKey()
// is the same public method RFB.sendCtrlAltDel() uses internally. We DELIBERATELY
// don't also send a synthetic Control down/up here - the physical Ctrl/Cmd key
// the user already pressed (to reach handleGlobalKeydown at all)
// is forwarded normally to the remote machine via noVNC's own
// keyboard handler (we intercept/stop ONLY the 'v' keydown, not the
// modifier), so sending just V down+up is enough for a complete Ctrl+V
// combination to be assembled on the remote side.
function sendPasteKeystroke() {
  if (!rfb) return
  rfb.sendKey(0x0076, 'KeyV', true)
  rfb.sendKey(0x0076, 'KeyV', false)
}

// Intercepts Ctrl+V/Cmd+V BEFORE noVNC's own keydown handler
// (attached directly to screenEl.value - see core/input/keyboard.js) gets
// to see it - hence capture:true on document (an ancestor's capture phase
// runs BEFORE the event even reaches the target element), not on
// screenEl.value itself (a listener on the SAME element as noVNC's would
// run only in registration order, not guaranteed first). event.repeat
// is ignored so holding the key doesn't trigger paste in a loop on OS key repeat.
function handleGlobalKeydown(event) {
  if (!connected.value || event.repeat) return
  const isPasteShortcut = (event.ctrlKey || event.metaKey) && !event.altKey && event.key?.toLowerCase() === 'v'
  if (!isPasteShortcut) return

  event.preventDefault()
  event.stopPropagation()
  pasteToRemote()
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
  awaitingConsent.value = false
  stopConsentPolling()
  rfb = null
  sessionId = null
  filePanelOpen.value = false
  fileWs?.close()
  fileWs = null
}

// Manual "fit to window" scaling - see the note on rfb.scaleViewport
// above. rfb._display is the same (just unofficially exposed, single underscore)
// Display object whose public scale setter noVNC itself uses internally
// (core/display.js - set scale(scale) { this._rescale(scale); }); here we
// call it directly with a factor WE compute from the actual, already
// measured size of the container and canvas, thereby bypassing the autoscale()
// calculation that kept getting stuck at 0.
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

// A WS channel separate from RFB (see backend/ws/fileTransferRelay.js) - RFB
// ClientCutText/ServerCutText has no concept of a file, hence an entirely separate
// mechanism. The connection is created lazily, only when the user first opens the
// panel, and kept open for as long as the VNC session lasts (closing/opening the
// panel only hides/shows the UI, it doesn't touch the connection) - on purpose, so that
// opening the panel several times doesn't create a new WS connection each time.
function buildFileWsUrl(id) {
  const token = localStorage.getItem('token')
  const base = window.location.origin.replace(/^http/, 'ws')
  return `${base}/api/protected/file-transfer/${id}?token=${encodeURIComponent(token)}`
}

function ensureFileWs() {
  if (fileWs && fileWs.readyState !== WebSocket.CLOSED && fileWs.readyState !== WebSocket.CLOSING) {
    return fileWs
  }

  fileWs = new WebSocket(buildFileWsUrl(sessionId))
  fileWs.addEventListener('open', () => listPath(currentFilePath.value))
  fileWs.addEventListener('message', handleFileWsMessage)
  fileWs.addEventListener('error', () => {
    fileError.value = 'Greška u konekciji za fajlove'
    fileLoading.value = false
  })
  fileWs.addEventListener('close', () => {
    fileWs = null
  })
  return fileWs
}

function handleFileWsMessage(event) {
  let msg
  try {
    msg = JSON.parse(event.data)
  } catch {
    return
  }

  if (msg.type === 'list_result') {
    fileLoading.value = false
    if (msg.error) {
      fileError.value = msg.error
      return
    }
    fileError.value = ''
    currentFilePath.value = msg.path || ''
    fileEntries.value = msg.entries || []
  } else if (msg.type === 'upload_result') {
    const resolver = uploadResolvers.get(msg.requestId)
    if (!resolver) return
    uploadResolvers.delete(msg.requestId)
    if (msg.success) resolver.resolve()
    else resolver.reject(new Error(msg.error || 'Otpremanje neuspešno'))
  }
}

function listPath(path) {
  fileLoading.value = true
  fileError.value = ''
  ensureFileWs().send(JSON.stringify({ type: 'list', path: path || '' }))
}

function openFilePanel() {
  filePanelOpen.value = true
  if (fileWs?.readyState === WebSocket.OPEN) {
    listPath(currentFilePath.value)
  } else {
    fileLoading.value = true
    ensureFileWs()
  }
}

function closeFilePanel() {
  filePanelOpen.value = false
}

// The root ("Diskovi" / drives) returns DriveInfo entries with the full name (e.g. "C:\\") -
// hence the join only for non-root levels, where the agent sends the bare file/folder name
// (DirectoryInfo/FileInfo.Name), not the full path - see HandleList in
// FileTransferBridge.cs.
function joinFilePath(base, name) {
  if (!base) return name
  return base.endsWith('\\') ? base + name : base + '\\' + name
}

function openEntry(entry) {
  if (!entry.isDirectory) return
  filePathStack.value.push(currentFilePath.value)
  listPath(joinFilePath(currentFilePath.value, entry.name))
}

function goBack() {
  const prev = filePathStack.value.pop()
  listPath(prev ?? '')
}

function goToDrives() {
  filePathStack.value = []
  listPath('')
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value.toFixed(1)} ${units[i]}`
}

async function downloadEntry(entry) {
  if (entry.isDirectory) return
  const fullPath = joinFilePath(currentFilePath.value, entry.name)
  try {
    await downloadFromResponse(
      await fetchWithAuth(
        `/api/protected/agents/${agentId}/file-transfer/${sessionId}/download?path=${encodeURIComponent(fullPath)}`,
      ),
      entry.name,
    )
  } catch (e) {
    console.error('Preuzimanje fajla neuspešno:', e)
    showToast('Preuzimanje fajla neuspešno', { kind: 'error', duration: 3000 })
  }
}

// 64KB - the same chunk size as FileTransferBridge.cs's ChunkSize on the agent
// side (there's no functional reason for them to match, just a consistent
// convention). "upload_end" is an informational confirmation for the agent (see the
// comment in FileTransferBridge.cs) - the actual finalization happens there
// as soon as the received bytes reach the announced size.
const UPLOAD_CHUNK_SIZE = 65536

async function handleFileUpload(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  const ws = ensureFileWs()
  if (ws.readyState !== WebSocket.OPEN) {
    showToast('Konekcija za fajlove nije spremna, pokušaj ponovo', { kind: 'error', duration: 3000 })
    return
  }

  const fullPath = joinFilePath(currentFilePath.value, file.name)
  const requestId = crypto.randomUUID()

  uploading.value = true
  try {
    const resultPromise = new Promise((resolve, reject) => {
      uploadResolvers.set(requestId, { resolve, reject })
    })

    ws.send(JSON.stringify({
      type: 'upload_start',
      requestId,
      path: fullPath,
      fileName: file.name,
      size: file.size,
    }))

    for (let offset = 0; offset < file.size; offset += UPLOAD_CHUNK_SIZE) {
      const chunk = await file.slice(offset, offset + UPLOAD_CHUNK_SIZE).arrayBuffer()
      ws.send(chunk)
    }
    ws.send(JSON.stringify({ type: 'upload_end', requestId }))

    await resultPromise
    showToast('Fajl otpremljen', { duration: 2000 })
    listPath(currentFilePath.value)
  } catch (e) {
    console.error('Otpremanje fajla neuspešno:', e)
    showToast(e.message || 'Otpremanje fajla neuspešno', { kind: 'error', duration: 3000 })
  } finally {
    uploading.value = false
  }
}

// OS-reserved combinations (Win+R, Win+L, Alt+Tab, Ctrl+Alt+Del...) can't
// be intercepted by an ordinary web page - that's a deliberate browser
// limitation, not a bug. Fullscreen + the Keyboard Lock API is the standard way
// to get around it (the same mechanism is used by e.g. Chrome Remote Desktop),
// but it only works reliably in Chromium browsers (Chrome/Edge), not in
// Firefox - which is why it's feature-detected, not assumed to be available.
async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    try {
      await rootEl.value.requestFullscreen()
    } catch (e) {
      console.error('Fullscreen zahtev neuspešan:', e)
      showToast('Puni ekran nije dozvoljen u ovom browseru', { kind: 'error', duration: 3000 })
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
  document.addEventListener('keydown', handleGlobalKeydown, { capture: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleWindowResize)
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  document.removeEventListener('keydown', handleGlobalKeydown, { capture: true })
  navigator.keyboard?.unlock?.()
  stopConsentPolling()
  rfb?.disconnect()
  fileWs?.close()
})
</script>

<style scoped>
/* Sci-fi HUD skin, the same trick as AgentDetailView.vue - redefines the app's
   token CSS variables only on this root, so the whole child tree
   (StatusPill, AppButton, SlideOverPanel, .app-input...) is automatically
   re-textured via the ordinary CSS cascade. A fixed dark palette regardless of the
   app's light/dark toggle (same reason as there - here too there's no concept of
   "a sci-fi HUD on a white background").
   IMPORTANT: all the decoration below is limited to .vnc-toolbar and to the content of
   the ".vnc-frame ::before" / "!connected" overlay - NEVER to screenEl itself
   or to its parent's box model (border/box-shadow don't change the layout, the
   overlay is a separate absolute sibling) - noVNC's container measurement
   (see the comment in the template) stays untouched. */
.vnc-hud {
  --surface-canvas: #050b0d;
  --surface-card: #0a1619;
  --surface-sunken: #0e1f22;
  --line-default: #164047;
  --line-strong: #1f5c63;

  --ink-primary: #d7fff8;
  --ink-secondary: #86e6d9;
  --ink-muted: #4f7d79;

  --accent-default: #00e6c8;
  --accent-emphasis: #7dfff0;
  --accent-subtle: #0b2e2b;

  --status-good: #39ff88;
  --status-good-subtle: #0b2a1b;
  --status-bad: #ff3d68;
  --status-bad-subtle: #2a0b15;
  --status-warn: #ffd23f;
  --status-warn-subtle: #2e2408;
  --status-info: #4fc3ff;
  --status-info-subtle: #0b2030;

  color: var(--ink-primary);
}

.vnc-toolbar {
  box-shadow: 0 1px 0 0 rgba(0, 230, 200, 0.15), 0 4px 24px -8px rgba(0, 230, 200, 0.2);
}

.hud-mono {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.hud-cursor {
  animation: vnc-blink 1s step-end infinite;
}

@keyframes vnc-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}

.vnc-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex: none;
}

.vnc-dot-good {
  background: var(--status-good);
  box-shadow: 0 0 8px 1px var(--status-good);
  animation: vnc-pulse 1.6s ease-in-out infinite;
}

.vnc-dot-idle {
  background: var(--status-warn);
  box-shadow: 0 0 8px 1px var(--status-warn);
  animation: vnc-pulse 1.1s ease-in-out infinite;
}

@keyframes vnc-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.75); }
}

/* A corner "viewport frame" around the video container - border/box-shadow on
   the container itself + a pseudo-element for the bracket corners, pointer-events:none
   so it never blocks a click on the remote screen beneath. */
.vnc-frame {
  box-shadow:
    inset 0 0 0 1px rgba(0, 230, 200, 0.18),
    0 0 40px rgba(0, 230, 200, 0.08);
}

.vnc-frame::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5;
  background-image:
    linear-gradient(var(--accent-default), var(--accent-default)),
    linear-gradient(var(--accent-default), var(--accent-default)),
    linear-gradient(var(--accent-default), var(--accent-default)),
    linear-gradient(var(--accent-default), var(--accent-default)),
    linear-gradient(var(--accent-default), var(--accent-default)),
    linear-gradient(var(--accent-default), var(--accent-default)),
    linear-gradient(var(--accent-default), var(--accent-default)),
    linear-gradient(var(--accent-default), var(--accent-default));
  background-repeat: no-repeat;
  background-size:
    22px 3px, 3px 22px,
    22px 3px, 3px 22px,
    22px 3px, 3px 22px,
    22px 3px, 3px 22px;
  background-position:
    top 6px left 6px, top 6px left 6px,
    top 6px right 6px, top 6px right 6px,
    bottom 6px right 6px, bottom 6px right 6px,
    bottom 6px left 6px, bottom 6px left 6px;
  opacity: 0.8;
}

.vnc-connect-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(0, 230, 200, 0.07) 1px, transparent 1px),
    linear-gradient(to right, rgba(0, 230, 200, 0.07) 1px, transparent 1px);
  background-size: 32px 32px;
}

.vnc-radar {
  position: relative;
  z-index: 1;
  width: 96px;
  height: 96px;
  border-radius: 999px;
  border: 1px solid rgba(0, 230, 200, 0.35);
}

.vnc-radar::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: conic-gradient(from 0deg, rgba(0, 230, 200, 0.6), transparent 70%);
  animation: vnc-radar-spin 1.6s linear infinite;
}

.vnc-radar::after {
  content: '';
  position: absolute;
  inset: 26px;
  border-radius: 999px;
  background: #000;
}

@keyframes vnc-radar-spin {
  to { transform: rotate(360deg); }
}
</style>
