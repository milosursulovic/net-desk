<template>
  <div class="flex h-screen flex-col overflow-hidden bg-canvas">
    <header class="no-print shrink-0 border-b border-line bg-surface shadow-sm">
      <div class="flex w-full items-center gap-4 overflow-x-auto px-4 py-2.5 no-scrollbar">
        <button
          type="button"
          class="rounded-md p-1.5 text-ink-secondary hover:bg-surface-sunken md:hidden"
          aria-label="Otvori navigaciju"
          @click="mobileNavOpen = true"
        >
          <NavIcon name="menu" class="h-5 w-5" />
        </button>

        <Logo class="shrink-0" />
        <span class="hidden shrink-0 rounded-full bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] text-ink-muted sm:inline-block">v{{ version }}</span>

        <SiteSwitcher class="shrink-0" />

        <NotificationTicker class="hidden min-w-0 flex-1 md:block" />

        <UserMenu class="ml-auto shrink-0" />
      </div>
    </header>

    <!-- Sidebar i header ostaju uvek na ekranu (fiksna visina shell-a, samo
         <main> skroluje) - ranije je ceo shell rastao sa sadržajem
         (min-h-screen), pa je sidebar (nema svoj sticky/fixed) odlazio van
         ekrana zajedno sa ostatkom stranice čim je sadržaj bio duži od
         viewport-a, ostavljajući samo tanak header bez jasnog "gde sam"
         indikatora - Sidebar.vue je već imao overflow-y-auto pripremljen za
         ovo, samo mu roditelj nikad nije davao ograničenu visinu. -->
    <div class="flex min-h-0 flex-1">
      <Sidebar class="hidden md:flex" />

      <main class="w-full min-w-0 flex-1 overflow-y-auto px-4 py-6">
        <Breadcrumbs class="no-print" />
        <router-view />
        <footer class="no-print mt-10 border-t border-line pt-4 text-center text-sm text-ink-muted">
          <AppFooter />
        </footer>
      </main>
    </div>

    <!-- Sidebar kao off-canvas panel ispod md - isti SlideOverPanel koji app
         već koristi za druge overlay-e, umesto izmišljanja drugog obrasca. -->
    <SlideOverPanel :open="mobileNavOpen" title="Navigacija" width-class="w-72" @close="mobileNavOpen = false">
      <Sidebar class="w-full! border-0!" @click="mobileNavOpen = false" />
    </SlideOverPanel>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import Logo from '@/components/Logo.vue'
import NavIcon from '@/components/NavIcon.vue'
import AppFooter from '@/components/AppFooter.vue'
import Sidebar from '@/components/Sidebar.vue'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import NotificationTicker from '@/components/NotificationTicker.vue'
import SiteSwitcher from '@/components/SiteSwitcher.vue'
import UserMenu from '@/components/UserMenu.vue'
import SlideOverPanel from '@/components/SlideOverPanel.vue'
import { useAppInfo } from '@/composables/useAppInfo.js'

const { version } = useAppInfo()
const mobileNavOpen = ref(false)
</script>
