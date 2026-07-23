<script setup>
import { ref } from 'vue'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { useToast } from '@/composables/useToast.js'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'

const { toast, showToast } = useToast()

const open = ref(false)
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const saving = ref(false)

function openModal() {
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  open.value = true
}

function close() {
  open.value = false
}

async function save() {
  if (!currentPassword.value) {
    showToast('Unesi trenutnu lozinku.', { prefix: '❌ ', duration: 3000 })
    return
  }
  if (newPassword.value.length < 8) {
    showToast('Nova lozinka mora imati bar 8 karaktera.', { prefix: '❌ ', duration: 3000 })
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    showToast('Nova lozinka i potvrda se ne poklapaju.', { prefix: '❌ ', duration: 3000 })
    return
  }

  saving.value = true
  try {
    const res = await fetchWithAuth('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: currentPassword.value,
        newPassword: newPassword.value,
      }),
    })
    if (!res.ok) throw new Error(await parseError(res, `HTTP ${res.status}`))

    close()
    showToast('Lozinka promenjena')
  } catch (e) {
    console.error('Greška pri promeni lozinke:', e)
    showToast(e.message || 'Greška pri promeni lozinke.', { prefix: '❌ ', duration: 3000 })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <span class="contents">
    <ToastNotification :message="toast" />

    <button
      type="button"
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
      title="Promeni lozinku"
      @click="openModal"
    >
      🔑
    </button>

    <teleport to="body">
      <transition name="fade">
        <div
          v-if="open"
          class="fixed inset-0 z-[9997] flex items-center justify-center bg-black/50 p-4"
          @click.self="close"
          role="dialog"
          aria-modal="true"
        >
          <div class="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
            <h2 class="text-lg font-semibold text-slate-800 mb-4">Promena lozinke</h2>

            <div class="space-y-3">
              <div>
                <label class="block text-xs text-slate-500 mb-1">Trenutna lozinka</label>
                <input v-model="currentPassword" type="password" class="app-input w-full text-sm" />
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Nova lozinka</label>
                <input v-model="newPassword" type="password" class="app-input w-full text-sm" placeholder="Minimum 8 karaktera" />
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Potvrdi novu lozinku</label>
                <input v-model="confirmPassword" type="password" class="app-input w-full text-sm" />
              </div>
            </div>

            <div class="flex justify-end gap-2 mt-6">
              <AppButton variant="neutral" @click="close">Otkaži</AppButton>
              <AppButton variant="success" :disabled="saving" @click="save">
                {{ saving ? 'Čuvam…' : 'Sačuvaj' }}
              </AppButton>
            </div>
          </div>
        </div>
      </transition>
    </teleport>
  </span>
</template>
