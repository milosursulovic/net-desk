<template>
  <div class="flex min-h-screen bg-canvas">
    <!-- Brend panel -->
    <div
      class="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-accent-emphasis via-accent to-ink p-10 text-white md:flex"
    >
      <div class="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10"></div>
      <div class="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/5"></div>

      <div class="relative flex items-center gap-2 text-2xl font-bold" style="font-family: var(--font-display)">
        <img :src="Icon" alt="NetDesk" class="h-8 w-8" />
        <span>NetDesk</span>
      </div>

      <div class="relative max-w-md">
        <h1 class="mb-4 text-3xl font-bold leading-tight tracking-tight" style="font-family: var(--font-display)">
          {{ t('login.heroTitle') }}
        </h1>
        <p class="mb-8 text-white/85">
          {{ t('login.heroSubtitle') }}
        </p>

        <ul class="space-y-3 text-sm text-white/85">
          <li class="flex items-center gap-2.5">
            <span class="h-1.5 w-1.5 rounded-full bg-white/60"></span>
            {{ t('login.featureIp') }}
          </li>
          <li class="flex items-center gap-2.5">
            <span class="h-1.5 w-1.5 rounded-full bg-white/60"></span>
            {{ t('login.featurePdsu') }}
          </li>
          <li class="flex items-center gap-2.5">
            <span class="h-1.5 w-1.5 rounded-full bg-white/60"></span>
            {{ t('login.featurePrinters') }}
          </li>
        </ul>
      </div>

      <p class="relative text-xs text-white/70">&copy; {{ year }} {{ copyright }}</p>
    </div>

    <!-- Forma -->
    <div class="flex w-full flex-col items-center justify-center px-6 py-12 md:w-1/2">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex justify-center md:hidden">
          <Logo />
        </div>

        <h2 class="mb-1 text-2xl font-bold text-ink" style="font-family: var(--font-display)">{{ t('login.welcomeBack') }}</h2>
        <p class="mb-8 text-sm text-ink-muted">{{ t('login.subtitle') }}</p>

        <form @submit.prevent="handleLogin" class="space-y-4">
          <div>
            <label for="username" class="block text-sm font-medium text-ink mb-1">
              {{ t('login.username') }}
            </label>
            <input
              id="username"
              v-model.trim="username"
              type="text"
              required
              :placeholder="t('login.usernamePlaceholder')"
              class="app-input w-full"
            />
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-ink mb-1">
              {{ t('login.password') }}
            </label>
            <input
              id="password"
              v-model="password"
              type="password"
              required
              :placeholder="t('login.passwordPlaceholder')"
              class="app-input w-full"
            />
          </div>

          <AppButton type="submit" variant="primary" class="w-full mt-2">{{ t('login.submit') }}</AppButton>

          <p v-if="errorMessage" class="text-bad text-sm text-center animate-pulse">
            {{ errorMessage }}
          </p>
        </form>

        <p class="mt-10 text-center text-xs text-ink-muted md:hidden">
          &copy; {{ year }} {{ copyright }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Logo from '@/components/Logo.vue'
import AppButton from '@/components/AppButton.vue'
import { useAppInfo } from '@/composables/useAppInfo.js'
import Icon from '@/assets/icons/netdesk.svg'

const { t } = useI18n()
const { year, copyright } = useAppInfo()

const router = useRouter()
const route = useRoute()

const username = ref('')
const password = ref('')
const errorMessage = ref('')

const handleLogin = async () => {
  if (!username.value || !password.value) {
    errorMessage.value = t('login.errorRequired')
    return
  }
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.value, password: password.value }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      errorMessage.value = data.message || t('login.errorFailedLogin')
      return
    }
    localStorage.setItem('token', data.token)
    const returnTo = route.query.returnTo ? String(route.query.returnTo) : '/'
    router.push(returnTo)
  } catch (err) {
    console.error(err)
    errorMessage.value = t('login.errorServer')
  }
}
</script>
