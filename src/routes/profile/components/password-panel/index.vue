<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import { onBeforeUnmount, ref } from 'vue'
import { changePassword } from '@/http/auth'

defineOptions({ name: 'PasswordPanel' })

const form = ref({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})
const loading = ref(false)
const error = ref('')
const success = ref(false)
let successTimer: ReturnType<typeof setTimeout> | undefined
function validate(values: Partial<typeof form.value>): FormError[] {
  const errors: FormError[] = []
  if (!values.oldPassword) errors.push({ name: 'oldPassword', message: '请输入当前密码' })
  if (!values.newPassword) errors.push({ name: 'newPassword', message: '请输入新密码' })
  else if (values.newPassword.length < 6) errors.push({ name: 'newPassword', message: '新密码至少 6 个字符' })
  if (!values.confirmPassword) errors.push({ name: 'confirmPassword', message: '请再次输入新密码' })
  else if (values.confirmPassword !== values.newPassword) {
    errors.push({ name: 'confirmPassword', message: '两次输入的新密码不一致' })
  }
  return errors
}

async function onSubmit() {
  error.value = ''
  success.value = false
  loading.value = true
  if (successTimer) clearTimeout(successTimer)
  try {
    await changePassword({
      old_password: form.value.oldPassword,
      new_password: form.value.newPassword,
    })
    form.value.oldPassword = ''
    form.value.newPassword = ''
    form.value.confirmPassword = ''
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
  <UForm
    :class="$style.formPanel"
    :state="form"
    :validate="validate"
    :disabled="loading"
    @submit="onSubmit"
  >
    <UFormField label="当前密码" name="oldPassword" required>
      <UInput
        v-model="form.oldPassword"
        :class="$style.input"
        type="password"
        size="lg"
        autocomplete="current-password"
        placeholder="输入当前密码"
      />
    </UFormField>
    <UFormField label="新密码" name="newPassword" required>
      <UInput
        v-model="form.newPassword"
        :class="$style.input"
        type="password"
        size="lg"
        autocomplete="new-password"
        placeholder="至少 6 个字符"
      />
    </UFormField>
    <UFormField label="确认新密码" name="confirmPassword" required>
      <UInput
        v-model="form.confirmPassword"
        :class="$style.input"
        type="password"
        size="lg"
        autocomplete="new-password"
        placeholder="再次输入新密码"
      />
    </UFormField>
    <UAlert v-if="error" :class="$style.feedback" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" />
    <UAlert v-if="success" :class="$style.feedback" color="success" variant="subtle" icon="i-lucide-circle-check" description="密码修改成功" />
    <UButton type="submit" size="lg" block :loading="loading" label="修改密码" />
  </UForm>
</template>

<style module src="./index.module.css"></style>
