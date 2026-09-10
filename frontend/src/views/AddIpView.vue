<template>
  <div class="w-full max-w-2xl mx-auto">
    <h1 class="text-2xl font-bold text-ink mb-6" style="font-family: var(--font-display)">{{ t('addIp.title') }}</h1>

    <form @submit.prevent="handleSubmit" class="space-y-5">
      <div>
        <label for="ip" class="block text-sm font-medium text-ink mb-1">{{ t('ipFields.ip') }} *</label>
        <input
          id="ip"
          v-model.trim="form.ip"
          type="text"
          :placeholder="t('addIp.ipPlaceholder')"
          class="app-input w-full"
          required
          :class="ipError ? 'border-bad' : ''"
        />
        <p v-if="ipError" class="text-xs text-bad mt-1">{{ ipError }}</p>
      </div>

      <div>
        <label for="entryType" class="block text-sm font-medium text-ink mb-1">{{ t('addIp.typeLabel') }}</label>
        <select id="entryType" v-model="entryTypeModel" class="app-input w-full">
          <option value="">{{ t('addIp.typeNotSet') }}</option>
          <option v-for="opt in ENTRY_TYPE_OPTIONS" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>

      <div>
        <label for="site" class="block text-sm font-medium text-ink mb-1">{{ t('addIp.siteLabel') }} *</label>
        <select id="site" v-model="form.site" class="app-input w-full" required>
          <option v-for="opt in SITE_OPTIONS" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>

      <div>
        <label for="department" class="block text-sm font-medium text-ink mb-1">{{ t('common.department') }}</label>
        <GroupSelect
          v-model="form.department"
          :options="groupOptions"
          :is-admin="isAdmin"
          @group-added="groupOptions.push($event)"
          @error="(msg) => (error = msg)"
        />
      </div>

      <div v-for="field in optionalFields" :key="field.name">
        <label :for="field.name" class="block text-sm font-medium text-ink mb-1">
          {{ t(field.labelKey) }}
        </label>

        <textarea
          v-if="field.name === 'description'"
          :id="field.name"
          v-model.trim="form[field.name]"
          rows="6"
          :placeholder="t('addIp.descriptionPlaceholder')"
          class="app-input w-full resize-y"
        />

        <input
          v-else
          :id="field.name"
          v-model.trim="form[field.name]"
          type="text"
          :placeholder="t(field.labelKey)"
          class="app-input w-full"
        />
      </div>

      <div class="flex justify-between pt-4">
        <AppButton type="button" variant="neutral" @click="goBack">{{ t('common.cancel') }}</AppButton>
        <AppButton type="submit" variant="success">{{ t('common.add') }}</AppButton>
      </div>
    </form>

    <p v-if="error" class="text-bad mt-4 text-center animate-pulse">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'
import AppButton from '@/components/AppButton.vue'
import {
  createIpEntryForm,
  IP_OPTIONAL_FIELDS,
  validateIpv4,
} from '@/constants/ipEntryFields.js'
import { ENTRY_TYPE_OPTIONS } from '@/constants/entryTypes.js'
import { SITE_OPTIONS } from '@/constants/sites.js'
import { useCurrentSite } from '@/composables/useCurrentSite.js'
import { useCurrentUser } from '@/composables/useCurrentUser.js'
import GroupSelect from '@/components/GroupSelect.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const currentSite = useCurrentSite()
const { isAdmin } = useCurrentUser()
const error = ref('')
const form = ref(createIpEntryForm({ site: currentSite.value }))
// 'department' se renderuje posebno iznad (GroupSelect), ne u generičkoj petlji.
const optionalFields = IP_OPTIONAL_FIELDS.filter((f) => f.name !== 'department')
const groupOptions = ref([])

const ipError = computed(() => validateIpv4(form.value.ip, { t }))

const entryTypeModel = computed({
  get: () => form.value.entryType ?? '',
  set: (value) => {
    form.value.entryType = value || null
  },
})

const handleSubmit = async () => {
  if (ipError.value) {
    error.value = ipError.value
    return
  }
  try {
    const res = await fetchWithAuth('/api/protected/ip-addresses', {
      method: 'POST',
      body: JSON.stringify(form.value),
    })
    if (!res.ok) {
      error.value = await parseError(res, t('addIp.errorFailedAdd'))
      return
    }
    router.push('/')
  } catch (err) {
    console.error(err)
    error.value = t('addIp.errorServer')
  }
}

const goBack = () => router.push('/')

async function fetchGroupOptions() {
  try {
    const res = await fetchWithAuth('/api/protected/groups')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    groupOptions.value = await res.json()
  } catch (err) {
    console.error('Neuspešno dohvatanje grupa', err)
  }
}

onMounted(() => {
  if (route.query.ip) form.value.ip = String(route.query.ip)
  fetchGroupOptions()
})
</script>
