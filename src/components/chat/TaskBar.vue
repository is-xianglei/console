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
  <div v-if="hasTasks" class="task-wrap">
    <div class="task-card" :class="{ open }">
      <button class="task-head" type="button" @click="open = !open">
        <i class="icon icon-list-checks task-head-ic"></i>
        <span class="task-head-title">任务编排</span>
        <span class="task-count mono">{{ doneCount }}/{{ state.tasks.length }}</span>
        <span
          class="task-badge"
          :class="errorCount ? 'error' : activeCount ? 'active' : allDone ? 'done' : 'queued'"
        >{{ summary }}</span>
        <i class="icon icon-chevron-down task-chev"></i>
        <div class="task-prog"><div class="task-prog-fill" :style="{ width: progress + '%' }"></div></div>
      </button>
      <!-- Grid 0fr→1fr 动画:外层 grid 过渡内容真实高度,内层 overflow:hidden 裁剪 -->
      <div class="task-collapse">
        <div class="task-collapse-inner">
          <div class="task-list">
            <div
              v-for="(t, i) in state.tasks"
              :key="t.id"
              class="task-row"
              :class="{
                done: t.state === 'done',
                active: t.state === 'active',
                blocked: blockingIds(t).length > 0,
              }"
              :title="t.description || t.name"
            >
              <span class="task-row-ix mono">{{ String(i + 1).padStart(2, '0') }}</span>
              <span class="task-dot" :class="t.state"></span>
              <span class="task-row-main">
                <span class="task-row-name">{{ t.name }}</span>
                <span v-if="t.owner && t.owner !== 'agent' || blockingIds(t).length" class="task-row-meta">
                  <span v-if="t.owner && t.owner !== 'agent'" class="task-owner">
                    <i class="icon icon-user"></i>{{ t.owner }}
                  </span>
                  <span v-if="blockingIds(t).length" class="task-blocked mono">
                    <i class="icon icon-lock"></i>阻塞于 {{ blockingIds(t).map((id) => '#' + id).join(' ') }}
                  </span>
                </span>
              </span>
              <span class="task-badge sm" :class="t.state">{{ stateLabel[t.state] }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 外层:对齐对话内容列(与 Composer 同一 max-width 与左右留白),不再通栏 */
.task-wrap {
  flex-shrink: 0;
  background: var(--bg-deep);
  padding: 0 40px;
}
/* 卡片:与输入框同一套卡片语言(圆角 + 边框 + 表面色) */
.task-card {
  max-width: var(--content-max);
  margin: 0 auto;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.task-head {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 14px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
}
.task-head:hover {
  background: var(--bg-surface);
}
.task-head-ic {
  font-size: 14px;
  color: var(--accent-agent);
}
.task-head-title {
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}
.task-count {
  font-size: 11px;
  color: var(--text-dim);
}
.task-chev {
  margin-left: auto;
  font-size: 14px;
  color: var(--text-dim);
  transition: transform var(--dur-med) var(--ease-out);
}
.task-card.open .task-chev {
  transform: rotate(180deg);
}
/* 进度条:贴在表头底沿的一条细线,不再夹在中间被拉伸 */
.task-prog {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: var(--bg-elevated);
}
.task-prog-fill {
  height: 100%;
  background: var(--accent-agent);
  transition: width var(--dur-med) var(--ease-out);
}
/* 折叠动画:grid-template-rows 0fr→1fr 按内容真实高度过渡,无 max-height 死区 */
.task-collapse {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--dur-med) var(--ease-out);
}
.task-card.open .task-collapse {
  grid-template-rows: 1fr;
}
.task-collapse-inner {
  overflow: hidden;
  min-height: 0;
}
/* 列表本身滚动:展开后内容超高时才出现滚动条 */
.task-list {
  max-height: 320px;
  overflow-y: auto;
}
.task-card.open .task-collapse-inner {
  border-top: 1px solid var(--border-subtle);
}
.task-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  font-family: var(--font-body);
  font-size: 12px;
}
.task-row + .task-row {
  border-top: 1px solid var(--border-subtle);
}
.task-row-ix {
  color: var(--text-dim);
  font-size: 10px;
  width: 18px;
  flex-shrink: 0;
}
/* 状态圆点:比彩色徽章更克制的行首状态指示 */
.task-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--text-dim);
}
.task-dot.active {
  background: var(--accent-agent);
  box-shadow: 0 0 0 3px var(--accent-agent-dim);
}
.task-dot.done {
  background: var(--status-success);
}
.task-dot.error {
  background: var(--status-error);
}
.task-row-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.task-row-name {
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-row.done .task-row-name {
  color: var(--text-muted);
  text-decoration: line-through;
  text-decoration-color: var(--border-strong, var(--text-dim));
}
.task-row.active .task-row-name {
  color: var(--text-primary);
  font-weight: 500;
}
.task-row.blocked {
  opacity: 0.55;
}
.task-row-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-data);
  font-size: 9px;
}
.task-owner {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--accent-agent);
}
.task-owner .icon {
  font-size: 10px;
}
.task-blocked {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--status-warning);
  letter-spacing: 0.04em;
}
.task-blocked .icon {
  font-size: 10px;
}
/* active 任务:左侧强调条,呼应右栏 AgentCard 的"正在执行"视觉 */
.task-row.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--accent-agent);
}
/* 状态徽章:仅表头汇总用;行内改用小圆点 + sm 徽章 */
.task-badge {
  font-family: var(--font-data);
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  flex-shrink: 0;
}
.task-badge.sm {
  padding: 1px 7px;
}
.task-badge.queued {
  color: var(--text-dim);
  background: var(--bg-elevated);
}
.task-badge.active {
  color: var(--accent-agent);
  background: var(--accent-agent-dim);
}
.task-badge.done {
  color: var(--status-success);
  background: rgba(52, 211, 153, 0.1);
}
.task-badge.error {
  color: var(--status-error);
  background: rgba(248, 113, 113, 0.1);
}
</style>
