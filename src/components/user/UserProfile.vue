<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useConsoleStore } from '../../stores/console'
import { updateUser, changePassword } from '../../api/auth'

const router = useRouter()
const authStore = useAuthStore()
const consoleStore = useConsoleStore()

const activeTab = ref<'profile' | 'password' | 'workspaces'>('profile')

// 个人资料表单
const fullName = ref('')
const avatarUrl = ref('')
const phone = ref('')
const profileLoading = ref(false)
const profileError = ref('')
const profileSuccess = ref(false)

// 修改密码表单
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordLoading = ref(false)
const passwordError = ref('')
const passwordSuccess = ref(false)
const switchingWorkspaceId = ref<number | null>(null)
const workspaceError = ref('')

const user = computed(() => authStore.state.user)
const workspaces = computed(() => authStore.state.workspaces)

onMounted(() => {
  if (user.value) {
    fullName.value = user.value.full_name || ''
    avatarUrl.value = user.value.avatar_url || ''
    phone.value = user.value.phone || ''
  }
})

async function handleUpdateProfile() {
  profileLoading.value = true
  profileError.value = ''
  profileSuccess.value = false

  try {
    await updateUser({
      full_name: fullName.value || undefined,
      avatar_url: avatarUrl.value || undefined,
      phone: phone.value || undefined,
    })
    await authStore.loadUser()
    profileSuccess.value = true
    setTimeout(() => {
      profileSuccess.value = false
    }, 3000)
  } catch (e: any) {
    profileError.value = e.message || '更新失败，请稍后重试'
  } finally {
    profileLoading.value = false
  }
}

async function handleChangePassword() {
  passwordError.value = ''

  if (!oldPassword.value || !newPassword.value || !confirmPassword.value) {
    passwordError.value = '请填写所有密码字段'
    return
  }

  if (newPassword.value.length < 6) {
    passwordError.value = '新密码至少 6 个字符'
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = '两次输入的新密码不一致'
    return
  }

  passwordLoading.value = true
  passwordSuccess.value = false

  try {
    await changePassword({
      old_password: oldPassword.value,
      new_password: newPassword.value,
    })
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    passwordSuccess.value = true
    setTimeout(() => {
      passwordSuccess.value = false
    }, 3000)
  } catch (e: any) {
    passwordError.value = e.message || '修改密码失败'
  } finally {
    passwordLoading.value = false
  }
}

async function handleSwitchWorkspace(workspaceId: number) {
  if (switchingWorkspaceId.value !== null) return
  switchingWorkspaceId.value = workspaceId
  workspaceError.value = ''
  try {
    await authStore.switchWorkspace(workspaceId)
    const [userLoaded] = await Promise.all([
      authStore.loadUser(),
      authStore.loadWorkspaces(),
    ])
    if (!userLoaded) throw new Error('登录状态已失效，请重新登录')

    await consoleStore.reloadConsole()
    await router.push({
      name: 'chat',
      params: consoleStore.state.activeSessionId
        ? { sessionId: consoleStore.state.activeSessionId }
        : {},
    })
  } catch (e: any) {
    workspaceError.value = e.message || '切换工作区失败，请稍后重试'
  } finally {
    switchingWorkspaceId.value = null
  }
}
</script>

