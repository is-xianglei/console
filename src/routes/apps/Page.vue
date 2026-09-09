<script setup lang="ts">
import { useToast } from '@nuxt/ui/composables'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getApps, FEATURED_APP } from '@/constants/seed'
import { useConsoleStore } from '@/stores/console'
import type { AppTile } from '@/interfaces/app/model'

defineOptions({ name: 'AppsPage' })

const router = useRouter()
const { state, openApp, launchApp } = useConsoleStore()
const toast = useToast()

/** 应用因未启用/缺权限而不可点击。返回原因文案,可用则为 null。
 *  入参收窄为 enabled/permission,便于推荐卡与列表卡共用。 */
function unavailableReason(app: Pick<AppTile, 'enabled' | 'permission'>): string | null {
  if (app.enabled === false) return '该应用暂未启用'
  if (app.permission) return `需要额外授权：${app.permission.label}`
  return null
}

const featuredDisabled = computed(() => !!unavailableReason(FEATURED_APP))

async function onLaunchApp(prompt?: string) {
  if (state.busy) {
    toast.add({ title: '当前会话正在生成，请稍后', color: 'warning', icon: 'i-lucide-circle-alert' })
    return
  }
  if (prompt && launchApp(prompt)) {
    void router.push({
      name: 'chat',
      params: state.activeSessionId ? { sessionId: state.activeSessionId } : {},
    })
  }
}

function onOpenApp(app: AppTile) {
  const reason = unavailableReason(app)
  if (reason) {
    toast.add({ title: reason, color: 'warning', icon: 'i-lucide-circle-alert' })
    return
  }
  if (state.busy) {
    toast.add({ title: '当前会话正在生成，请稍后', color: 'warning', icon: 'i-lucide-circle-alert' })
    return
  }
  // 点击卡片:先 openApp 真正绑定应用到工作台（可选会话恢复/切分屏）,再带提示词启动。
  openApp(app.id)
  void onLaunchApp(`@${app.name} `)
}

function onOpenFeatured() {
  const reason = unavailableReason(FEATURED_APP)
  if (reason) {
    toast.add({ title: reason, color: 'warning', icon: 'i-lucide-circle-alert' })
    return
  }
  if (state.busy) {
    toast.add({ title: '当前会话正在生成，请稍后', color: 'warning', icon: 'i-lucide-circle-alert' })
    return
  }
  openApp(FEATURED_APP.id)
  void onLaunchApp(FEATURED_APP.prompt)
}

const search = ref('')
const activeCat = ref('全部')

const apps = computed(() => getApps())
const categories = computed(() => {
  const set = new Set<string>(apps.value.map((a) => a.category))
  return ['全部', ...Array.from(set)]
})
const categoryItems = computed(() => categories.value.map((value) => ({ label: value, value })))

const filtered = computed(() =>
  apps.value.filter((a) => {
    const matchCat = activeCat.value === '全部' || a.category === activeCat.value
    const q = search.value.toLowerCase()
    const matchQ =
      !q || a.name.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q)
    return matchCat && matchQ
  }),
)
</script>

<template>
  <main :class="[$style['app-center'], 'grid-bg']">
    <div :class="$style['ac-scroll']">
      <div :class="$style['ac-inner']">
        <!-- 标题栏 -->
        <header :class="$style['ac-head']">
          <div :class="$style['ac-head-text']">
            <h1 :class="$style['ac-title']">应用中心</h1>
            <p :class="$style['ac-sub']">在 Hyperreal 中调用你的工业智能体应用</p>
          </div>
          <div :class="$style['ac-search']">
            <UInput
              v-model="search"
              :class="$style['ac-search-input']"
              aria-label="搜索应用"
              placeholder="搜索应用…"
            >
              <template #leading><i class="icon icon-search"></i></template>
            </UInput>
          </div>
        </header>

        <!-- 推荐卡 -->
        <section :class="[$style.hero, { [$style.disabled]: state.busy || featuredDisabled }]">
          <div :class="$style['hero-left']">
            <div :class="$style['hero-app']">
              <span :class="$style['hero-ic']"><i :class="`icon icon-${FEATURED_APP.icon}`"></i></span>
              <span :class="[$style['hero-tag'], 'mono']">@{{ FEATURED_APP.name }}</span>
            </div>
            <h2 :class="$style['hero-title']">{{ FEATURED_APP.title }}</h2>
            <p :class="$style['hero-desc']">{{ FEATURED_APP.desc }}</p>
            <UButton
              :class="$style['hero-btn']"
              :disabled="state.busy || featuredDisabled"
              @click="onOpenFeatured"
            >
              立即派发 <i class="icon icon-arrow-right"></i>
            </UButton>
          </div>
          <div :class="$style['hero-right']">
            <span :class="[$style['hero-prompt'], 'mono']">{{ FEATURED_APP.prompt }}</span>
          </div>
        </section>

        <!-- 分类标签 -->
        <UTabs v-model="activeCat" :class="$style['cat-tabs']" :items="categoryItems" :content="false" variant="pill" size="sm" />

        <!-- 应用列表(双列) -->
        <section :class="$style['app-list']">
          <UButton
            v-for="a in filtered"
            :key="a.id"
            color="neutral"
            variant="ghost"
            block
            :class="[$style['app-row'], { [$style['app-disabled']]: !!unavailableReason(a) }]"
            :disabled="state.busy || !!unavailableReason(a)"
            @click="onOpenApp(a)"
          >
            <span :class="$style['app-row-ic']">
              <i :class="`icon icon-${a.icon}`"></i>
            </span>
            <span :class="$style['app-row-text']">
              <span :class="$style['app-row-name']">
                {{ a.name }}
                <em v-if="unavailableReason(a)" :class="$style['app-row-reason']">（{{ unavailableReason(a) }}）</em>
              </span>
              <span :class="$style['app-row-desc']">{{ a.desc }}</span>
            </span>
            <i :class="['icon', 'icon-chevron-right', $style['app-row-arrow']]"></i>
          </UButton>
          <UEmpty v-if="!filtered.length" :class="$style['app-empty']" icon="i-lucide-search-x" title="未找到匹配的应用" />
        </section>
      </div>
    </div>
  </main>
</template>

<style module src="./index.module.css"></style>
