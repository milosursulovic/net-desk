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

    <!-- The sidebar and header always stay on screen (fixed shell height, only
         <main> scrolls) - previously the whole shell grew with the content
         (min-h-screen), so the sidebar (which has no sticky/fixed of its own) went off
         screen together with the rest of the page as soon as the content was longer than the
         viewport, leaving only a thin header with no clear "where am I"
         indicator - Sidebar.vue already had overflow-y-auto prepared for
         this, its parent just never gave it a bounded height. -->
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

    <!-- The sidebar as an off-canvas panel below md - the same SlideOverPanel the app
         already uses for other overlays, instead of inventing another pattern. -->
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