<template>
  <div class="profile-container">
    <div class="profile-card">
      <div class="profile-header">
        <h1 class="profile-title">用户资料</h1>
        <div v-if="user" class="profile-user-info">
          <div class="profile-avatar">
            <img v-if="user.avatar_url" :src="user.avatar_url" alt="Avatar" />
            <span v-else class="avatar-placeholder">{{ user.username[0].toUpperCase() }}</span>
          </div>
          <div class="profile-user-text">
            <div class="profile-username mono">{{ user.username }}</div>
            <div class="profile-email">{{ user.email }}</div>
          </div>
        </div>
      </div>

      <div class="profile-tabs">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'profile' }"
          @click="activeTab = 'profile'"
        >
          个人信息
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'password' }"
          @click="activeTab = 'password'"
        >
          修改密码
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'workspaces' }"
          @click="activeTab = 'workspaces'"
        >
          工作区
        </button>
      </div>

      <div class="profile-content">
        <!-- 个人信息 -->
        <div v-if="activeTab === 'profile'" class="tab-panel">
          <div class="form-group">
            <label class="form-label">全名</label>
            <input v-model="fullName" type="text" class="form-input" placeholder="您的真实姓名" />
          </div>

          <div class="form-group">
            <label class="form-label">头像 URL</label>
            <input v-model="avatarUrl" type="text" class="form-input" placeholder="https://..." />
          </div>

          <div class="form-group">
            <label class="form-label">手机号</label>
            <input v-model="phone" type="text" class="form-input" placeholder="+86 ..." />
          </div>

          <div v-if="profileError" class="form-error">
            {{ profileError }}
          </div>

          <div v-if="profileSuccess" class="form-success">
            更新成功
          </div>

          <button class="btn-primary" :disabled="profileLoading" @click="handleUpdateProfile">
            {{ profileLoading ? '保存中...' : '保存' }}
          </button>
        </div>

        <!-- 修改密码 -->
        <div v-if="activeTab === 'password'" class="tab-panel">
          <div class="form-group">
            <label class="form-label">当前密码</label>
            <input
              v-model="oldPassword"
              type="password"
              class="form-input"
              placeholder="输入当前密码"
            />
          </div>

          <div class="form-group">
            <label class="form-label">新密码</label>
            <input
              v-model="newPassword"
              type="password"
              class="form-input"
              placeholder="至少 6 个字符"
            />
          </div>

          <div class="form-group">
            <label class="form-label">确认新密码</label>
            <input
              v-model="confirmPassword"
              type="password"
              class="form-input"
              placeholder="再次输入新密码"
            />
          </div>

          <div v-if="passwordError" class="form-error">
            {{ passwordError }}
          </div>

          <div v-if="passwordSuccess" class="form-success">
            密码修改成功
          </div>

          <button class="btn-primary" :disabled="passwordLoading" @click="handleChangePassword">
            {{ passwordLoading ? '修改中...' : '修改密码' }}
          </button>
        </div>

        <!-- 工作区 -->
        <div v-if="activeTab === 'workspaces'" class="tab-panel">
          <div v-if="workspaceError" class="form-error" role="alert">
            {{ workspaceError }}
          </div>
          <div v-if="workspaces.length === 0" class="empty-state">
            暂无工作区
          </div>
          <div v-else class="workspace-list">
            <div
              v-for="ws in workspaces"
              :key="ws.id"
              class="workspace-item"
            >
              <div class="workspace-info">
                <div class="workspace-name">{{ ws.display_name }}</div>
                <div class="workspace-meta mono">{{ ws.slug }}</div>
              </div>
              <button
                class="btn-secondary"
                :disabled="switchingWorkspaceId !== null"
                @click="handleSwitchWorkspace(ws.id)"
              >
                {{ switchingWorkspaceId === ws.id ? '切换中...' : '切换' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--bg-deep);
  padding: 20px;
}

.profile-card {
  width: 100%;
  max-width: 640px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 32px;
}

.profile-header {
  margin-bottom: 24px;
}

.profile-title {
  font-family: var(--font-ui);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--text-primary);
  margin-bottom: 20px;
}

.profile-user-info {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.profile-avatar {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-md);
  overflow: hidden;
  flex-shrink: 0;
}

.profile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-agent-dim);
  color: var(--accent-agent);
  font-family: var(--font-ui);
  font-size: 24px;
  font-weight: 700;
}

.profile-user-text {
  flex: 1;
}

.profile-username {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.profile-email {
  font-size: 12px;
  color: var(--text-muted);
}

.profile-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  margin-bottom: 24px;
}

.tab-btn {
  flex: 1;
  height: 36px;
  padding: 0 16px;
  background: transparent;
  border: none;
  border-radius: var(--radius-control);
  color: var(--text-muted);
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}

.tab-btn:hover {
  color: var(--text-secondary);
  background: var(--bg-hover);
}

.tab-btn.active {
  background: var(--bg-panel);
  color: var(--accent-agent);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.profile-content {
  min-height: 300px;
}

.tab-panel {
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

.form-success {
  padding: 10px 14px;
  background: rgba(52, 211, 153, 0.1);
  border: 1px solid var(--status-success);
  border-radius: var(--radius-control);
  color: var(--status-success);
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

.btn-secondary {
  height: 32px;
  padding: 0 16px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}

.btn-secondary:hover:not(:disabled) {
  border-color: var(--accent-agent);
  color: var(--accent-agent);
}
.btn-secondary:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: var(--text-dim);
  font-size: 13px;
}

.workspace-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.workspace-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: all var(--dur-fast) var(--ease-out);
}

.workspace-item:hover {
  border-color: var(--border-visible);
  background: var(--bg-elevated);
}

.workspace-info {
  flex: 1;
}

.workspace-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.workspace-meta {
  font-size: 11px;
  color: var(--text-dim);
}
</style>
