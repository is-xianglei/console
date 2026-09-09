<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import { nextTick, reactive, ref, useTemplateRef, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError, authErrorMessage } from '@/http'
import { useAuthStore } from '@/stores/auth'
import { safeRedirect } from '@/routes'
import { focusFirstError } from '@/hooks'

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
// UForm 实例类型由 Nuxt UI 全局组件推导；此处仅用其 setErrors，故收窄为最小接口。
const formRef = useTemplateRef('formRef') as Ref<{ setErrors: (errors: FormError[], name?: string) => void } | null>
const formRoot = ref<HTMLElement | null>(null)
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
  return safeRedirect(route.query.redirect) ?? '/chat'
}

async function onLogin() {
  loading.value = true
  error.value = ''

  try {
    await authStore.login(form.email, form.password)
    await router.replace(resolveAuthTarget())
  } catch (cause) {
    const message = authErrorMessage(cause, '登录失败，请检查邮箱和密码')
    if (cause instanceof ApiError && cause.status === 401) {
      // 401 落到密码字段并聚焦，用户无需在全局提示里猜错在哪个字段。
      error.value = ''
      formRef.value?.setErrors([{ name: 'password', message: '邮箱或密码错误' }])
      await nextTick()
      if (formRoot.value) focusFirstError(formRoot.value)
      return
    }
    error.value = message
  } finally {
    loading.value = false
  }
}

function onRegister() {
  void router.push({ name: 'register', query: route.query })
}
</script>

<template>
  <div ref="formRoot" :class="$style.authContainer">
    <div :class="$style.authCard">
      <div :class="$style.authHeader">
        <svg :class="$style.authHex" viewBox="0 0 20 22" fill="none">
          <path d="M10 0L19.66 5.5V16.5L10 22L0.34 16.5V5.5L10 0Z" fill="currentColor" />
        </svg>
        <h1 :class="$style.authTitle">登录到 Hyperreal</h1>
        <p :class="$style.authSubtitle">Agent Console</p>
      </div>

      <UForm
        ref="formRef"
        :class="$style.authForm"
        :state="form"
        :validate="validate"
        :validate-on="['blur']"
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
