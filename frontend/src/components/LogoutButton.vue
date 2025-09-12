<template>
  <button @click="logout" class="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">
    Odjavi se
  </button>
</template>

<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()
const logout = () => {
  localStorage.removeItem('token')
  router.push('/login')
}
</script>
