import { createRouter, createWebHistory } from 'vue-router'
import { AppShell } from '@/components'
import { useAuthStore } from '@/stores/auth'
import AppsLoader from './apps/Loader.vue'
import ChatLoader from './chat/Loader.vue'
import LoginLoader from './login/Loader.vue'
import PlatformResourceLoader from './platform-resource/Loader.vue'
import ProfileLoader from './profile/Loader.vue'
import RegisterLoader from './register/Loader.vue'
import SettingsLoader from './settings/Loader.vue'
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
          path: 'platform/:module(build|governance|organization)/:resource?',
          name: 'platform-resource',
          component: PlatformResourceLoader,
          meta: { requiresAuth: true },
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
