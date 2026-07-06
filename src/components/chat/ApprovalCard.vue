<script setup lang="ts">
import { computed } from 'vue'
import type { ApprovalStatus } from '../../types'
import { useConsoleStore } from '../../stores/console'
import { fmtToolCall } from '../../stores/sseReducer'

const props = defineProps<{
  requestId: string
  toolName: string
  toolInput: Record<string, unknown>
  reason: string
  status: ApprovalStatus
}>()

const { state, respondApproval } = useConsoleStore()

/** 待裁决且当前无进行中的流时,按钮可点 */
const pending = computed(() => props.status === 'pending')
/** 工具调用签名(复用与工具卡一致的格式化) */
const signature = computed(() => fmtToolCall(props.toolName, props.toolInput))

/** 已裁决态的展示文案 */
const resolvedText = computed(() => {
  switch (props.status) {
    case 'allow_once':
      return '已允许本次执行'
    case 'always_allow':
      return '已允许,并对该工具始终放行(本会话)'
    case 'deny':
      return '已拒绝该工具调用'
    default:
      return ''
  }
})

const denied = computed(() => props.status === 'deny')

function decide(decision: 'allow_once' | 'always_allow' | 'deny') {
  if (!pending.value || state.busy) return
  respondApproval(props.requestId, decision)
}
</script>

<template>
  <div class="approval-card" :class="{ resolved: !pending, denied }">
    <div class="ap-bar">
      <span class="ap-tag"><i class="icon icon-shield-alert"></i> 需要审批</span>
      <span class="ap-fn mono">{{ signature }}</span>
    </div>
    <div class="ap-reason">{{ reason }}</div>

    <!-- 待裁决:三个动作按钮(对齐 LeftSidebar 的行内确认范式,无遮罩弹窗) -->
    <div v-if="pending" class="ap-actions">
      <button class="ap-btn allow" :disabled="state.busy" @click="decide('allow_once')">
        <i class="icon icon-check"></i> 允许一次
      </button>
      <button class="ap-btn always" :disabled="state.busy" @click="decide('always_allow')">
        <i class="icon icon-check-check"></i> 始终允许
      </button>
      <button class="ap-btn deny" :disabled="state.busy" @click="decide('deny')">
        <i class="icon icon-x"></i> 拒绝
      </button>
    </div>

    <!-- 已裁决:显示结果 -->
    <div v-else class="ap-resolved">
      <i class="icon" :class="denied ? 'icon-x-circle' : 'icon-check-circle'"></i>
      {{ resolvedText }}
    </div>
  </div>
</template>

<style scoped>
.approval-card {
  font-family: var(--font-data);
  border-radius: var(--radius-sm);
  border: 1px solid var(--status-warning);
  background: rgba(251, 191, 36, 0.06);
  overflow: hidden;
  animation: entry-appear 180ms ease-out;
}
.approval-card.resolved {
  border-color: var(--border-subtle);
  background: var(--bg-panel);
}
.ap-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}
.ap-tag {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--status-warning);
  white-space: nowrap;
}
.ap-tag i {
  font-size: 12px;
}
.ap-fn {
  flex: 1;
  color: var(--text-secondary);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ap-reason {
  padding: 9px 12px;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.6;
}
.ap-actions {
  display: flex;
  gap: 8px;
  padding: 0 12px 11px;
}
.ap-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: var(--radius-control);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 11px;
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}
.ap-btn i {
  font-size: 13px;
}
.ap-btn:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text-primary);
}
.ap-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ap-btn.allow:hover:not(:disabled) {
  border-color: var(--status-success);
  color: var(--status-success);
}
.ap-btn.always:hover:not(:disabled) {
  border-color: var(--status-info);
  color: var(--status-info);
}
.ap-btn.deny:hover:not(:disabled) {
  border-color: var(--status-error);
  color: var(--status-error);
}
.ap-resolved {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 12px;
  font-size: 10.5px;
  color: var(--text-dim);
  border-top: 1px solid var(--border-subtle);
}
.ap-resolved i {
  font-size: 13px;
  color: var(--status-success);
}
.approval-card.denied .ap-resolved i {
  color: var(--status-error);
}
</style>
