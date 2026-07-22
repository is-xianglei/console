import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import AuthView from '../components/auth/AuthView.vue'
import MainLayout from '../layouts/MainLayout.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: AuthView,
      meta: { requiresAuth: false },
    },
    {
      path: '/register',
      name: 'register',
      component: AuthView,
      meta: { requiresAuth: false },
    },
    {
      path: '/',
      component: MainLayout,
      meta: { requiresAuth: true },
      redirect: '/chat',
      children: [
        {
          path: 'chat/:sessionId?',
          name: 'chat',
          component: () => import('../components/chat/ChatArea.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'apps',
          name: 'apps',
          component: () => import('../components/apps/AppCenter.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'skills',
          name: 'skills',
          component: () => import('../components/skills/SkillsView.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'platform/:module(build|governance|organization)/:resource?',
          name: 'platform-resource',
          component: () => import('../components/platform/ResourceWorkbench.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('../components/settings/SettingsView.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'profile',
          name: 'profile',
          component: () => import('../components/user/UserProfile.vue'),
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
