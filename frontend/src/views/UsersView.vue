<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">{{ t('routes.users') }}</h1>
      <AppButton variant="success" @click="openAddModal">{{ t('users.addUser') }}</AppButton>
    </div>

    <div v-if="loading" class="text-ink-secondary">{{ t('common.loading') }}</div>
    <div v-else-if="error" class="text-bad">{{ error }}</div>

    <div v-else class="table-shell overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead class="table-head-row">
          <tr>
            <th class="px-4 py-3 text-left">{{ t('users.username') }}</th>
            <th class="px-4 py-3 text-left">{{ t('users.role') }}</th>
            <th class="px-4 py-3 text-left">{{ t('users.created') }}</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id" class="border-b border-line last:border-0 hover:bg-surface-sunken">
            <td class="px-4 py-3 font-medium text-ink">{{ u.username }}</td>
            <td class="px-4 py-3">
              <select
                class="app-input w-auto py-1.5 text-sm"
                :value="u.role"
                @change="changeRole(u, $event.target.value)"
              >
                <option value="admin">admin</option>
                <option value="operator">operator</option>
                <option value="viewer">viewer</option>
              </select>
            </td>
            <td class="px-4 py-3 font-mono text-ink-muted">{{ fmtDate(u.createdAt) }}</td>
            <td class="px-4 py-3 text-right">
              <button
                v-if="u.id !== currentUser?.userId"
                class="text-bad hover:underline"
                @click="confirmDelete(u)"
              >
                {{ t('common.delete') }}
              </button>
            </td>
          </tr>
          <tr v-if="!users.length">
            <td colspan="4" class="px-4 py-8 text-center text-ink-muted">{{ t('users.noUsers') }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <ToastNotification :message="toast" />

    <ConfirmDialog
      :open="confirmState.open"
      :title="confirmState.title"
      :message="confirmState.message"
      @confirm="resolveConfirm(true)"
      @cancel="resolveConfirm(false)"
    />

    <SlideOverPanel :open="showForm" :title="t('users.addUser')" @close="closeForm">
      <div class="space-y-4">
        <div>
          <label class="block text-xs text-ink-muted mb-1">{{ t('users.username') }}</label>
          <input v-model.trim="form.username" class="app-input w-full text-sm" placeholder="npr. pera" />
        </div>
        <div>
          <label class="block text-xs text-ink-muted mb-1">{{ t('login.password') }}</label>
          <input v-model="form.password" type="password" class="app-input w-full text-sm" :placeholder="t('users.passwordPlaceholder')" />
        </div>
        <div>
          <label class="block text-xs text-ink-muted mb-1">{{ t('users.role') }}</label>
          <select v-model="form.role" class="app-input w-full text-sm">
            <option value="viewer">{{ t('users.roleViewer') }}</option>
            <option value="operator">{{ t('users.roleOperator') }}</option>
            <option value="admin">{{ t('users.roleAdmin') }}</option>
          </select>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-line">
          <AppButton type="button" variant="neutral" @click="closeForm">{{ t('inventory.discard') }}</AppButton>
          <AppButton type="button" variant="success" @click="createUser">{{ t('common.save') }}</AppButton>
        </div>
      </div>
    </SlideOverPanel>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { fmtDateOnly } from '@/utils/format.js'
import { useToast } from '@/composables/useToast.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import SlideOverPanel from '@/components/SlideOverPanel.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AppButton from '@/components/AppButton.vue'

const { t } = useI18n()
const { toast, showToast } = useToast()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()
const { currentUser } = useCurrentUser()

const fmtDate = fmtDateOnly

const users = ref([])
const loading = ref(false)
const error = ref('')

async function fetchData() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetchWithAuth('/api/protected/users')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    users.value = await res.json()
  } catch (e) {
    console.error('Neuspešno učitavanje korisnika:', e)
    error.value = t('users.errorLoad')
  } finally {
    loading.value = false
  }
}

const showForm = ref(false)
const form = ref({ username: '', password: '', role: 'viewer' })

function openAddModal() {
  form.value = { username: '', password: '', role: 'viewer' }
  showForm.value = true
}

function closeForm() {
  showForm.value = false
}

async function createUser() {
  if (!form.value.username || form.value.username.length < 3) {
    showToast(t('users.errorUsernameLength'), { kind: 'error', duration: 3000 })
    return
  }
  if (!form.value.password || form.value.password.length < 8) {
    showToast(t('users.errorPasswordLength'), { kind: 'error', duration: 3000 })
    return
  }

  try {
    const res = await fetchWithAuth('/api/protected/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form.value),
    })
    if (!res.ok) throw new Error(await parseError(res, `HTTP ${res.status}`))

    showForm.value = false
    showToast(t('users.created'))
    await fetchData()
  } catch (e) {
    console.error('Greška pri kreiranju korisnika:', e)
    showToast(e.message || t('users.errorCreate'), { kind: 'error', duration: 3000 })
  }
}

async function changeRole(user, role) {
  if (role === user.role) return
  try {
    const res = await fetchWithAuth(`/api/protected/users/${user.id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    if (!res.ok) throw new Error(await parseError(res, `HTTP ${res.status}`))
    showToast(t('users.roleChanged'))
    await fetchData()
  } catch (e) {
    console.error('Greška pri izmeni role:', e)
    showToast(e.message || t('users.errorRoleChange'), { kind: 'error', duration: 3000 })
    await fetchData()
  }
}

async function confirmDelete(user) {
  const ok = await askConfirm(t('users.confirmDeleteMessage', { name: user.username }), {
    title: t('users.confirmDeleteTitle'),
  })
  if (!ok) return

  try {
    const res = await fetchWithAuth(`/api/protected/users/${user.id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await parseError(res, `HTTP ${res.status}`))
    await fetchData()
  } catch (e) {
    console.error('Greška pri brisanju korisnika:', e)
    showToast(e.message || t('users.errorDelete'), { kind: 'error', duration: 3000 })
  }
}

onMounted(fetchData)
</script>
