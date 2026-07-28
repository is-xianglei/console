<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

defineOptions({ name: 'LoginPage' })

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const form = reactive({
  email: '',
  password: '',
})
const error = ref('')
const loading = ref(false)
function validate(values: Partial<typeof form>): FormError[] {
  const errors: FormError[] = []
  if (!values.email) errors.push({ name: 'email', message: '请输入邮箱' })
  else if (!/^\S+@\S+\.\S+$/.test(values.email)) {
    errors.push({ name: 'email', message: '请输入有效的邮箱地址' })
  }
  if (!values.password) errors.push({ name: 'password', message: '请输入密码' })
  return errors
}

function resolveAuthTarget(): string {
  const redirect = route.query.redirect
  if (
    typeof redirect === 'string' &&
    redirect.startsWith('/') &&
    !redirect.startsWith('//') &&
    !/^\/(login|register)(?:[/?#]|$)/.test(redirect)
  ) {
    return redirect
  }
  return '/chat'
}

async function onLogin() {
  loading.value = true
  error.value = ''

  try {
    await authStore.login(form.email, form.password)
    await router.replace(resolveAuthTarget())
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '登录失败，请检查邮箱和密码'
  } finally {
    loading.value = false
  }
}

function onRegister() {
  void router.push({ name: 'register', query: route.query })
}
</script>

<template>
  <div :class="$style.authContainer">
    <div :class="$style.authCard">
      <div :class="$style.authHeader">
        <svg :class="$style.authHex" viewBox="0 0 20 22" fill="none">
          <path d="M10 0L19.66 5.5V16.5L10 22L0.34 16.5V5.5L10 0Z" fill="currentColor" />
        </svg>
        <h1 :class="$style.authTitle">登录到 Hyperreal</h1>
        <p :class="$style.authSubtitle">Agent Console</p>
      </div>

      <UForm
        :class="$style.authForm"
        :state="form"
        :validate="validate"
        :disabled="loading"
        @submit="onLogin"
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

        <UFormField :class="$style.authField" label="密码" name="password" required>
          <UInput
            v-model="form.password"
            :class="$style.authInput"
            type="password"
            size="lg"
            placeholder="请输入密码"
            autocomplete="current-password"
          />
        </UFormField>

        <UAlert v-if="error" :class="$style.authAlert" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" />

        <UButton type="submit" size="lg" block :loading="loading" label="登录" />

        <div :class="$style.formFooter">
          <span :class="$style.formFooterText">还没有账号？</span>
          <UButton color="primary" variant="link" size="sm" label="注册" @click="onRegister" />
        </div>
      </UForm>
    </div>
  </div>
</template>

<style module src="./index.module.css"></style>
