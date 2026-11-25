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
const suffix = computed(() => pending.value ? '待审批' : denied.value ? '已拒绝' : '已允许')

function decide(decision: 'allow_once' | 'always_allow' | 'deny') {
  if (!pending.value || state.busy) return
  respondApproval(props.requestId, decision)
}
</script>

<template>
  <UChatTool
    :text="signature"
    :suffix="suffix"
    icon="i-lucide-shield-alert"
    :error="denied"
    variant="card"
    chevron="leading"
    :default-open="pending"
    :class="$style.card"
  >
    <template #default>
      <p :class="$style.reason">{{ reason }}</p>
      <p v-if="!pending" :class="$style.resolved" :data-denied="denied || undefined">
        <UIcon :name="denied ? 'i-lucide-circle-x' : 'i-lucide-circle-check'" />
        {{ resolvedText }}
      </p>
    </template>

    <template v-if="pending" #actions>
      <UButton size="xs" :disabled="state.busy" icon="i-lucide-check" @click="decide('allow_once')">
        允许一次
      </UButton>
      <UButton
        size="xs"
        color="neutral"
        variant="outline"
        icon="i-lucide-check-check"
        :disabled="state.busy"
        @click="decide('always_allow')"
      >
        始终允许
      </UButton>
      <UButton
        size="xs"
        color="error"
        variant="outline"
        icon="i-lucide-x"
        :disabled="state.busy"
        @click="decide('deny')"
      >
        拒绝
      </UButton>
    </template>
  </UChatTool>
</template>

<style module src="./index.module.css"></style>
