<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../../stores/auth'
import { useConsoleStore } from '../../../stores/console'

const router = useRouter()
const authStore = useAuthStore()
const consoleStore = useConsoleStore()
const workspaces = computed(() => authStore.state.workspaces)
const switchingId = ref<number | null>(null)
const error = ref('')

async function switchWorkspace(workspaceId: number) {
  if (switchingId.value !== null) return
  switchingId.value = workspaceId
  error.value = ''
  try {
    await authStore.switchWorkspace(workspaceId)
    const [userLoaded] = await Promise.all([authStore.loadUser(), authStore.loadWorkspaces()])
    if (!userLoaded) throw new Error('登录状态已失效，请重新登录')

    await consoleStore.reloadConsole()
    await router.push({
      name: 'chat',
      params: consoleStore.state.activeSessionId
        ? { sessionId: consoleStore.state.activeSessionId }
        : {},
    })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '切换工作区失败，请稍后重试'
  } finally {
    switchingId.value = null
  }
}
</script>

<template>
  <div class="profile-form-panel">
    <div v-if="error" class="profile-feedback error" role="alert">{{ error }}</div>
    <div v-if="!workspaces.length" class="profile-empty">暂无工作区</div>
    <div v-else class="profile-workspace-list">
      <div v-for="workspace in workspaces" :key="workspace.id" class="profile-workspace-item">
        <div class="profile-workspace-info">
          <div class="profile-workspace-name">{{ workspace.display_name }}</div>
          <div class="profile-workspace-meta mono">{{ workspace.slug }}</div>
        </div>
        <button
          class="profile-secondary"
          type="button"
          :disabled="switchingId !== null"
          @click="switchWorkspace(workspace.id)"
        >
          {{ switchingId === workspace.id ? '切换中...' : '切换' }}
        </button>
      </div>
    </div>
  </div>
</template>
