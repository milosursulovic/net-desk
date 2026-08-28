<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { usePushNotifications } from '@/composables/usePushNotifications.js'
import { useCurrentUser, resetCurrentUser } from '@/composables/useCurrentUser.js'
import NavIcon from '@/components/NavIcon.vue'
import ChangePasswordButton from '@/components/ChangePasswordButton.vue'

const router = useRouter()
const { currentUser } = useCurrentUser()
const { isSupported, isSubscribed, loading, error, checkSubscription, subscribe, unsubscribe } =
  usePushNotifications()

const open = ref(false)
const triggerEl = ref(null)
const menuEl = ref(null)
const pwRef = ref(null)
const menuStyle = ref({})

const userInitial = computed(() => {
  const name = currentUser.value?.username || ''
  return name ? name.charAt(0).toUpperCase() : '?'
})

async function toggleNotifications() {
  if (isSubscribed.value) {
    await unsubscribe()
  } else {
    await subscribe()
  }
  if (error.value) console.error(error.value)
}

function openPasswordModal() {
  open.value = false
  pwRef.value?.open()
}

function logout() {
  open.value = false
  localStorage.removeItem('token')
  resetCurrentUser()
  router.push('/login')
}

// Meni se teleportuje na <body> i pozicionira preko getBoundingClientRect()
// jer je trigger unutar header-a koji ima overflow-x-auto (za horizontalni
// skrol na uskim ekranima) - overflow-x na bilo šta osim "visible" primorava
// browser da isto tako seče i overflow-y, pa bi apsolutno pozicioniran meni
// UNUTAR tog header-a bio odsečen. Teleport van header-a taj problem
// zaobilazi u potpunosti, nezavisno od header-ovog overflow ponašanja.
async function updatePosition() {
  await nextTick()
  const rect = triggerEl.value?.getBoundingClientRect()
  if (!rect) return
  menuStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 6}px`,
    right: `${window.innerWidth - rect.right}px`,
  }
}

async function toggleOpen() {
  open.value = !open.value
  if (open.value) await updatePosition()
}

function onClickOutside(e) {
  if (!open.value) return
  if (triggerEl.value?.contains(e.target)) return
  if (menuEl.value?.contains(e.target)) return
  open.value = false
}

// Zatvori na skrol (bilo koje scrollable ancestor-a, capture:true hvata sve)
// umesto da prati poziciju - jednostavnije i dovoljno dobro za kratkotrajno
// otvoren meni.
function onScroll() {
  if (open.value) open.value = false
}

onMounted(() => {
  document.addEventListener('click', onClickOutside)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', onScroll)
  checkSubscription()
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', onScroll)
})
</script>

<template>
  <div class="relative">
    <button
      ref="triggerEl"
      type="button"
      class="flex items-center gap-2 rounded-full bg-surface-sunken py-1 pr-3 pl-1 hover:bg-line"
      :aria-expanded="open"
      @click="toggleOpen"
    >
      <div class="flex h-7 w-7 items-center justify-center rounded-full bg-accent-subtle text-xs font-semibold text-accent">
        {{ userInitial }}
      </div>
      <span class="hidden text-sm font-medium text-ink sm:inline">{{ currentUser?.username || 'Nepoznat' }}</span>
      <NavIcon name="chevron-down" class="hidden text-ink-muted sm:block" />
    </button>

    <teleport to="body">
      <div
        v-if="open"
        ref="menuEl"
        :style="menuStyle"
        class="z-9998 w-64 rounded-lg border border-line bg-surface p-1.5 shadow-lg"
      >
        <button
          v-if="isSupported"
          type="button"
          :disabled="loading"
          class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink hover:bg-surface-sunken disabled:opacity-50"
          @click="toggleNotifications"
        >
          <NavIcon :name="isSubscribed ? 'bell' : 'bell-off'" class="text-ink-muted" />
          <span class="flex-1 text-left">Notifikacije</span>
          <span class="text-xs text-ink-muted">{{ isSubscribed ? 'Uključene' : 'Isključene' }}</span>
        </button>

        <button
          type="button"
          class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink hover:bg-surface-sunken"
          @click="openPasswordModal"
        >
          <NavIcon name="key" class="text-ink-muted" />
          <span class="flex-1 text-left">Promeni lozinku</span>
        </button>

        <div class="my-1.5 border-t border-line"></div>

        <button
          type="button"
          class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-bad hover:bg-bad-subtle"
          @click="logout"
        >
          <NavIcon name="log-out" />
          <span class="flex-1 text-left">Odjavi se</span>
        </button>
      </div>
    </teleport>

    <ChangePasswordButton ref="pwRef" hide-trigger />
  </div>
</template>
