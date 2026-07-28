<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { APPS, FEATURED_APP } from '@/constants/seed'
import { useConsoleStore } from '@/stores/console'

defineOptions({ name: 'AppsPage' })

const router = useRouter()
const { state, launchApp } = useConsoleStore()
const launchFeedback = ref('')

async function onLaunchApp(prompt?: string) {
  if (state.busy) {
    launchFeedback.value = '当前任务仍在执行，请等待完成后再派发新应用。'
    return
  }
  if (prompt && launchApp(prompt)) {
    launchFeedback.value = ''
    await router.push({
      name: 'chat',
      params: state.activeSessionId ? { sessionId: state.activeSessionId } : {},
    })
  }
}

const search = ref('')
const activeCat = ref('全部')

const categories = computed(() => {
  const set = new Set<string>(APPS.map((a) => a.category))
  return ['全部', ...Array.from(set)]
})
const categoryItems = computed(() => categories.value.map((value) => ({ label: value, value })))

const filtered = computed(() =>
  APPS.filter((a) => {
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

        <p v-if="state.busy || launchFeedback" :class="$style['launch-status']" role="status" aria-live="polite">
          {{ launchFeedback || '当前任务正在执行，应用派发暂不可用。' }}
        </p>

        <!-- 推荐卡 -->
        <section :class="[$style.hero, { [$style.disabled]: state.busy }]">
          <div :class="$style['hero-left']">
            <div :class="$style['hero-app']">
              <span :class="$style['hero-ic']"><i :class="`icon icon-${FEATURED_APP.icon}`"></i></span>
              <span :class="[$style['hero-tag'], 'mono']">@{{ FEATURED_APP.name }}</span>
            </div>
            <h2 :class="$style['hero-title']">{{ FEATURED_APP.title }}</h2>
            <p :class="$style['hero-desc']">{{ FEATURED_APP.desc }}</p>
            <UButton
              :class="$style['hero-btn']"
              :disabled="state.busy"
              @click="onLaunchApp(FEATURED_APP.prompt)"
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
            :key="a.tag"
            color="neutral"
            variant="ghost"
            block
            :class="$style['app-row']"
            :disabled="state.busy"
            @click="onLaunchApp(`@${a.name} `)"
          >
            <span :class="$style['app-row-ic']">
              <i :class="`icon icon-${a.icon}`"></i>
            </span>
            <span :class="$style['app-row-text']">
              <span :class="$style['app-row-name']">{{ a.name }}</span>
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
