<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { updateUser } from '../../../api/auth'
import { useAuthStore } from '../../../stores/auth'

const authStore = useAuthStore()
const fullName = ref('')
const avatarUrl = ref('')
const phone = ref('')
const loading = ref(false)
const error = ref('')
const success = ref(false)
let successTimer: ReturnType<typeof setTimeout> | undefined

watch(
  () => authStore.state.user,
  (user) => {
    if (!user) return
    fullName.value = user.full_name || ''
    avatarUrl.value = user.avatar_url || ''
    phone.value = user.phone || ''
  },
  { immediate: true },
)

async function saveProfile() {
  loading.value = true
  error.value = ''
  success.value = false
  if (successTimer) clearTimeout(successTimer)

  try {
    await updateUser({
      full_name: fullName.value || undefined,
      avatar_url: avatarUrl.value || undefined,
      phone: phone.value || undefined,
    })
    await authStore.loadUser()
    success.value = true
    successTimer = setTimeout(() => { success.value = false }, 3000)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '更新失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

onBeforeUnmount(() => {
  if (successTimer) clearTimeout(successTimer)
})
</script>

<template>
  <form class="profile-form-panel" @submit.prevent="saveProfile">
    <div class="profile-field">
      <label for="profile-full-name">全名</label>
      <input id="profile-full-name" v-model="fullName" type="text" autocomplete="name" placeholder="您的真实姓名" />
    </div>
    <div class="profile-field">
      <label for="profile-avatar-url">头像 URL</label>
      <input id="profile-avatar-url" v-model="avatarUrl" type="url" autocomplete="url" placeholder="https://..." />
    </div>
    <div class="profile-field">
      <label for="profile-phone">手机号</label>
      <input id="profile-phone" v-model="phone" type="tel" autocomplete="tel" placeholder="+86 ..." />
    </div>
    <div v-if="error" class="profile-feedback error" role="alert">{{ error }}</div>
    <div v-if="success" class="profile-feedback success" role="status">更新成功</div>
    <button class="profile-primary" type="submit" :disabled="loading">
      {{ loading ? '保存中...' : '保存' }}
    </button>
  </form>
</template>
