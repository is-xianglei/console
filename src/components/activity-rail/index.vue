<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { isNavigationFailure, useRoute, useRouter } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'

defineOptions({ name: 'ActivityRail' })

const route = useRoute()
const router = useRouter()
const rail = ref<HTMLElement | null>(null)
const indicator = ref<HTMLElement | null>(null)
const indicatorX = ref(0)
const indicatorY = ref(0)
const indicatorVisible = ref(false)
const indicatorReady = ref(false)
const mobileLayout = ref(false)
let resizeFrame = 0

const items = [
  { key: 'workbench', label: '应用会话', icon: 'message-square-more', to: '/chat' },
  { key: 'memories', label: '长期记忆', icon: 'brain', to: '/memories' },
  { key: 'build', label: '构建资源', icon: 'boxes', to: '/platform/build/agents' },
  { key: 'market', label: '应用市场', icon: 'store', to: '/apps' },
  { key: 'governance', label: '治理控制台', icon: 'shield-check', to: '/platform/governance/policies' },
  { key: 'organization', label: '组织与权限', icon: 'building-2', to: '/platform/organization/departments' },
]

const activeModule = computed(() => {
  if (route.name === 'chat') return 'workbench'
  if (route.name === 'memories') return 'memories'
  if (route.path.startsWith('/apps')) return 'market'
  if (route.path.startsWith('/skills')) return 'build'
  if (route.name === 'platform-resource') return route.params.module
  return ''
})

// 桌面端导航栏在左侧，气泡朝右；760px 以下导航栏移到底部，气泡朝上。
// sideOffset 0：箭头尖端贴住按钮边缘（框架默认留 8px 空隙）
const isBottomNav = useMediaQuery('(max-width: 760px)')
const tooltipContent = computed(() => ({ side: isBottomNav.value ? 'top' as const : 'right' as const, sideOffset: 0 }))

const indicatorStyle = computed(() => ({
  transform: `translate3d(${indicatorX.value}px, ${indicatorY.value}px, 0)`,
}))

function positionIndicator(activeItem: HTMLElement) {
  const mobile = window.matchMedia('(max-width: 760px)').matches
  const layoutChanged = indicatorVisible.value && mobileLayout.value !== mobile
  const markerWidth = indicator.value?.offsetWidth || (mobile ? 16 : 2)
  const markerHeight = indicator.value?.offsetHeight || (mobile ? 2 : 16)

  if (!indicatorVisible.value || layoutChanged) indicatorReady.value = false
  mobileLayout.value = mobile
  indicatorX.value = mobile ? activeItem.offsetLeft + (activeItem.offsetWidth - markerWidth) / 2 : 0
  indicatorY.value = mobile ? 0 : activeItem.offsetTop + (activeItem.offsetHeight - markerHeight) / 2
  indicatorVisible.value = true
  if (!indicatorReady.value) requestAnimationFrame(() => { indicatorReady.value = true })
}

async function syncIndicator() {
  await nextTick()
  const container = rail.value
  const activeItem = container?.querySelector<HTMLElement>('[data-activity-item][data-active="true"]')
  if (!container || !activeItem) {
    indicatorVisible.value = false
    return
  }
  positionIndicator(activeItem)
}

async function navigate(to: string, event: MouseEvent) {
  positionIndicator(event.currentTarget as HTMLElement)
  try {
    const failure = await router.push(to)
    if (failure && isNavigationFailure(failure)) await syncIndicator()
  } catch {
    await syncIndicator()
  }
}

function onResize() {
  cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => { void syncIndicator() })
}

watch(() => route.fullPath, syncIndicator, { flush: 'post' })
onMounted(() => {
  void syncIndicator()
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(resizeFrame)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <nav ref="rail" :class="$style['activity-rail']" aria-label="平台主导航">
    <span
      ref="indicator"
      v-show="indicatorVisible"
      :class="[$style['rail-indicator'], { [$style.ready]: indicatorReady }]"
      :style="indicatorStyle"
      aria-hidden="true"
    ></span>
    <UTooltip v-for="item in items" :key="item.key" :text="item.label" :content="tooltipContent" arrow>
      <UButton
        color="neutral"
        variant="ghost"
        square
        :class="[$style['rail-item'], { [$style.active]: activeModule === item.key }]"
        data-activity-item
        :data-active="activeModule === item.key"
        :aria-label="item.label"
        :aria-current="activeModule === item.key ? 'page' : undefined"
        @click="navigate(item.to, $event)"
      >
        <i :class="`icon icon-${item.icon}`"></i>
      </UButton>
    </UTooltip>
    <div :class="$style['rail-spacer']"></div>
    <UTooltip text="个人资料" :content="tooltipContent" arrow>
      <UButton
        color="neutral"
        variant="ghost"
        square
        :class="[$style['rail-item'], { [$style.active]: route.name === 'profile' }]"
        data-activity-item
        :data-active="route.name === 'profile'"
        aria-label="个人资料"
        @click="navigate('/profile', $event)"
      >
        <i class="icon icon-circle-user-round"></i>
      </UButton>
    </UTooltip>
    <UTooltip text="平台设置" :content="tooltipContent" arrow>
      <UButton
        color="neutral"
        variant="ghost"
        square
        :class="[$style['rail-item'], { [$style.active]: route.name === 'settings' }]"
        data-activity-item
        :data-active="route.name === 'settings'"
        aria-label="平台设置"
        @click="navigate('/settings', $event)"
      >
        <i class="icon icon-settings"></i>
      </UButton>
    </UTooltip>
  </nav>
</template>

<style module src="./index.module.css"></style>
