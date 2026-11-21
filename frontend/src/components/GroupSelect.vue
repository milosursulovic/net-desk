<script setup>
import { ref, computed } from 'vue'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import NavIcon from '@/components/NavIcon.vue'
import { parseError } from '@/utils/api.js'

// A single dropdown for "group" (department on an IP entry, deployment group on an
// agent) - both sides now pick from the SAME predefined, server-side list
// (backend/routes/groups.routes.js), instead of free text. Doesn't emit a
// toast directly - the parent (which already has its own ToastNotification) shows the
// message via the 'error' event, same pattern as the other components here.
const props = defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  isAdmin: { type: Boolean, default: false },
  allowEmpty: { type: Boolean, default: true },
  // Deployment groups (agents) and departments (Home) are separate predefined
  // lists now - the default stays the shared groups_list, but the agent detail
  // page passes '/api/protected/deployment-groups'.
  createEndpoint: { type: String, default: '/api/protected/groups' },
})
const emit = defineEmits(['update:modelValue', 'group-added', 'error'])

// The current value can exist on the record while NOT (any longer) being in
// groups_list (e.g. legacy free text from before this list existed, or a
// group deleted later - the service refuses to delete a group that's in use,
// but not a rename/manual edit directly in the DB) - the union prevents the
// <select> from silently losing/changing the displayed value.
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
        class="shrink-0 px-3 rounded-lg border border-line hover:bg-surface-sunken"
        title="Dodaj novu grupu"
      ><NavIcon name="plus" /></button>
    </div>
    <div v-if="showAddForm" class="flex gap-2">
      <input
        v-model.trim="newGroupName"
        type="text"
        class="app-input flex-1 text-sm"
        placeholder="Naziv nove grupe..."
        @keydown.enter.prevent="addGroup"
      />
      <button type="button" :disabled="adding" @click="addGroup" class="px-3 py-1.5 border rounded-lg text-sm hover:bg-surface-sunken">
        Dodaj
      </button>
    </div>
  </div>
</template>
