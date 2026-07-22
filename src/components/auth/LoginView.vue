<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'

const emit = defineEmits<{
  switchToRegister: []
}>()

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

function postAuthTarget(): string {
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

async function handleLogin() {
  if (!email.value || !password.value) {
    error.value = '请填写邮箱和密码'
    return
  }

  loading.value = true
  error.value = ''

  try {
    await authStore.login(email.value, password.value)
    await router.replace(postAuthTarget())
  } catch (e: any) {
    error.value = e.message || '登录失败，请检查邮箱和密码'
  } finally {
    loading.value = false
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    handleLogin()
  }
}
</script>

<template>
  <div class="auth-container">
    <div class="auth-card">
      <div class="auth-header">
        <svg class="auth-hex" viewBox="0 0 20 22" fill="none">
          <path d="M10 0L19.66 5.5V16.5L10 22L0.34 16.5V5.5L10 0Z" fill="currentColor" />
        </svg>
        <h1 class="auth-title">登录到 Hyperreal</h1>
        <p class="auth-subtitle">Agent Console</p>
      </div>

      <div class="auth-form">
        <div class="form-group">
          <label class="form-label">邮箱</label>
          <input
            v-model="email"
            type="email"
            class="form-input"
            placeholder="your@email.com"
            autocomplete="email"
            @keydown="handleKeydown"
          />
        </div>

        <div class="form-group">
          <label class="form-label">密码</label>
          <input
            v-model="password"
            type="password"
            class="form-input"
            placeholder="••••••••"
            autocomplete="current-password"
            @keydown="handleKeydown"
          />
        </div>

        <div v-if="error" class="form-error">
          {{ error }}
        </div>

        <button class="btn-primary" :disabled="loading" @click="handleLogin">
          {{ loading ? '登录中...' : '登录' }}
        </button>

        <div class="form-footer">
          <span class="form-footer-text">还没有账号？</span>
          <button class="btn-link" @click="emit('switchToRegister')">注册</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--bg-deep);
  padding: 20px;
}

.auth-card {
  width: 100%;
  max-width: 420px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 40px 32px;
}

.auth-header {
  text-align: center;
  margin-bottom: 32px;
}

.auth-hex {
  width: 32px;
  height: 32px;
  color: var(--accent-agent);
  margin: 0 auto 16px;
}

.auth-title {
  font-family: var(--font-ui);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.auth-subtitle {
  font-family: var(--font-data);
  font-size: 12px;
  color: var(--text-dim);
  letter-spacing: 0.04em;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.form-input {
  width: 100%;
  height: 42px;
  padding: 0 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 13px;
  transition: all var(--dur-fast) var(--ease-out);
}

.form-input:focus {
  outline: none;
  border-color: var(--accent-agent);
  box-shadow: 0 0 0 3px var(--accent-agent-dim), 0 0 12px var(--accent-agent-glow);
}

.form-input::placeholder {
  color: var(--text-dim);
}

.form-error {
  padding: 10px 14px;
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid var(--status-error);
  border-radius: var(--radius-control);
  color: var(--status-error);
  font-size: 12px;
  line-height: 1.5;
}

.btn-primary {
  height: 42px;
  padding: 0 20px;
  background: var(--accent-agent);
  border: none;
  border-radius: var(--radius-control);
  color: #0a0a0a;
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-agent-hover);
  box-shadow: 0 0 16px var(--accent-agent-glow);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
}

.form-footer-text {
  font-size: 12px;
  color: var(--text-muted);
}

.btn-link {
  background: none;
  border: none;
  color: var(--accent-agent);
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease-out);
}

.btn-link:hover {
  color: var(--accent-agent-hover);
}
</style>
