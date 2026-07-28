<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useConsoleStore } from '@/stores/console'

defineOptions({ name: 'TaskBar' })

const { state } = useConsoleStore()
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
const hasTasks = computed(() => state.tasks.length > 0)
const doneCount = computed(() => state.tasks.filter((t) => t.state === 'done').length)
const activeCount = computed(() => state.tasks.filter((t) => t.state === 'active').length)
const errorCount = computed(() => state.tasks.filter((t) => t.state === 'error').length)
const allDone = computed(
  () => hasTasks.value && doneCount.value === state.tasks.length && !errorCount.value,
)
const progress = computed(() =>
  state.tasks.length ? (doneCount.value / state.tasks.length) * 100 : 0,
)

// 完成的任务 id 集合:用于判断某任务的阻塞是否已解除
const doneIds = computed(
  () => new Set(state.tasks.filter((t) => t.state === 'done').map((t) => Number(t.id))),
)
/** 该任务是否仍被未完成的上游阻塞(据此在 UI 上置灰/标记) */
function blockingIds(t: (typeof state.tasks)[number]): number[] {
  return (t.blockedBy ?? []).filter((id) => !doneIds.value.has(id))
}
const summary = computed(() => {
  if (!state.tasks.length) return '0 / 0 待命'
  const tail = errorCount.value ? '有失败' : activeCount.value ? '运行中' : '完成'
  return `${doneCount.value} / ${state.tasks.length} ${tail}`
})

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
</script>

<template>
  <div v-if="hasTasks" :class="$style['task-wrap']">
    <div :class="[$style['task-card'], { [$style.open]: open }]">
      <div :class="$style['task-head-wrap']">
        <UButton color="neutral" variant="ghost" block :class="$style['task-head']" @click="open = !open">
          <i :class="[$style['task-head-ic'], 'icon icon-list-checks']"></i>
          <span :class="$style['task-head-title']">任务编排</span>
          <span :class="[$style['task-count'], 'mono']">{{ doneCount }}/{{ state.tasks.length }}</span>
          <span
            :class="[
              $style['task-badge'],
              $style[errorCount ? 'error' : activeCount ? 'active' : allDone ? 'done' : 'queued'],
            ]"
          >{{ summary }}</span>
          <i :class="[$style['task-chev'], 'icon icon-chevron-down']"></i>
        </UButton>
        <UProgress
          :class="$style['task-prog']"
          :model-value="progress"
          size="xs"
          aria-label="任务完成进度"
        />
      </div>
      <!-- Grid 0fr→1fr 动画:外层 grid 过渡内容真实高度,内层 overflow:hidden 裁剪 -->
      <div :class="$style['task-collapse']">
        <div :class="$style['task-collapse-inner']">
          <div :class="$style['task-list']">
            <div
              v-for="(t, i) in state.tasks"
              :key="t.id"
              :class="[
                $style['task-row'],
                {
                  [$style.done]: t.state === 'done',
                  [$style.active]: t.state === 'active',
                  [$style.blocked]: blockingIds(t).length > 0,
                },
              ]"
              :title="t.description || t.name"
            >
              <span :class="[$style['task-row-ix'], 'mono']">{{ String(i + 1).padStart(2, '0') }}</span>
              <span :class="[$style['task-dot'], $style[t.state]]"></span>
              <span :class="$style['task-row-main']">
                <span :class="$style['task-row-name']">{{ t.name }}</span>
                <span v-if="t.owner && t.owner !== 'agent' || blockingIds(t).length" :class="$style['task-row-meta']">
                  <span v-if="t.owner && t.owner !== 'agent'" :class="$style['task-owner']">
                    <i class="icon icon-user"></i>{{ t.owner }}
                  </span>
                  <span v-if="blockingIds(t).length" :class="[$style['task-blocked'], 'mono']">
                    <i class="icon icon-lock"></i>阻塞于 {{ blockingIds(t).map((id) => '#' + id).join(' ') }}
                  </span>
                </span>
              </span>
              <span :class="[$style['task-badge'], $style.sm, $style[t.state]]">{{ stateLabel[t.state] }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style module src="./index.module.css"></style>
