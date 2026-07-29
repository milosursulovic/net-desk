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
        <AppButton variant="neutral" @click="openSession(true)">Samo pregled</AppButton>
        <AppButton variant="success" @click="openSession(false)">Uzmi kontrolu ekrana</AppButton>
      </div>
    </div>

    <p class="text-sm text-slate-500">
      Otvara se u posebnom prozoru, bez obaveštenja korisniku za tim
      računarom. "Samo pregled" ne šalje miš/tastaturu ka mašini. Zahteva
      UltraVNC instaliran i pokrenut na ciljnoj mašini.
    </p>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import AppButton from '@/components/AppButton.vue'

const props = defineProps({
  agentId: { type: [String, Number], required: true },
})

const router = useRouter()

function openSession(viewOnly) {
  const url = router.resolve({
    name: 'agent-vnc-session',
    params: { id: props.agentId },
    query: viewOnly ? { viewOnly: '1' } : {},
  }).href
  window.open(url, `netdesk-vnc-${props.agentId}`, 'width=1400,height=900,noopener,noreferrer')
}
</script>
