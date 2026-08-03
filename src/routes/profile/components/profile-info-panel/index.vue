<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import { onBeforeUnmount, ref, watch } from 'vue'
import { updateCurrentUser } from '@/http/user'
import { useAuthStore } from '@/stores/auth'

defineOptions({ name: 'ProfileInfoPanel' })

const authStore = useAuthStore()
const form = ref({
  fullName: '',
  avatarUrl: '',
  phone: '',
})
const loading = ref(false)
const error = ref('')
const success = ref(false)
let successTimer: ReturnType<typeof setTimeout> | undefined
function validate(values: Partial<{ avatarUrl: string }>): FormError[] {
  if (!values.avatarUrl) return []
  try {
    new URL(values.avatarUrl)
    return []
  } catch {
    return [{ name: 'avatarUrl', message: '请输入有效的头像 URL' }]
  }
}

watch(
  () => authStore.state.user,
  (user) => {
    if (!user) return
    form.value.fullName = user.full_name || ''
    form.value.avatarUrl = user.avatar_url || ''
    form.value.phone = user.phone || ''
  },
  { immediate: true },
)

async function onSubmit() {
  loading.value = true
  error.value = ''
  success.value = false
  if (successTimer) clearTimeout(successTimer)

  try {
    await updateCurrentUser({
      full_name: form.value.fullName || undefined,
      avatar_url: form.value.avatarUrl || undefined,
      phone: form.value.phone || undefined,
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
  <UForm
    :class="$style.formPanel"
    :state="form"
    :validate="validate"
    :disabled="loading"
    @submit="onSubmit"
  >
    <UFormField label="全名" name="fullName">
      <UInput v-model="form.fullName" :class="$style.input" size="lg" autocomplete="name" placeholder="您的真实姓名" />
    </UFormField>
    <UFormField label="头像 URL" name="avatarUrl">
      <UInput v-model="form.avatarUrl" :class="$style.input" size="lg" autocomplete="url" placeholder="https://..." />
    </UFormField>
    <UFormField label="手机号" name="phone">
      <UInput v-model="form.phone" :class="$style.input" size="lg" autocomplete="tel" placeholder="+86 ..." />
    </UFormField>
    <UAlert v-if="error" :class="$style.feedback" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" />
    <UAlert v-if="success" :class="$style.feedback" color="success" variant="subtle" icon="i-lucide-circle-check" description="更新成功" />
    <UButton type="submit" size="lg" block :loading="loading" label="保存" />
  </UForm>
</template>

<style module src="./index.module.css"></style>
