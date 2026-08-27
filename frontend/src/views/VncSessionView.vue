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
      </div>
      <div class="flex items-center gap-3">
        <span v-if="isFullscreen" class="text-xs text-slate-500 hidden sm:inline">
          Drži Esc da izađeš iz punog ekrana
        </span>
        <AppButton v-if="!viewOnly" variant="neutral" :disabled="!connected" @click="openFilePanel">
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
import { ref, onMounted, onBeforeUnmount } from 'vue'
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
const viewOnly = route.query.viewOnly === '1'

const { toast, showToast, copyToClipboard } = useToast()
const { isAdmin } = useCurrentUser()

const agent = ref(null)
const connected = ref(false)
const starting = ref(false)
const stopping = ref(false)
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
const uploadResolvers = new Map()

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
    startRfb(session)
  } catch (e) {
    console.error('Neuspešno pokretanje VNC sesije:', e)
    showToast(e.message || 'Greška pri pokretanju sesije', { kind: 'error', duration: 3000 })
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
        showToast('Neuspešno povezivanje na ekran', { kind: 'error', duration: 3000 })
      } else if (connected.value && !e.detail?.clean) {
        showToast('VNC konekcija je prekinuta', { kind: 'warning', duration: 3000 })
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

// clipboardPasteFrom je noVNC-ova ugrađena metoda (core/rfb.js) - šalje
// ClientCutText/extended-clipboard poruku RFB serveru, samo AŽURIRA
// clipboard bafer na udaljenoj mašini, ne izvršava sam paste ni u jednoj
// aplikaciji tamo - otud sendPasteKeystroke() odmah posle, ista dva koraka
// koja bi korisnik ručno uradio (kopiraj lokalno, pa Ctrl+V na udaljenom).
// viewOnly sesije rfb sam odbija (proverava this._viewOnly interno),
// handleGlobalKeydown ispod svejedno ne poziva ovo za tu vrstu sesije.
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

// XK_v=0x0076 (core/input/keysym.js) - ne uvozi se direktno jer
// @novnc/novnc paket preko "exports" polja u package.json izlaže SAMO
// core/rfb.js, dublje putanje se ne mogu import-ovati kroz Vite. sendKey()
// je ista javna metoda koju RFB.sendCtrlAltDel() interno koristi. NAMERNO
// se ovde ne šalje i sintetički Control down/up - fizički Ctrl/Cmd taster
// koji je korisnik već pritisnuo (da bi uopšte stigao do handleGlobalKeydown)
// se normalno prosleđuje udaljenoj mašini preko noVNC-ovog sopstvenog
// keyboard handler-a (presrećemo/zaustavljamo SAMO 'v' keydown, ne i
// modifikator), pa je slanje samo V down+up dovoljno da se na udaljenoj
// strani sastavi kompletna Ctrl+V kombinacija.
function sendPasteKeystroke() {
  if (!rfb) return
  rfb.sendKey(0x0076, 'KeyV', true)
  rfb.sendKey(0x0076, 'KeyV', false)
}

// Presreće Ctrl+V/Cmd+V PRE nego što noVNC-ov sopstveni keydown handler
// (zakačen direktno na screenEl.value - vidi core/input/keyboard.js) stigne
// da ga vidi - otud capture:true na document-u (ancestor capture-fazu
// izvršava PRE nego što event uopšte stigne do target elementa), ne na
// screenEl.value samom (listener na ISTOM elementu kao noVNC-ov bi se
// izvršio samo po redosledu registracije, ne garantovano prvi). event.repeat
// se ignoriše da držanje tastera ne pokrene paste u petlji na OS repeat-u.
function handleGlobalKeydown(event) {
  if (viewOnly || !connected.value || event.repeat) return
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
  rfb = null
  sessionId = null
  filePanelOpen.value = false
  fileWs?.close()
  fileWs = null
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

// Poseban WS kanal od RFB-a (vidi backend/ws/fileTransferRelay.js) - RFB
// ClientCutText/ServerCutText nema koncept fajla, otud sasvim odvojen
// mehanizam. Konekcija se pravi lenjo, tek kad korisnik prvi put otvori
// panel, i drži se otvorena dok traje VNC sesija (zatvaranje/otvaranje
// panela samo sakriva/prikazuje UI, ne dira konekciju) - namerno, da
// otvaranje panela više puta ne pravi novu WS konekciju svaki put.
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

// Root ("Diskovi") vraća DriveInfo unose sa punim imenom (npr. "C:\\") -
// otud join samo za ne-root nivoe, gde agent šalje goli naziv fajla/foldera
// (DirectoryInfo/FileInfo.Name), ne punu putanju - videti HandleList u
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

// 64KB - isti chunk size kao FileTransferBridge.cs's ChunkSize na agent
// strani (nema funkcionalnog razloga da se poklapaju, samo dosledna
// konvencija). "upload_end" je informativna potvrda za agenta (vidi
// komentar u FileTransferBridge.cs) - stvarna finalizacija se dešava tamo
// čim primljeni bajtovi dostignu najavljenu veličinu.
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
  rfb?.disconnect()
  fileWs?.close()
})
</script>
