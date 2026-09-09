<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authErrorMessage } from '@/http'
import { useAuthStore } from '@/stores/auth'
import { safeRedirect } from '@/routes'

defineOptions({ name: 'RegisterPage' })

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const form = reactive({
  email: '',
  username: '',
  password: '',
  confirmPassword: '',
  fullName: '',
})
const error = ref('')
const loading = ref(false)
function validate(values: Partial<typeof form>): FormError[] {
  const errors: FormError[] = []
  if (!values.email) errors.push({ name: 'email', message: '请输入邮箱' })
  else if (!/^\S+@\S+\.\S+$/.test(values.email)) {
    errors.push({ name: 'email', message: '请输入有效的邮箱地址' })
  }
  if (!values.username) errors.push({ name: 'username', message: '请输入用户名' })
  else if (values.username.length < 3) errors.push({ name: 'username', message: '用户名至少 3 个字符' })
  if (!values.password) errors.push({ name: 'password', message: '请输入密码' })
  else if (values.password.length < 6) errors.push({ name: 'password', message: '密码至少 6 个字符' })
  else if (values.password.length < 8 || !/[A-Za-z]/.test(values.password) || !/\d/.test(values.password)) {
    errors.push({ name: 'password', message: '密码至少 8 位，且需同时包含字母和数字' })
  }
  if (!values.confirmPassword) {
    errors.push({ name: 'confirmPassword', message: '请再次输入密码' })
  } else if (values.confirmPassword !== values.password) {
    errors.push({ name: 'confirmPassword', message: '两次输入的密码不一致' })
  }
  return errors
}

function resolveAuthTarget(): string {
  return safeRedirect(route.query.redirect) ?? '/chat'
}

async function onRegister() {
  loading.value = true
  error.value = ''

  try {
    await authStore.register({
      email: form.email,
      username: form.username,
      password: form.password,
      full_name: form.fullName || undefined,
    })
    await router.replace(resolveAuthTarget())
  } catch (cause) {
    error.value = authErrorMessage(cause, '注册失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

function onLogin() {
  void router.push({ name: 'login', query: route.query })
}
</script>

<template>
  <div :class="$style.authContainer">
    <div :class="$style.authCard">
      <div :class="$style.authHeader">
        <svg :class="$style.authHex" viewBox="0 0 20 22" fill="none">
          <path d="M10 0L19.66 5.5V16.5L10 22L0.34 16.5V5.5L10 0Z" fill="currentColor" />
        </svg>
        <h1 :class="$style.authTitle">注册 Hyperreal</h1>
        <p :class="$style.authSubtitle">Agent Console</p>
      </div>

      <UForm
        :class="$style.authForm"
        :state="form"
        :validate="validate"
        :validate-on="['blur']"
        :disabled="loading"
        @submit="onRegister"
      >
        <UFormField :class="$style.authField" label="邮箱" name="email" required>
          <UInput
            v-model="form.email"
            :class="$style.authInput"
            size="lg"
            placeholder="your@email.com"
            autocomplete="email"
          />
        </UFormField>

        <UFormField :class="$style.authField" label="用户名" name="username" required>
          <UInput
            v-model="form.username"
            :class="$style.authInput"
            size="lg"
            placeholder="至少 3 个字符"
            autocomplete="username"
          />
        </UFormField>

        <UFormField :class="$style.authField" label="密码" name="password" required>
          <UInput
            v-model="form.password"
            :class="$style.authInput"
            type="password"
            size="lg"
            placeholder="至少 8 位，含字母和数字"
            autocomplete="new-password"
          />
        </UFormField>

        <UFormField :class="$style.authField" label="确认密码" name="confirmPassword" required>
          <UInput
            v-model="form.confirmPassword"
            :class="$style.authInput"
            type="password"
            size="lg"
            placeholder="再次输入密码"
            autocomplete="new-password"
          />
        </UFormField>

        <UFormField :class="$style.authField" label="全名" hint="可选" name="fullName">
          <UInput
            v-model="form.fullName"
            :class="$style.authInput"
            size="lg"
            placeholder="您的真实姓名"
            autocomplete="name"
          />
        </UFormField>

        <UAlert v-if="error" :class="$style.authAlert" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" />

        <UButton type="submit" size="lg" block :loading="loading" label="注册" />

        <div :class="$style.formFooter">
          <span :class="$style.formFooterText">已有账号？</span>
          <UButton color="primary" variant="link" size="sm" label="登录" @click="onLogin" />
        </div>
      </UForm>
    </div>
  </div>
</template>

<style module src="./index.module.css"></style>
