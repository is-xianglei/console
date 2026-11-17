import { createRouter, createWebHistory } from 'vue-router'
import { AppShell } from '@/components'
import { useAuthStore } from '@/stores/auth'
import AppsLoader from './apps/Loader.vue'
import MarketDetailLoader from './apps/detail/Loader.vue'
import { resolveMarketSection } from './apps/sections'
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
import DepartmentDetailLoader from './platform-resource/organization/departments/detail/Loader.vue'
import GroupDetailLoader from './platform-resource/organization/groups/detail/Loader.vue'
import PersonDetailLoader from './platform-resource/organization/people/detail/Loader.vue'
import TeamCreateLoader from './platform-resource/teams/create/Loader.vue'
import TeamDetailLoader from './platform-resource/teams/detail/Loader.vue'
import TeamEditLoader from './platform-resource/teams/edit/Loader.vue'
import WorkflowCreateLoader from './platform-resource/workflows/create/Loader.vue'
import WorkflowDetailLoader from './platform-resource/workflows/detail/Loader.vue'
import WorkflowEditLoader from './platform-resource/workflows/edit/Loader.vue'
import RegisterLoader from './register/Loader.vue'
import SettingsLoader from './settings/Loader.vue'
import { legacyProfileSection, resolveSettingsSection } from './settings/sections'
import SkillCreateLoader from './skills/create/Loader.vue'
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
          // 应用市场：发现 / 已安装 / 版本更新 / 我的上架 / 审核队列；无权访问的模块由下方守卫重定向到「发现」
          path: 'apps/:section?',
          name: 'apps',
          component: AppsLoader,
          meta: { requiresAuth: true },
        },
        {
          path: 'apps/listings/:id(\\d+)',
          name: 'market-detail',
          component: MarketDetailLoader,
          meta: { requiresAuth: true },
        },
        {
          path: 'skills',
          name: 'skills',
          component: SkillsLoader,
          meta: { requiresAuth: true },
        },
        {
          path: 'skills/new',
          name: 'skill-create',
          component: SkillCreateLoader,
          meta: { requiresAuth: true },
        },
        {
          path: 'skills/:id(\\d+)',
          name: 'skill-detail',
          component: SkillDetailLoader,
          meta: { requiresAuth: true },
        },
        {
          path: 'skills/:id(\\d+)/edit',
          name: 'skill-edit',
          component: SkillEditLoader,
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
          path: 'platform/build/teams/create',
          name: 'team-create',
          component: TeamCreateLoader,
          meta: { requiresAuth: true, platform: true, module: 'build' },
        },
        {
          path: 'platform/build/teams/:id',
          name: 'team-detail',
          component: TeamDetailLoader,
          meta: { requiresAuth: true, platform: true, module: 'build' },
        },
        {
          path: 'platform/build/teams/:id/edit',
          name: 'team-edit',
          component: TeamEditLoader,
          meta: { requiresAuth: true, platform: true, module: 'build' },
        },
        {
          path: 'platform/organization/departments/:id(\\d+)',
          name: 'department-detail',
          component: DepartmentDetailLoader,
          meta: { requiresAuth: true, platform: true, module: 'organization' },
        },
        {
          path: 'platform/organization/groups/:id(\\d+)',
          name: 'group-detail',
          component: GroupDetailLoader,
          meta: { requiresAuth: true, platform: true, module: 'organization' },
        },
        {
          path: 'platform/organization/people/:id(\\d+)',
          name: 'person-detail',
          component: PersonDetailLoader,
          meta: { requiresAuth: true, platform: true, module: 'organization' },
        },
        {
          // 缺省、未知或当前角色不可见的模块由下方守卫统一重定向到个人信息
          path: 'settings/:section?',
          name: 'settings',
          component: SettingsLoader,
          meta: { requiresAuth: true },
        },
        {
          // 旧个人资料页：?tab= 映射到对应设置模块
          path: 'profile',
          redirect: (to) => ({ name: 'settings', params: { section: legacyProfileSection(to.query.tab) }, query: {} }),
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

/** 校验回调跳转地址:仅接受站内相对路径,拒绝 `//` 开头与回调到登录/注册页。 */
export function safeRedirect(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null
  if (/^\/(login|register)(?:[/?#]|$)/.test(value)) return null
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

  // 设置模块可见性依赖当前工作区角色，模块间切换不会重新进入路由，放在全局守卫里校验
  if (to.name === 'settings') {
    const section = resolveSettingsSection(to.params.section, authStore.currentWorkspace?.membership_role).key
    if (to.params.section !== section) return { name: 'settings', params: { section }, query: to.query, hash: to.hash, replace: true }
  }

  // 市场模块可见性：「我的上架」看当前工作区角色，「审核队列」只对平台管理员开放。
  // 重定向不写 replace，沿用原导航的 push / replace：守卫里显式 replace 会顶掉来源页的历史记录，
  // 从带分页参数的列表点「应用市场」后就退不回原来的页码。
  if (to.name === 'apps') {
    const section = resolveMarketSection(to.params.section, {
      role: authStore.currentWorkspace?.membership_role,
      isPlatformAdmin: authStore.isPlatformAdmin,
    }).key
    if (to.params.section !== section) return { name: 'apps', params: { section }, query: to.query, hash: to.hash }
  }

  return true
})

export default router

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
  }
}
