<template>
  <div class="flex min-h-screen flex-col bg-canvas">
    <header class="no-print sticky top-0 z-50 border-b border-line bg-surface shadow-sm">
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

    <div class="flex min-h-0 flex-1">
      <Sidebar class="hidden md:flex" />

      <main class="w-full min-w-0 flex-1 px-4 py-6">
        <Breadcrumbs class="no-print" />
        <router-view />
      </main>
    </div>

    <footer class="no-print w-full border-t border-line py-4 text-center text-sm text-ink-muted">
      <AppFooter />
    </footer>

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
