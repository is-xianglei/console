<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useCssModule, watch } from 'vue'
import type { TimelineItem } from '@nuxt/ui'
import type { Task, TaskState } from '@/interfaces/console/model'
import { useConsoleStore } from '@/stores/console'

defineOptions({ name: 'TaskBar' })

const { state } = useConsoleStore()
const styles = useCssModule()
const open = ref(true)
let closeTimer: ReturnType<typeof setTimeout> | null = null

const stateLabel: Record<string, string> = {
  queued: '排队',
  active: '运行中',
  done: '完成',
  error: '失败',
  think: '推理中',
  run: '执行中',
}
const STATE_ICON: Record<TaskState, string> = {
  queued: 'i-lucide-circle-dashed',
  active: 'i-lucide-circle-arrow-right',
  done: 'i-lucide-circle-check',
  error: 'i-lucide-circle-x',
}

const hasTasks = computed(() => state.tasks.length > 0)
const doneCount = computed(() => state.tasks.filter((t) => t.state === 'done').length)
const activeCount = computed(() => state.tasks.filter((t) => t.state === 'active').length)
const errorCount = computed(() => state.tasks.filter((t) => t.state === 'error').length)
const allDone = computed(
  () => hasTasks.value && doneCount.value === state.tasks.length && !errorCount.value,
)
/** 头部图标的"运行中"态:存在正在执行的任务时显示旋转环 */
const running = computed(() => activeCount.value > 0 && !allDone.value)
const progress = computed(() =>
  state.tasks.length ? (doneCount.value / state.tasks.length) * 100 : 0,
)

// 完成的任务 id 集合:用于判断某任务的阻塞是否已解除
const doneIds = computed(
  () => new Set(state.tasks.filter((t) => t.state === 'done').map((t) => Number(t.id))),
)
/** 该任务是否仍被未完成的上游阻塞(据此在 UI 上置灰/标记) */
function blockingIds(t: Task): number[] {
  return (t.blockedBy ?? []).filter((id) => !doneIds.value.has(id))
}

const summary = computed(() => {
  if (!state.tasks.length) return '0 / 0 待命'
  const tail = errorCount.value ? '有失败' : activeCount.value ? '运行中' : '完成'
  return `${doneCount.value} / ${state.tasks.length} ${tail}`
})
const badgeColor = computed(() => errorCount.value ? 'error' : activeCount.value ? 'info' : allDone.value ? 'success' : 'neutral')

const items = computed<TimelineItem[]>(() => state.tasks.map((t, i) => ({
  value: t.id,
  icon: STATE_ICON[t.state],
  title: t.name,
  description: t.description,
  index: i,
  task: t,
  stateLabel: stateLabel[t.state] ?? t.state,
  blocked: blockingIds(t),
  ui: { indicator: [styles.indicator, styles[t.state]] },
})))

function itemTask(item: TimelineItem): Task {
  return item.task as Task
}

// 有新任务出现时自动展开;全部完成后延时自动收起
let prevHas = false
watch(
  () => [hasTasks.value, allDone.value] as [boolean, boolean],
  ([has, done]) => {
    if (closeTimer) {
      clearTimeout(closeTimer)
      closeTimer = null
    }
    if (has && !prevHas) open.value = true
    prevHas = has
    if (done) {
      closeTimer = setTimeout(() => {
        open.value = false
      }, 2500)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (closeTimer) clearTimeout(closeTimer)
})
</script>

<template>
  <div v-if="hasTasks" :class="$style.wrap">
    <UCollapsible v-model:open="open" :class="$style.card">
      <button type="button" :class="$style.head" :aria-expanded="open">
        <UIcon
          :name="running ? 'i-lucide-loader-circle' : allDone ? 'i-lucide-circle-check' : 'i-lucide-list-checks'"
          :class="[$style['head-icon'], { [$style.spin]: running }]"
        />
        <span :class="$style.title">任务编排</span>
        <span :class="[$style.count, 'mono']">{{ doneCount }} / {{ state.tasks.length }}</span>
        <UBadge :color="badgeColor" variant="subtle" size="sm">{{ summary }}</UBadge>
        <UIcon
          name="i-lucide-chevron-down"
          :class="[$style.chevron, { [$style.open]: open }]"
        />
      </button>

      <template #content>
        <UTimeline
          :items="items"
          :ui="{ item: $style.item, wrapper: $style.wrapper, separator: $style.separator }"
          :class="$style.list"
        >
          <template #wrapper="{ item }">
            <div :class="$style.row">
              <div :class="$style.main">
                <span :class="$style.name">
                  <span :class="[$style.ix, 'mono']">{{ String(item.index + 1).padStart(2, '0') }}</span>
                  {{ item.title }}
                </span>
                <span v-if="itemTask(item).owner && itemTask(item).owner !== 'agent' || item.blocked.length" :class="$style.meta">
                  <span v-if="itemTask(item).owner && itemTask(item).owner !== 'agent'" :class="$style.owner">
                    <UIcon name="i-lucide-user" />{{ itemTask(item).owner }}
                  </span>
                  <span v-if="item.blocked.length" :class="[$style.blocked, 'mono']">
                    <UIcon name="i-lucide-lock" />阻塞于 {{ item.blocked.map((id: number) => '#' + id).join(' ') }}
                  </span>
                </span>
              </div>
              <UBadge :class="$style.state" :color="itemTask(item).state === 'error' ? 'error' : itemTask(item).state === 'done' ? 'success' : 'neutral'" variant="subtle" size="sm">
                {{ item.stateLabel }}
              </UBadge>
            </div>
          </template>
        </UTimeline>
      </template>
    </UCollapsible>

    <UProgress :model-value="progress" size="xs" aria-label="任务完成进度" />
  </div>
</template>

<style module src="./index.module.css"></style>
