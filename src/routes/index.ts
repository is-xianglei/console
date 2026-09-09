import { createRouter, createWebHistory } from 'vue-router'
import { AppShell } from '@/components'
import { useAuthStore } from '@/stores/auth'
import AppsLoader from './apps/Loader.vue'
import ChatLoader from './chat/Loader.vue'
import LoginLoader from './login/Loader.vue'
import MemoriesLoader from './memories/Loader.vue'
import MemoryCreateLoader from './memories/create/Loader.vue'
import MemoryDetailLoader from './memories/detail/Loader.vue'
import MemoryEditLoader from './memories/edit/Loader.vue'
import PlatformResourceLoader from './platform-resource/Loader.vue'
import AgentCreateLoader from './platform-resource/agents/create/Loader.vue'
import AgentDetailLoader from './platform-resource/agents/detail/Loader.vue'
import AgentEditLoader from './platform-resource/agents/edit/Loader.vue'
import DepartmentCreateLoader from './platform-resource/organization/departments/create/Loader.vue'
import DepartmentDetailLoader from './platform-resource/organization/departments/detail/Loader.vue'
import DepartmentEditLoader from './platform-resource/organization/departments/edit/Loader.vue'
import GroupCreateLoader from './platform-resource/organization/groups/create/Loader.vue'
import GroupDetailLoader from './platform-resource/organization/groups/detail/Loader.vue'
import GroupEditLoader from './platform-resource/organization/groups/edit/Loader.vue'
import PersonCreateLoader from './platform-resource/organization/people/create/Loader.vue'
import PersonDetailLoader from './platform-resource/organization/people/detail/Loader.vue'
import PersonEditLoader from './platform-resource/organization/people/edit/Loader.vue'
import PlanCreateLoader from './platform-resource/plans/create/Loader.vue'
import PlanDetailLoader from './platform-resource/plans/detail/Loader.vue'
import PlanEditLoader from './platform-resource/plans/edit/Loader.vue'
import WorkflowCreateLoader from './platform-resource/workflows/create/Loader.vue'
import WorkflowDetailLoader from './platform-resource/workflows/detail/Loader.vue'
import WorkflowEditLoader from './platform-resource/workflows/edit/Loader.vue'
import ProfileLoader from './profile/Loader.vue'
import RegisterLoader from './register/Loader.vue'
import SettingsLoader from './settings/Loader.vue'
import SkillDetailLoader from './skills/detail/Loader.vue'
import SkillEditLoader from './skills/edit/Loader.vue'
import SkillsLoader from './skills/Loader.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginLoader,
      meta: { requiresAuth: false },
    },
    {
      path: '/register',
      name: 'register',
      component: RegisterLoader,
      meta: { requiresAuth: false },
    },
    {
      path: '/',
      component: AppShell,
      meta: { requiresAuth: true },
      redirect: '/chat',
      children: [
        {
          path: 'chat/:sessionId?',
          name: 'chat',
          component: ChatLoader,
          meta: { requiresAuth: true },
        },
        {
          path: 'apps',
          name: 'apps',
          component: AppsLoader,
          meta: { requiresAuth: true },
        },
        {
          path: 'skills',
          name: 'skills',
          component: SkillsLoader,
          meta: { requiresAuth: true },
        },
        {
          // skills 的 :name 是字符串（slug / 文件名，可能含 .zip），不能像 memories 用 (\d+)。
          path: 'skills/:name/edit',
          name: 'skill-edit',
          component: SkillEditLoader,
          meta: { requiresAuth: true },
        },
        {
          path: 'skills/:name',
          name: 'skill-detail',
          component: SkillDetailLoader,
          meta: { requiresAuth: true },
        },
        {
          path: 'memories',
          name: 'memories',
          component: MemoriesLoader,
          meta: { requiresAuth: true },
        },
        {
          path: 'memories/create',
          name: 'memory-create',
          component: MemoryCreateLoader,
          meta: { requiresAuth: true },
        },
        {
          path: 'memories/:id(\\d+)',
          name: 'memory-detail',
          component: MemoryDetailLoader,
          meta: { requiresAuth: true },
        },
        {
          path: 'memories/:id(\\d+)/edit',
          name: 'memory-edit',
          component: MemoryEditLoader,
          meta: { requiresAuth: true },
        },
        {
          path: 'platform/:module(build|governance|organization)/:resource?',
          name: 'platform-resource',
          component: PlatformResourceLoader,
          meta: { requiresAuth: true },
        },
        {
          path: 'platform/build/agents/create',
          name: 'agent-create',
          component: AgentCreateLoader,
          meta: { requiresAuth: true, platform: true, module: 'build' },
        },
        {
          path: 'platform/build/agents/:id(\\d+)',
          name: 'agent-detail',
          component: AgentDetailLoader,
          meta: { requiresAuth: true, platform: true, module: 'build' },
        },
        {
          path: 'platform/build/agents/:id(\\d+)/edit',
          name: 'agent-edit',
          component: AgentEditLoader,
          meta: { requiresAuth: true, platform: true, module: 'build' },
        },
        {
          path: 'platform/build/workflows/create',
          name: 'workflow-create',
          component: WorkflowCreateLoader,
          meta: { requiresAuth: true, platform: true, module: 'build' },
        },
        {
          path: 'platform/build/workflows/:id(\\d+)',
          name: 'workflow-detail',
          component: WorkflowDetailLoader,
          meta: { requiresAuth: true, platform: true, module: 'build' },
        },
        {
          path: 'platform/build/workflows/:id(\\d+)/edit',
          name: 'workflow-edit',
          component: WorkflowEditLoader,
          meta: { requiresAuth: true, platform: true, module: 'build' },
        },
        {
          path: 'platform/build/plans/create',
          name: 'plan-create',
          component: PlanCreateLoader,
          meta: { requiresAuth: true, platform: true, module: 'build' },
        },
        {
          path: 'platform/build/plans/:id(\\d+)',
          name: 'plan-detail',
          component: PlanDetailLoader,
          meta: { requiresAuth: true, platform: true, module: 'build' },
        },
        {
          path: 'platform/build/plans/:id(\\d+)/edit',
          name: 'plan-edit',
          component: PlanEditLoader,
          meta: { requiresAuth: true, platform: true, module: 'build' },
        },
        {
          path: 'platform/organization/departments/create',
          name: 'department-create',
          component: DepartmentCreateLoader,
          meta: { requiresAuth: true, platform: true, module: 'organization' },
        },
        {
          path: 'platform/organization/departments/:id(\\d+)',
          name: 'department-detail',
          component: DepartmentDetailLoader,
          meta: { requiresAuth: true, platform: true, module: 'organization' },
        },
        {
          path: 'platform/organization/departments/:id(\\d+)/edit',
          name: 'department-edit',
          component: DepartmentEditLoader,
          meta: { requiresAuth: true, platform: true, module: 'organization' },
        },
        {
          path: 'platform/organization/groups/create',
          name: 'group-create',
          component: GroupCreateLoader,
          meta: { requiresAuth: true, platform: true, module: 'organization' },
        },
        {
          path: 'platform/organization/groups/:id(\\d+)',
          name: 'group-detail',
          component: GroupDetailLoader,
          meta: { requiresAuth: true, platform: true, module: 'organization' },
        },
        {
          path: 'platform/organization/groups/:id(\\d+)/edit',
          name: 'group-edit',
          component: GroupEditLoader,
          meta: { requiresAuth: true, platform: true, module: 'organization' },
        },
        {
          path: 'platform/organization/people/create',
          name: 'person-create',
          component: PersonCreateLoader,
          meta: { requiresAuth: true, platform: true, module: 'organization' },
        },
        {
          path: 'platform/organization/people/:id(\\d+)',
          name: 'person-detail',
          component: PersonDetailLoader,
          meta: { requiresAuth: true, platform: true, module: 'organization' },
        },
        {
          path: 'platform/organization/people/:id(\\d+)/edit',
          name: 'person-edit',
          component: PersonEditLoader,
          meta: { requiresAuth: true, platform: true, module: 'organization' },
        },
        {
          path: 'settings',
          name: 'settings',
          component: SettingsLoader,
          meta: { requiresAuth: true },
        },
        {
          path: 'profile',
          name: 'profile',
          component: ProfileLoader,
          meta: { requiresAuth: true },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return
  if (/^\/(login|register)(?:[/?#]|$)/.test(value)) return
  return value
}

// 路由守卫必须等待本地登录态恢复完成，避免刷新受保护页面时误判未登录。
router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  await authStore.initialize()

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return {
      name: 'login',
      query: { redirect: to.fullPath },
      replace: true,
    }
  }

  if ((to.name === 'login' || to.name === 'register') && authStore.isAuthenticated) {
    return safeRedirect(to.query.redirect) ?? { name: 'chat' }
  }

  return true
})

export default router

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
  }
}
