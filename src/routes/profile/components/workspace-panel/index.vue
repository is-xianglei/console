<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useConsoleStore } from '@/stores/console'

defineOptions({ name: 'WorkspacePanel' })

const router = useRouter()
const authStore = useAuthStore()
const consoleStore = useConsoleStore()
const workspaces = computed(() => authStore.state.workspaces)
const switchingId = ref<number | null>(null)
const error = ref('')

async function onWorkspaceSwitch(workspaceId: number) {
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
  <div :class="$style.formPanel">
    <UAlert v-if="error" :class="$style.feedback" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" />
    <UEmpty v-if="!workspaces.length" :class="$style.empty" variant="naked" icon="i-lucide-building-2" title="暂无工作区" />
    <div v-else :class="$style.workspaceList">
      <div v-for="workspace in workspaces" :key="workspace.id" :class="$style.workspaceItem">
        <div :class="$style.workspaceInfo">
          <div :class="$style.workspaceName">{{ workspace.display_name }}</div>
          <div class="mono" :class="$style.workspaceMeta">{{ workspace.slug }}</div>
        </div>
        <UButton
          :class="$style.secondary"
          color="neutral"
          variant="outline"
          label="切换"
          :disabled="switchingId !== null"
          :loading="switchingId === workspace.id"
          @click="onWorkspaceSwitch(workspace.id)"
        />
      </div>
    </div>
  </div>
</template>

<style module src="./index.module.css"></style>
