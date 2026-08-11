<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { zh_cn } from '@nuxt/ui/locale'
import { useRouter } from 'vue-router'
import { useConsoleStore } from './stores/console'
import { useAuthStore } from './stores/auth'
import { useAgentsStore } from './stores/agents'
import { useDepartmentsStore } from './stores/departments'
import { useGroupsStore } from './stores/groups'
import { useMemoriesStore } from './stores/memories'
import { useOrchestrationPlansStore } from './stores/orchestrationPlans'
import { useSkillsStore } from './stores/skills'
import { useWorkspacesStore } from './stores/workspaces'

const consoleStore = useConsoleStore()
const authStore = useAuthStore()
const agentsStore = useAgentsStore()
const departmentsStore = useDepartmentsStore()
const groupsStore = useGroupsStore()
const memoriesStore = useMemoriesStore()
const orchestrationPlansStore = useOrchestrationPlansStore()
const skillsStore = useSkillsStore()
const workspacesStore = useWorkspacesStore()
const router = useRouter()
let lifecycleStarted = false

async function loadConsoleForCurrentRoute() {
  const route = router.currentRoute.value
  const preferredSessionId =
    route.name === 'chat' && typeof route.params.sessionId === 'string'
      ? route.params.sessionId
      : undefined

  const ok = await consoleStore.reloadConsole(preferredSessionId)
  if (!ok) consoleStore.seedConversation()

  const current = router.currentRoute.value
  if (current.name !== 'chat') return
  const activeSessionId = consoleStore.state.activeSessionId
  if ((current.params.sessionId ?? '') === activeSessionId) return

  await router.replace({
    name: 'chat',
    params: activeSessionId ? { sessionId: activeSessionId } : {},
    query: current.query,
    hash: current.hash,
  })
}

watch(
  () => authStore.isAuthenticated,
  async (authenticated, previous) => {
    if (!lifecycleStarted || authenticated === previous) return
    if (authenticated) await loadConsoleForCurrentRoute()
    else consoleStore.resetConsole()
  },
)

watch(
  () => authStore.currentWorkspaceId,
  (workspaceId) => {
    agentsStore.resetAgents()
    departmentsStore.resetDepartments(workspaceId)
    groupsStore.resetGroups(workspaceId)
    memoriesStore.resetMemories()
    orchestrationPlansStore.resetPlans()
    skillsStore.resetSkills()
    workspacesStore.resetWorkspaces(workspaceId)
  },
  { immediate: true },
)

// 新会话首次派发后会由 SSE 把本地占位 id 替换成后端 id，同时规范化地址栏。
watch(
  () => consoleStore.state.activeSessionId,
  (sessionId, previousSessionId) => {
    if (!lifecycleStarted || !sessionId || !/^\d+$/.test(sessionId)) return
    const current = router.currentRoute.value
    if (current.name !== 'chat') return
    const routeSessionId = current.params.sessionId
    // 本地草稿升级为后端会话:newSession 不导航,地址栏必然还停在上一个会话,
    // 不规范化就会被 app-shell 的路由跟随watcher 把会话拽回去。
    const promotedLocalSession =
      typeof previousSessionId === 'string' && previousSessionId.startsWith('sess-')
    const createdWithoutPlaceholder = routeSessionId == null || routeSessionId === ''
    if (!promotedLocalSession && !createdWithoutPlaceholder) return

    void router.replace({
      name: 'chat',
      params: { sessionId },
      query: current.query,
      hash: current.hash,
    })
  },
)

onMounted(async () => {
  authStore.setAuthInvalidatedHandler(() => {
    consoleStore.resetConsole()
    const current = router.currentRoute.value
    if (!current.meta.requiresAuth) return
    void router.replace({
      name: 'login',
      query: { redirect: current.fullPath },
    })
  })

  // 初始化认证状态
  await authStore.initialize()
  authStore.startAutoRefresh()
  lifecycleStarted = true

  // 只有已登录才加载会话
  if (authStore.isAuthenticated) {
    await loadConsoleForCurrentRoute()
  } else {
    consoleStore.resetConsole()
  }
})

onBeforeUnmount(() => {
  authStore.setAuthInvalidatedHandler(null)
})
</script>

<template>
  <UApp :locale="zh_cn">
    <router-view />
  </UApp>
</template>
