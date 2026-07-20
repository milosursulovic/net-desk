<template>
  <AppButton variant="danger" @click="logout">Odjavi se</AppButton>
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
