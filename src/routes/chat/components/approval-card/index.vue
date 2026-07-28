<script setup lang="ts">
import { computed } from 'vue'
import type { ApprovalStatus } from '@/interfaces'
import { useConsoleStore } from '@/stores/console'
import { fmtToolCall } from '@/utils/sse-reducer'

defineOptions({ name: 'ApprovalCard' })

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
  <div
    :class="[
      $style['approval-card'],
      { [$style.resolved]: !pending, [$style.denied]: denied },
    ]"
  >
    <div :class="$style['ap-bar']">
      <span :class="$style['ap-tag']"><i class="icon icon-shield-alert"></i> 需要审批</span>
      <span :class="[$style['ap-fn'], 'mono']">{{ signature }}</span>
    </div>
    <div :class="$style['ap-reason']">{{ reason }}</div>

    <!-- 待裁决:三个动作按钮(对齐 LeftSidebar 的行内确认范式,无遮罩弹窗) -->
    <div v-if="pending" :class="$style['ap-actions']">
      <UButton :class="[$style['ap-btn'], $style['allow']]" :loading="state.busy" @click="decide('allow_once')">
        <i class="icon icon-check"></i> 允许一次
      </UButton>
      <UButton color="neutral" variant="outline" :class="[$style['ap-btn'], $style['always']]" :disabled="state.busy" @click="decide('always_allow')">
        <i class="icon icon-check-check"></i> 始终允许
      </UButton>
      <UButton color="error" variant="outline" :class="[$style['ap-btn'], $style['deny']]" :disabled="state.busy" @click="decide('deny')">
        <i class="icon icon-x"></i> 拒绝
      </UButton>
    </div>

    <!-- 已裁决:显示结果 -->
    <div v-else :class="$style['ap-resolved']">
      <i class="icon" :class="denied ? 'icon-x-circle' : 'icon-check-circle'"></i>
      {{ resolvedText }}
    </div>
  </div>
</template>

<style module src="./index.module.css"></style>
