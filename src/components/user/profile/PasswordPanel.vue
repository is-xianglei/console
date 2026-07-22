<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { changePassword } from '../../../api/auth'

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')
const success = ref(false)
let successTimer: ReturnType<typeof setTimeout> | undefined

async function savePassword() {
  error.value = ''
  success.value = false
  if (!oldPassword.value || !newPassword.value || !confirmPassword.value) {
    error.value = '请填写所有密码字段'
    return
  }
  if (newPassword.value.length < 6) {
    error.value = '新密码至少 6 个字符'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = '两次输入的新密码不一致'
    return
  }

  loading.value = true
  if (successTimer) clearTimeout(successTimer)
  try {
    await changePassword({ old_password: oldPassword.value, new_password: newPassword.value })
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    success.value = true
    successTimer = setTimeout(() => { success.value = false }, 3000)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '修改密码失败'
  } finally {
    loading.value = false
  }
}

onBeforeUnmount(() => {
  if (successTimer) clearTimeout(successTimer)
})
</script>

<template>
  <form class="profile-form-panel" @submit.prevent="savePassword">
    <div class="profile-field">
      <label for="current-password">当前密码</label>
      <input id="current-password" v-model="oldPassword" type="password" autocomplete="current-password" placeholder="输入当前密码" />
    </div>
    <div class="profile-field">
      <label for="new-password">新密码</label>
      <input id="new-password" v-model="newPassword" type="password" autocomplete="new-password" placeholder="至少 6 个字符" />
    </div>
    <div class="profile-field">
      <label for="confirm-password">确认新密码</label>
      <input id="confirm-password" v-model="confirmPassword" type="password" autocomplete="new-password" placeholder="再次输入新密码" />
    </div>
    <div v-if="error" class="profile-feedback error" role="alert">{{ error }}</div>
    <div v-if="success" class="profile-feedback success" role="status">密码修改成功</div>
    <button class="profile-primary" type="submit" :disabled="loading">
      {{ loading ? '修改中...' : '修改密码' }}
    </button>
  </form>
</template>
