<script setup>
import { ref, computed } from 'vue'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'

// Jedinstven dropdown za "grupu" (odeljenje na IP unosu, deployment grupa na
// agentu) - obe strane sad biraju iz ISTE predefinisane, server-side liste
// (backend/routes/groups.routes.js), umesto slobodnog teksta. Ne emituje
// toast direktno - roditelj (koji već ima svoj ToastNotification) prikazuje
// poruku preko 'error' event-a, isti obrazac kao ostale komponente ovde.
const props = defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  isAdmin: { type: Boolean, default: false },
  allowEmpty: { type: Boolean, default: true },
  // Deployment grupe (agenti) i odeljenja (Home) su odvojene predefinisane
  // liste sada - podrazumevano ostaje deljena groups_list, ali detalj
  // strana agenta prosleđuje '/api/protected/deployment-groups'.
  createEndpoint: { type: String, default: '/api/protected/groups' },
})
const emit = defineEmits(['update:modelValue', 'group-added', 'error'])

// Trenutna vrednost može da postoji na podatku a da NIJE (više) u
// groups_list (npr. legacy slobodan tekst iz vremena pre ove liste, ili
// grupa obrisana posle - servis odbija brisanje grupe koja je u upotrebi,
// ali ne i preimenovanje/ručnu izmenu direktno u bazi) - unija sprečava da
// <select> tiho izgubi/promeni prikazanu vrednost.
const allOptions = computed(() => {
  if (!props.modelValue || props.options.includes(props.modelValue)) return props.options
  return [...props.options, props.modelValue].sort((a, b) => a.localeCompare(b))
})

const adding = ref(false)
const newGroupName = ref('')
const showAddForm = ref(false)

async function addGroup() {
  const name = newGroupName.value.trim()
  if (!name) return
  adding.value = true
  try {
    const res = await fetchWithAuth(props.createEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) throw new Error(await parseError(res, 'Greška pri dodavanju grupe'))
    emit('group-added', name)
    emit('update:modelValue', name)
    newGroupName.value = ''
    showAddForm.value = false
  } catch (err) {
    emit('error', err.message || 'Greška pri dodavanju grupe')
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <div class="space-y-1">
    <div class="flex gap-2">
      <select
        :value="modelValue"
        @change="emit('update:modelValue', $event.target.value)"
        class="app-input w-full"
      >
        <option v-if="allowEmpty" value="">— Nije određeno —</option>
        <option v-for="g in allOptions" :key="g" :value="g">{{ g }}</option>
      </select>
      <button
        v-if="isAdmin"
        type="button"
        @click="showAddForm = !showAddForm"
        class="shrink-0 px-3 rounded-lg border text-sm hover:bg-slate-50"
        title="Dodaj novu grupu"
      >+</button>
    </div>
    <div v-if="showAddForm" class="flex gap-2">
      <input
        v-model.trim="newGroupName"
        type="text"
        class="app-input flex-1 text-sm"
        placeholder="Naziv nove grupe..."
        @keydown.enter.prevent="addGroup"
      />
      <button type="button" :disabled="adding" @click="addGroup" class="px-3 py-1.5 border rounded-lg text-sm hover:bg-slate-50">
        Dodaj
      </button>
    </div>
  </div>
</template>
