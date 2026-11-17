<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RouterLoading } from '@/components'
import { useAuthStore } from '@/stores/auth'
import { getVisibleSettingsSections, resolveSettingsSection, type SettingsSection } from './sections'

defineOptions({ name: 'SettingsPage' })

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const role = computed(() => authStore.currentWorkspace?.membership_role)
const sections = computed(() => getVisibleSettingsSections(role.value))
// 离开设置页时旧页面还在淡出，保持当前模块不变，避免内容闪回个人信息。
const active = computed<SettingsSection>((previous) => (
  route.name !== 'settings' && previous ? previous : resolveSettingsSection(route.params.section, role.value)
))
const menuItems = computed<NavigationMenuItem[]>(() => sections.value.map((section) => ({
  label: section.label,
  icon: section.icon,
  to: { name: 'settings', params: { section: section.key } },
  active: section.key === active.value.key,
})))

// 停留期间切换工作区导致当前模块不可见时，回落到个人信息。
watch(role, () => {
  if (route.name === 'settings' && route.params.section !== active.value.key) {
    void router.replace({ name: 'settings', params: { section: active.value.key } })
  }
})
</script>

<template>
  <main :class="$style.settings">
    <div :class="$style.shell">
      <nav :class="$style.nav" aria-label="设置">
        <div :class="$style.navTitle">设置</div>
        <UNavigationMenu
          orientation="vertical"
          :items="menuItems"
          :ui="{ root: $style.menu, list: $style.menuList, link: $style.menuLink, linkLeadingIcon: $style.menuIcon }"
        />
      </nav>
      <section :class="$style.page" :aria-labelledby="`settings-${active.key}`">
        <h2 :id="`settings-${active.key}`" :class="$style.title">{{ active.label }}</h2>
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
