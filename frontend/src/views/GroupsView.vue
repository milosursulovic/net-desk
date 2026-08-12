<template>
  <div class="glass-container space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">Grupe</h1>
        <p class="text-sm text-slate-500 mt-1">
          Predefinisana lista koja se koristi za "Odeljenje" na IP unosima i "Deployment grupa" na agentima.
        </p>
      </div>
      <AppButton variant="neutral" @click="goBack">Nazad</AppButton>
    </div>

    <div v-if="isAdmin" class="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-2">
      <label class="text-sm font-medium text-slate-700">Dodaj novu grupu</label>
      <div class="flex flex-col sm:flex-row gap-2">
        <input
          v-model.trim="newGroupName"
          type="text"
          placeholder="Naziv grupe..."
          class="app-input w-full"
          @keydown.enter.prevent="addGroup"
        />
        <AppButton :disabled="!newGroupName || adding" @click="addGroup">
          {{ adding ? 'Dodajem…' : 'Dodaj' }}
        </AppButton>
      </div>
    </div>

    <div v-if="loading" class="text-slate-600">Učitavanje…</div>
    <div v-else-if="!items.length" class="rounded-xl border border-slate-200 bg-white shadow-sm p-8 text-center text-slate-500">
      Nema definisanih grupa.
    </div>

    <div v-else class="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
      <table class="w-full min-w-max text-sm">
        <thead class="bg-slate-50 text-slate-600 text-left">
          <tr>
            <th class="px-4 py-2 font-medium">Naziv</th>
            <th class="px-4 py-2 font-medium">Odeljenje (IP unosi)</th>
            <th class="px-4 py-2 font-medium">Deployment grupa (agenti)</th>
            <th v-if="isAdmin" class="px-4 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="item in items" :key="item.name">
            <td class="px-4 py-2 font-medium">{{ item.name }}</td>
            <td class="px-4 py-2">{{ item.departmentCount }}</td>
            <td class="px-4 py-2">{{ item.deploymentCount }}</td>
            <td v-if="isAdmin" class="px-4 py-2 text-right whitespace-nowrap">
              <button
                type="button"
                :disabled="item.departmentCount + item.deploymentCount > 0"
                class="text-red-600 hover:underline text-xs disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed"
                :title="item.departmentCount + item.deploymentCount > 0 ? 'Grupa je u upotrebi - ne može se obrisati' : ''"
                @click="remove(item.name)"
              >
                Obriši
              </button>
            </td>
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import { useToast } from '@/composables/useToast.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import AppButton from '@/components/AppButton.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const router = useRouter()
const { toast, showToast } = useToast()
const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()
const { isAdmin } = useCurrentUser()

const items = ref([])
const loading = ref(false)
const adding = ref(false)
const newGroupName = ref('')

const goBack = () => router.back()

async function fetchData() {
  loading.value = true
  try {
    const res = await fetchWithAuth('/api/protected/groups/usage')
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri učitavanju grupa'))
    items.value = await res.json()
  } catch (err) {
    console.error('Neuspešno učitavanje grupa', err)
    showToast(err?.message || 'Greška pri učitavanju grupa', { prefix: '❌ ', duration: 3000 })
  } finally {
    loading.value = false
  }
}

async function addGroup() {
  const name = newGroupName.value.trim()
  if (!name) return

  adding.value = true
  try {
    const res = await fetchWithAuth('/api/protected/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri dodavanju grupe'))
    newGroupName.value = ''
    await fetchData()
    showToast('Grupa dodata')
  } catch (err) {
    console.error('Neuspešno dodavanje grupe', err)
    showToast(err?.message || 'Greška pri dodavanju grupe', { prefix: '❌ ', duration: 3000 })
  } finally {
    adding.value = false
  }
}

async function remove(name) {
  const ok = await askConfirm(`Obrisati grupu "${name}"?`, { title: 'Brisanje grupe' })
  if (!ok) return

  try {
    const res = await fetchWithAuth(`/api/protected/groups/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri brisanju grupe'))
    await fetchData()
    showToast('Grupa obrisana')
  } catch (err) {
    console.error('Neuspešno brisanje grupe', err)
    showToast(err?.message || 'Greška pri brisanju grupe', { prefix: '❌ ', duration: 3000 })
  }
}

onMounted(fetchData)
</script>
