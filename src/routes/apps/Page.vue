<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RouterLoading } from '@/components'
import { useAuthStore } from '@/stores/auth'
import { getVisibleMarketSections, resolveMarketSection, type MarketAccess, type MarketSection } from './sections'

defineOptions({ name: 'AppsPage' })

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const access = computed<MarketAccess>(() => ({
  role: authStore.currentWorkspace?.membership_role,
  isPlatformAdmin: authStore.isPlatformAdmin,
}))
const sections = computed(() => getVisibleMarketSections(access.value))
// 离开市场时旧页面还在淡出，保持当前模块不变，避免内容闪回「发现」。
const active = computed<MarketSection>((previous) => {
  if (route.name !== 'apps' && previous) return previous
  return resolveMarketSection(route.params.section, access.value)
})
const menuItems = computed<NavigationMenuItem[]>(() => sections.value.map((section) => ({
  label: section.label,
  icon: section.icon,
  to: { name: 'apps', params: { section: section.key } },
  active: section.key === active.value.key,
})))

// 停留期间切换工作区导致当前模块不可见（如「我的上架」），回落到「发现」。
watch(access, () => {
  if (route.name === 'apps' && route.params.section !== active.value.key) {
    void router.replace({ name: 'apps', params: { section: active.value.key } })
  }
})
</script>

<template>
  <main :class="$style.market">
    <div :class="$style.shell">
      <nav :class="$style.nav" aria-label="应用市场">
        <div :class="$style.navTitle">应用市场</div>
        <UNavigationMenu
          orientation="vertical"
          :items="menuItems"
          :ui="{ root: $style.menu, list: $style.menuList, link: $style.menuLink, linkLeadingIcon: $style.menuIcon }"
        />
      </nav>
      <section :class="$style.page" :aria-labelledby="`market-${active.key}`">
        <h2 :id="`market-${active.key}`" :class="$style.title">{{ active.label }}</h2>
        <div :key="active.key" :class="$style.module">
          <Suspense>
            <component :is="active.component" />
            <template #fallback><RouterLoading /></template>
          </Suspense>
        </div>
      </section>
    </div>
  </main>
</template>

<style module src="./index.module.css"></style>
