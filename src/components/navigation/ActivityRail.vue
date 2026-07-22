<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { isNavigationFailure, useRoute, useRouter } from 'vue-router'

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
  { key: 'build', label: '构建资源', icon: 'boxes', to: '/platform/build/agents' },
  { key: 'market', label: '应用市场', icon: 'store', to: '/apps' },
  { key: 'governance', label: '治理控制台', icon: 'shield-check', to: '/platform/governance/policies' },
  { key: 'organization', label: '组织与权限', icon: 'building-2', to: '/platform/organization/departments' },
]

const activeModule = computed(() => {
  if (route.name === 'chat') return 'workbench'
  if (route.name === 'apps') return 'market'
  if (route.name === 'skills') return 'build'
  if (route.name === 'platform-resource') return route.params.module
  return ''
})

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
  const activeItem = container?.querySelector<HTMLElement>('.rail-item.active')
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

function handleResize() {
  cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => { void syncIndicator() })
}

watch(() => route.fullPath, syncIndicator, { flush: 'post' })
onMounted(() => {
  void syncIndicator()
  window.addEventListener('resize', handleResize)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(resizeFrame)
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <nav ref="rail" class="activity-rail" aria-label="平台主导航">
    <span
      ref="indicator"
      v-show="indicatorVisible"
      class="rail-indicator"
      :class="{ ready: indicatorReady }"
      :style="indicatorStyle"
      aria-hidden="true"
    ></span>
    <button
      v-for="item in items"
      :key="item.key"
      class="rail-item"
      :class="{ active: activeModule === item.key }"
      :title="item.label"
      :aria-label="item.label"
      :aria-current="activeModule === item.key ? 'page' : undefined"
      @click="navigate(item.to, $event)"
    >
      <i :class="`icon icon-${item.icon}`"></i>
    </button>
    <div class="rail-spacer"></div>
    <button
      class="rail-item"
      :class="{ active: route.name === 'profile' }"
      title="个人资料"
      aria-label="个人资料"
      @click="navigate('/profile', $event)"
    >
      <i class="icon icon-circle-user-round"></i>
    </button>
    <button
      class="rail-item"
      :class="{ active: route.name === 'settings' }"
      title="平台设置"
      aria-label="平台设置"
      @click="navigate('/settings', $event)"
    >
      <i class="icon icon-settings"></i>
    </button>
  </nav>
</template>

<style scoped>
.activity-rail {
  width: 48px;
  flex: 0 0 48px;
  background: var(--bg-panel);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 0;
  position: relative;
  z-index: 4;
}
.rail-item {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
  position: relative;
  transition: color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.rail-item:hover {
  color: var(--text-secondary);
  background: var(--bg-surface);
}
.rail-item:active {
  transform: scale(0.95);
}
.rail-item.active {
  color: var(--accent-agent);
  background: var(--accent-agent-dim);
}
.rail-indicator {
  position: absolute;
  z-index: 2;
  left: 0;
  top: 0;
  width: 2px;
  height: 16px;
  border-radius: 0 2px 2px 0;
  background: var(--accent-agent);
  box-shadow: 0 0 8px var(--accent-agent-glow);
  pointer-events: none;
  will-change: transform;
}
.rail-indicator.ready {
  transition: transform var(--dur-med) var(--ease-out), opacity var(--dur-fast) var(--ease-out);
}
.rail-item i {
  font-size: 17px;
}
.rail-spacer {
  flex: 1;
}
@media (max-width: 760px) {
  .activity-rail {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    height: 50px;
    border-right: 0;
    border-top: 1px solid var(--border);
    flex-direction: row;
    justify-content: space-around;
    padding: 5px 8px;
  }
  .rail-spacer {
    display: none;
  }
  .rail-indicator {
    width: 16px;
    height: 2px;
    border-radius: 0 0 2px 2px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .rail-item,
  .rail-indicator.ready {
    transition-duration: 1ms;
  }
}
</style>
