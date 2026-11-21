<template>
  <div class="rounded-xl border border-line bg-surface shadow-sm p-4 space-y-3">
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2 font-medium text-ink">
        Ekran
      </div>
      <AppButton variant="success" @click="openSession">Zatraži kontrolu ekrana</AppButton>
    </div>

    <p class="text-sm text-ink-muted">
      Otvara se u posebnom prozoru. Korisnik na tom računaru mora da odobri
      pristup u prozoru koji mu se pojavi - bez njegovog pristanka sesija se ne
      uspostavlja, a svaki pokušaj se trajno beleži. Zahteva UltraVNC
      instaliran i pokrenut na ciljnoj mašini.
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

function openSession() {
  const url = router.resolve({
    name: 'agent-vnc-session',
    params: { id: props.agentId },
  }).href
  window.open(url, `netdesk-vnc-${props.agentId}`, 'width=1400,height=900,noopener,noreferrer')
}
</script>
