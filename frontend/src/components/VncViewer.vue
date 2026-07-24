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
      Otvara se bez obaveštenja korisniku za tim računarom. Klik/kucanje u
      okviru slike ispod se prenosi na udaljenu mašinu.
    </p>

    <div v-if="connected" class="space-y-1">
      <img
        ref="frameEl"
        :src="frameUrl"
        tabindex="0"
        class="w-full rounded-lg border-2 outline-none cursor-none select-none"
        :class="focused ? 'border-blue-500' : 'border-slate-200'"
        @mousemove="onMouseMove"
        @mousedown="onMouseDown"
        @mouseup="onMouseUp"
        @contextmenu.prevent
        @wheel.prevent="onWheel"
        @keydown.prevent="onKeyDown"
        @keyup.prevent="onKeyUp"
        @focus="focused = true"
        @blur="focused = false"
      />
      <p class="text-xs text-slate-500">
        {{ focused ? 'Fokusirano — tastatura ide ka udaljenoj mašini.' : 'Klikni na sliku da fokusiraš tastaturu.' }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { useToast } from '@/composables/useToast.js'
import { toVirtualKeyCode } from '@/constants/vkCodes.js'
import AppButton from '@/components/AppButton.vue'

const props = defineProps({
  agentId: { type: [String, Number], required: true },
})

const { showToast } = useToast()

const connected = ref(false)
const focused = ref(false)
const starting = ref(false)
const stopping = ref(false)
const frameUrl = ref('')
const frameEl = ref(null)

let ws = null
let sessionId = null
let currentFrameObjectUrl = null
let lastMouseMoveSent = 0
const MOUSE_MOVE_THROTTLE_MS = 40 // ~25 events/sec

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

    ws = new WebSocket(buildWsUrl(sessionId))
    ws.binaryType = 'blob'

    ws.onopen = () => {
      connected.value = true
      starting.value = false
    }
    ws.onmessage = (event) => {
      if (currentFrameObjectUrl) URL.revokeObjectURL(currentFrameObjectUrl)
      currentFrameObjectUrl = URL.createObjectURL(event.data)
      frameUrl.value = currentFrameObjectUrl
    }
    ws.onclose = () => {
      cleanup()
    }
    ws.onerror = () => {
      showToast('Greška u VNC konekciji', { prefix: '❌ ', duration: 3000 })
    }
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
    ws?.close()
    stopping.value = false
  }
}

function cleanup() {
  connected.value = false
  focused.value = false
  if (currentFrameObjectUrl) {
    URL.revokeObjectURL(currentFrameObjectUrl)
    currentFrameObjectUrl = null
  }
  frameUrl.value = ''
  ws = null
  sessionId = null
}

function sendInput(payload) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload))
}

function fractionalCoords(event) {
  const rect = frameEl.value.getBoundingClientRect()
  return {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height,
  }
}

function onMouseMove(event) {
  const now = Date.now()
  if (now - lastMouseMoveSent < MOUSE_MOVE_THROTTLE_MS) return
  lastMouseMoveSent = now

  const { x, y } = fractionalCoords(event)
  sendInput({ type: 'mousemove', x, y })
}

function buttonName(event) {
  if (event.button === 2) return 'right'
  if (event.button === 1) return 'middle'
  return 'left'
}

function onMouseDown(event) {
  sendInput({ type: 'mousedown', button: buttonName(event) })
}

function onMouseUp(event) {
  sendInput({ type: 'mouseup', button: buttonName(event) })
}

function onWheel(event) {
  sendInput({ type: 'wheel', delta: -event.deltaY })
}

function onKeyDown(event) {
  const vk = toVirtualKeyCode(event.code)
  if (vk) sendInput({ type: 'keydown', vk })
}

function onKeyUp(event) {
  const vk = toVirtualKeyCode(event.code)
  if (vk) sendInput({ type: 'keyup', vk })
}

onBeforeUnmount(() => {
  ws?.close()
  if (currentFrameObjectUrl) URL.revokeObjectURL(currentFrameObjectUrl)
})
</script>
