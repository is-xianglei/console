<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useConsoleStore } from '../../stores/console'

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
  <div v-if="hasTasks" class="task-bar" :class="{ open }">
    <div class="task-bar-head" @click="open = !open">
      <span class="sec-head">任务编排</span>
      <span class="task-state" :class="errorCount ? 'error' : activeCount ? 'active' : 'done'">{{ summary }}</span>
      <div class="task-prog"><div class="task-prog-fill" :style="{ width: progress + '%' }"></div></div>
      <i class="icon icon-chevron-up task-chev"></i>
    </div>
    <div class="task-list">
      <div
        v-for="(t, i) in state.tasks"
        :key="t.id"
        class="task-row"
        :class="{ done: t.state === 'done', active: t.state === 'active' }"
      >
        <span class="task-row-ix mono">{{ String(i + 1).padStart(2, '0') }}</span>
        <span class="task-row-name">{{ t.name }}</span>
        <span class="task-state" :class="t.state">{{ stateLabel[t.state] }}</span>
      </div>
      <div v-if="!state.tasks.length" class="task-empty mono">暂无任务,派发后在此显示编排进度</div>
    </div>
  </div>
</template>

<style scoped>
.task-bar {
  flex-shrink: 0;
  border-top: 1px solid var(--border);
  background: var(--bg-panel);
}
.task-bar-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 18px;
  cursor: pointer;
}
.task-bar-head:hover {
  background: var(--bg-surface);
}
.task-prog {
  flex: 1;
  height: 4px;
  background: var(--bg-elevated);
  border-radius: var(--radius-pill);
  overflow: hidden;
  max-width: 200px;
}
.task-prog-fill {
  height: 100%;
  background: var(--accent-agent);
  border-radius: var(--radius-pill);
  transition: width var(--dur-med) var(--ease-out);
}
.task-chev {
  font-size: 14px;
  color: var(--text-dim);
  transition: transform var(--dur-fast);
}
.task-bar.open .task-chev {
  transform: rotate(180deg);
}
.task-list {
  max-height: 0;
  overflow: hidden;
  transition: max-height var(--dur-med) var(--ease-in-out);
}
.task-bar.open .task-list {
  max-height: 240px;
  overflow-y: auto;
}
.task-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 18px;
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-data);
  font-size: 11px;
}
.task-row-ix {
  color: var(--text-dim);
  font-size: 10px;
  width: 22px;
}
.task-row-name {
  flex: 1;
  color: var(--text-secondary);
}
.task-row.done .task-row-name {
  color: var(--text-muted);
}
.task-row.active .task-row-name {
  color: var(--text-primary);
}
.task-state {
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 1px 7px;
  border-radius: var(--radius-pill);
}
.task-state.queued {
  color: var(--text-dim);
  background: var(--bg-elevated);
}
.task-state.active {
  color: var(--accent-agent);
  background: var(--accent-agent-dim);
}
.task-state.done {
  color: var(--status-success);
  background: rgba(52, 211, 153, 0.1);
}
.task-state.error {
  color: var(--status-error);
  background: rgba(248, 113, 113, 0.1);
}
.task-empty {
  padding: 12px 18px;
  font-size: 10px;
  color: var(--text-dim);
  border-top: 1px solid var(--border-subtle);
}
</style>
