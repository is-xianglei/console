<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LoginView from './LoginView.vue'
import RegisterView from './RegisterView.vue'

const route = useRoute()
const router = useRouter()
const showLogin = computed(() => route.name === 'login')

function switchTo(name: 'login' | 'register') {
  void router.push({ name, query: route.query })
}
</script>

<template>
  <LoginView v-if="showLogin" @switch-to-register="switchTo('register')" />
  <RegisterView v-else @switch-to-login="switchTo('login')" />
</template>
