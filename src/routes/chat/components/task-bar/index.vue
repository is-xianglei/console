<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
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
/** 头部图标的"运行中"态:存在正在执行的任务时显示虚线环 + conic 饼图 */
const running = computed(() => activeCount.value > 0 && !allDone.value)
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
/** 待办态:非 done/active/error 的一切状态都渲染虚线圈,只看自身 state,不做位置推断 */
function isPending(t: (typeof state.tasks)[number]): boolean {
  return t.state !== 'done' && t.state !== 'active' && t.state !== 'error'
}
const summary = computed(() => {
  if (!state.tasks.length) return '0 / 0 待命'
  const tail = errorCount.value ? '有失败' : activeCount.value ? '运行中' : '完成'
  return `${doneCount.value} / ${state.tasks.length} ${tail}`
})

// doneCount 变化时数字向上滚动:生成 {from,to} 双帧,双重 rAF 触发位移,380ms 后清理
const roll = ref<{ from: string; to: string } | null>(null)
const rollUp = ref(false)
let rollTimer: ReturnType<typeof setTimeout> | null = null
watch(doneCount, (val, old) => {
  roll.value = { from: String(old), to: String(val) }
  rollUp.value = false
  requestAnimationFrame(() => requestAnimationFrame(() => (rollUp.value = true)))
  if (rollTimer) clearTimeout(rollTimer)
  rollTimer = setTimeout(() => (roll.value = null), 380)
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

onBeforeUnmount(() => {
  if (closeTimer) clearTimeout(closeTimer)
  if (rollTimer) clearTimeout(rollTimer)
})
</script>

<template>
  <div v-if="hasTasks" :class="$style['task-wrap']">
    <div :class="[$style['task-card'], { [$style.open]: open }]">
      <div :class="$style['task-head-wrap']">
        <UButton color="neutral" variant="ghost" block :class="$style['task-head']" @click="open = !open">
          <!-- 三态头部图标叠放:清单(默认) / 虚线环+conic 饼图(运行中) / 对勾(全部完成),靠 opacity 交叉过渡 -->
          <span :class="$style['task-head-ic-wrap']" aria-hidden="true">
            <i :class="[$style['task-head-ic'], { [$style.on]: !running && !allDone }, 'icon icon-list-checks']"></i>
            <span
              :class="[$style['task-head-pie'], { [$style.on]: running }]"
              :style="{ '--todo-pie': progress + '%' }"
            >
              <svg :class="$style['task-head-pie-ring']" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-dasharray="2.2 4.4" stroke-linecap="round" />
              </svg>
            </span>
            <i :class="[$style['task-head-check'], { [$style.on]: allDone }, 'icon icon-circle-check']"></i>
          </span>
          <span :class="$style['task-head-title']">任务编排</span>
          <!-- 数字滚动:doneCount 变化时旧值上移、新值顶入 -->
          <span :class="[$style['task-count'], 'mono']" :aria-label="doneCount + '/' + state.tasks.length">
            <span :class="$style['roll-digit']">
              <span v-if="roll" :class="[$style['roll-inner'], { [$style.on]: rollUp }]">
                <span>{{ roll.from }}</span>
                <span>{{ roll.to }}</span>
              </span>
              <template v-else>{{ doneCount }}</template>
            </span>
            <span :class="$style['roll-static']">/{{ state.tasks.length }}</span>
          </span>
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
                  [$style.error]: t.state === 'error',
                  [$style.blocked]: blockingIds(t).length > 0,
                },
              ]"
              :style="{ '--i': i }"
              :title="t.description || t.name"
            >
              <span :class="[$style['task-row-ix'], 'mono']">{{ String(i + 1).padStart(2, '0') }}</span>
              <!-- 三态行图标叠放:严格按 t.state 逐项判断,不做任何位置/顺序推断 -->
              <span :class="$style['task-icon-wrap']" aria-hidden="true">
                <i :class="[$style['task-icon'], { [$style.on]: isPending(t) }, 'icon icon-circle-dashed']"></i>
                <i :class="[$style['task-icon'], $style.strong, { [$style.on]: t.state === 'active' }, 'icon icon-circle-arrow-right']"></i>
                <i :class="[$style['task-icon'], $style.ok, { [$style.on]: t.state === 'done' }, 'icon icon-circle-check']"></i>
                <i :class="[$style['task-icon'], $style.bad, { [$style.on]: t.state === 'error' }, 'icon icon-circle-x']"></i>
              </span>
              <span :class="$style['task-row-main']">
                <span :class="$style['task-row-name']" :data-label="t.name">{{ t.name }}</span>
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
