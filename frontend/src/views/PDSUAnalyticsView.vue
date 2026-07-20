<script setup>
import { ref, computed, onMounted } from 'vue'

import { fetchWithAuth } from '@/utils/fetchWithAuth.js'
import { parseError } from '@/utils/api.js'

import PDSUOverview from '@/components/pdsu/PDSUOverview.vue'
import PDSUSoftware from '@/components/pdsu/PDSUSoftware.vue'
import PDSUDrivers from '@/components/pdsu/PDSUDrivers.vue'
import PDSUServices from '@/components/pdsu/PDSUServices.vue'
import PDSUUpdates from '@/components/pdsu/PDSUUpdates.vue'

const loading = ref(false)
const error = ref('')
const stats = ref(null)

const activeTab = ref('overview')

const coverage = computed(() => stats.value?.coverage ?? {})
const software = computed(() => stats.value?.software ?? {})
const drivers = computed(() => stats.value?.drivers ?? {})
const services = computed(() => stats.value?.services ?? {})
const updates = computed(() => stats.value?.updates ?? {})

async function loadStats() {
  loading.value = true
  error.value = ''

  try {
    const response = await fetchWithAuth('/api/protected/pdsu-analytics/stats')

    if (!response.ok) {
      const message = await parseError(response, 'Greška prilikom učitavanja PDSU analitike.')

      throw new Error(message)
    }

    stats.value = await response.json()
  } catch (err) {
    console.error('PDSU analytics error:', err)

    error.value = err?.message || 'Greška prilikom učitavanja PDSU analitike.'
  } finally {
    loading.value = false
  }
}

onMounted(loadStats)
</script>

<template>
  <main class="pdsu-page">
    <div class="pdsu-container">
      <header class="pdsu-page-header">
        <div>
          <h1 class="pdsu-title">PDSU analitika</h1>

          <p class="pdsu-subtitle">
            Centralni pregled programa, drajvera, servisa i Windows update podataka.
          </p>
        </div>

        <button
          type="button"
          class="btn pdsu-refresh-button"
          :disabled="loading"
          @click="loadStats"
        >
          <span
            v-if="loading"
            class="spinner-border spinner-border-sm"
            role="status"
            aria-hidden="true"
          />

          <span v-else class="pdsu-refresh-icon">↻</span>

          <span>
            {{ loading ? 'Osvežavanje...' : 'Osveži podatke' }}
          </span>
        </button>
      </header>

      <div v-if="loading && !stats" class="pdsu-state-card">
        <div class="spinner-border text-primary mb-3" role="status">
          <span class="visually-hidden">Učitavanje...</span>
        </div>

        <h2 class="h5 mb-2">Učitavanje PDSU analitike</h2>

        <p class="text-muted mb-0">
          Prikupljamo statistiku programa, drajvera, servisa i update podataka.
        </p>
      </div>

      <div v-else-if="error && !stats" class="pdsu-state-card">
        <div class="pdsu-error-icon">!</div>

        <h2 class="h5 mb-2">Podaci nisu učitani</h2>

        <p class="text-muted mb-4">
          {{ error }}
        </p>

        <button type="button" class="btn btn-primary" :disabled="loading" @click="loadStats">
          Pokušaj ponovo
        </button>
      </div>

      <template v-else>
        <div v-if="error" class="alert alert-warning pdsu-alert" role="alert">
          {{ error }}
        </div>

        <nav class="pdsu-tabs" aria-label="PDSU kategorije">
          <button
            type="button"
            class="pdsu-tab"
            :class="{ 'pdsu-tab-active': activeTab === 'overview' }"
            @click="activeTab = 'overview'"
          >
            <span class="pdsu-tab-icon">◫</span>
            <span>Pregled</span>
          </button>

          <button
            type="button"
            class="pdsu-tab"
            :class="{ 'pdsu-tab-active': activeTab === 'software' }"
            @click="activeTab = 'software'"
          >
            <span class="pdsu-tab-icon">P</span>
            <span>Programi</span>
          </button>

          <button
            type="button"
            class="pdsu-tab"
            :class="{ 'pdsu-tab-active': activeTab === 'drivers' }"
            @click="activeTab = 'drivers'"
          >
            <span class="pdsu-tab-icon">D</span>
            <span>Drajveri</span>
          </button>

          <button
            type="button"
            class="pdsu-tab"
            :class="{ 'pdsu-tab-active': activeTab === 'services' }"
            @click="activeTab = 'services'"
          >
            <span class="pdsu-tab-icon">S</span>
            <span>Servisi</span>
          </button>

          <button
            type="button"
            class="pdsu-tab"
            :class="{ 'pdsu-tab-active': activeTab === 'updates' }"
            @click="activeTab = 'updates'"
          >
            <span class="pdsu-tab-icon">U</span>
            <span>Updates</span>
          </button>
        </nav>

        <section class="pdsu-content">
          <Transition name="pdsu-fade" mode="out-in">
            <PDSUOverview
              v-if="activeTab === 'overview'"
              key="overview"
              :coverage="coverage"
              :software="software"
              :drivers="drivers"
              :services="services"
              :updates="updates"
            />

            <PDSUSoftware
              v-else-if="activeTab === 'software'"
              key="software"
              :software="software"
            />

            <PDSUDrivers v-else-if="activeTab === 'drivers'" key="drivers" :drivers="drivers" />

            <PDSUServices
              v-else-if="activeTab === 'services'"
              key="services"
              :services="services"
            />

            <PDSUUpdates v-else-if="activeTab === 'updates'" key="updates" :updates="updates" />
          </Transition>
        </section>
      </template>
    </div>
  </main>
</template>