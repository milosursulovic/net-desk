<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-display)">Grupe</h1>
        <p class="text-sm text-ink-muted mt-1">
          Predefinisana lista koja se koristi za "Odeljenje" na IP unosima. Deployment grupe agenata
          su odvojena lista - videti <RouterLink to="/deployment-groups" class="text-accent hover:underline">Deployment grupe</RouterLink>.
        </p>
      </div>
      <AppButton variant="neutral" @click="goBack">Nazad</AppButton>
    </div>

    <div v-if="isAdmin" class="rounded-xl border border-line bg-surface shadow-sm p-4 space-y-2">
      <label class="text-sm font-medium text-ink">Dodaj novu grupu</label>
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

    <div v-if="loading" class="text-ink-secondary">Učitavanje…</div>
    <div v-else-if="!items.length" class="rounded-xl border border-line bg-surface shadow-sm p-8 text-center text-ink-muted">
      Nema definisanih grupa.
    </div>

    <div v-else class="table-shell overflow-x-auto">
      <table class="w-full min-w-max text-sm">
        <thead class="table-head-row">
          <tr>
            <th class="px-4 py-2 text-left">Naziv</th>
            <th class="px-4 py-2 text-left">Odeljenje (IP unosi)</th>
            <th v-if="isAdmin" class="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.name" class="border-b border-line last:border-0 hover:bg-surface-sunken">
            <td class="px-4 py-2 font-medium text-ink">{{ item.name }}</td>
            <td class="px-4 py-2 font-mono tabular-nums text-ink-secondary">{{ item.departmentCount }}</td>
            <td v-if="isAdmin" class="px-4 py-2 text-right whitespace-nowrap">
              <button
                type="button"
                :disabled="item.departmentCount > 0"
                class="text-bad hover:underline text-xs disabled:text-ink-muted disabled:no-underline disabled:cursor-not-allowed"
                :title="item.departmentCount > 0 ? 'Grupa je u upotrebi - ne može se obrisati' : ''"
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
import { useRouter, RouterLink } from 'vue-router'
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
    showToast(err?.message || 'Greška pri učitavanju grupa', { kind: 'error', duration: 3000 })
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
    showToast(err?.message || 'Greška pri dodavanju grupe', { kind: 'error', duration: 3000 })
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
    showToast(err?.message || 'Greška pri brisanju grupe', { kind: 'error', duration: 3000 })
  }
}

onMounted(fetchData)
</script>
