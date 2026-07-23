<template>
  <div class="glass-container">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <h1 class="text-2xl font-bold text-slate-800">Korisnici</h1>
      <AppButton variant="success" @click="openAddModal">Dodaj korisnika</AppButton>
    </div>

    <div v-if="loading" class="text-slate-600">Učitavanje…</div>
    <div v-else-if="error" class="text-red-600">{{ error }}</div>

    <div v-else class="overflow-x-auto rounded-xl border bg-white shadow-sm">
      <table class="min-w-full text-sm">
        <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th class="px-4 py-3">Korisničko ime</th>
            <th class="px-4 py-3">Rola</th>
            <th class="px-4 py-3">Kreiran</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr v-for="u in users" :key="u.id">
            <td class="px-4 py-3 font-medium">{{ u.username }}</td>
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
            <td class="px-4 py-3 text-slate-500">{{ fmtDate(u.createdAt) }}</td>
            <td class="px-4 py-3 text-right">
              <button
                v-if="u.id !== currentUser?.userId"
                class="text-red-600 hover:underline"
                @click="confirmDelete(u)"
              >
                Obriši
              </button>
            </td>
          </tr>
          <tr v-if="!users.length">
            <td colspan="4" class="px-4 py-8 text-center text-slate-500">Nema korisnika.</td>
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

    <SlideOverPanel :open="showForm" title="Dodaj korisnika" @close="closeForm">
      <div class="space-y-4">
        <div>
          <label class="block text-xs text-slate-500 mb-1">Korisničko ime</label>
          <input v-model.trim="form.username" class="app-input w-full text-sm" placeholder="npr. pera" />
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">Lozinka</label>
          <input v-model="form.password" type="password" class="app-input w-full text-sm" placeholder="Minimum 8 karaktera" />
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">Rola</label>
          <select v-model="form.role" class="app-input w-full text-sm">
            <option value="viewer">viewer — samo čitanje</option>
            <option value="operator">operator — akcije nad agentima/IP-jevima</option>
            <option value="admin">admin — pun pristup</option>
          </select>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t">
          <AppButton type="button" variant="neutral" @click="closeForm">Odustani</AppButton>
          <AppButton type="button" variant="success" @click="createUser">Sačuvaj</AppButton>
        </div>
      </div>
    </SlideOverPanel>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
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
    error.value = 'Neuspešno učitavanje korisnika.'
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
    showToast('Korisničko ime mora imati bar 3 karaktera.', { prefix: '❌ ', duration: 3000 })
    return
  }
  if (!form.value.password || form.value.password.length < 8) {
    showToast('Lozinka mora imati bar 8 karaktera.', { prefix: '❌ ', duration: 3000 })
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
    showToast('Korisnik kreiran')
    await fetchData()
  } catch (e) {
    console.error('Greška pri kreiranju korisnika:', e)
    showToast(e.message || 'Greška pri kreiranju korisnika.', { prefix: '❌ ', duration: 3000 })
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
    showToast('Rola izmenjena')
    await fetchData()
  } catch (e) {
    console.error('Greška pri izmeni role:', e)
    showToast(e.message || 'Greška pri izmeni role.', { prefix: '❌ ', duration: 3000 })
    await fetchData()
  }
}

async function confirmDelete(user) {
  const ok = await askConfirm(`Da li želiš da obrišeš korisnika ${user.username}?`, {
    title: 'Brisanje korisnika',
  })
  if (!ok) return

  try {
    const res = await fetchWithAuth(`/api/protected/users/${user.id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await parseError(res, `HTTP ${res.status}`))
    await fetchData()
  } catch (e) {
    console.error('Greška pri brisanju korisnika:', e)
    showToast(e.message || 'Greška pri brisanju korisnika.', { prefix: '❌ ', duration: 3000 })
  }
}

onMounted(fetchData)
</script>
