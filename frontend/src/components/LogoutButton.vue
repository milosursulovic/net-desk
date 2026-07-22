<template>
  <!-- span.contents ne učestvuje u layout-u (samo obezbeđuje jedan template
       root) - dete elementi ostaju direktni flex učesnici roditelja. -->
  <span class="contents">
    <!-- Ispod sm: ista suptilna kružna ikonica kao ThemeToggle/PushNotificationToggle
         (puno "danger" dugme sa emotikonom izgleda kao crvena mrlja na uskom
         zaglavlju). Na sm i više, puno dugme sa tekstom kao i pre. -->
    <button
      type="button"
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-300 sm:hidden"
      title="Odjavi se"
      @click="logout"
    >
      🚪
    </button>

    <!-- `hidden`/`sm:inline-flex` idu na omotač, ne direktno na AppButton -
         AppButton-ova sopstvena `.app-btn` klasa (@apply ... inline-flex ...)
         ima istu CSS specifičnost kao `.hidden` i dolazi POSLE nje u
         kompajliranom main.css-u, pa bi na istom elementu uvek pobedila
         (dugme bi ostalo vidljivo na svakoj širini ekrana). -->
    <span class="hidden sm:inline-flex">
      <AppButton variant="danger" @click="logout">Odjavi se</AppButton>
    </span>
  </span>
</template>

<script setup>
import { useRouter } from 'vue-router'
import AppButton from '@/components/AppButton.vue'

const router = useRouter()
const logout = () => {
  localStorage.removeItem('token')
  router.push('/login')
}
</script>
