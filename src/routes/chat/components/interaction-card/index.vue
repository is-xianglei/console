<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type {
  EnterPlanModeResolutionRequest,
  ExitPlanModeResolutionRequest,
  InteractionResolutionRequest,
  ToolApprovalResolutionRequest,
  UserQuestionResolutionRequest,
} from '@/interfaces/console/api'
import type { InteractionStatus, SseInteraction } from '@/interfaces/console/model'
import { useConsoleStore } from '@/stores/console'
import { toolCardFields } from '@/utils/sse-reducer'
import McpSourceBadge from '../mcp-source-badge/index.vue'

defineOptions({ name: 'InteractionCard' })

const props = defineProps<{
  interaction: SseInteraction
  status: InteractionStatus
  responseLabel?: string
}>()

const { state, respondInteraction, cancelInteraction } = useConsoleStore()
const selectedAnswers = reactive<Record<string, string | string[]>>({})
const customAnswers = reactive<Record<string, string>>({})
const feedback = ref('')
const editedPlan = ref('')
const inputError = ref('')
const toolInputJson = ref(
  props.interaction.kind === 'tool_approval'
    ? JSON.stringify(props.interaction.request_payload.tool.input, null, 2)
    : '',
)

const pending = computed(() => props.status === 'pending')
const title = computed(() => {
  switch (props.interaction.kind) {
    case 'tool_approval': return '工具调用审批'
    case 'user_question': return '需要你的回答'
    case 'enter_plan_mode': return '进入规划模式'
    case 'exit_plan_mode': return '执行计划确认'
    default: return '人工交互'
  }
})
const icon = computed(() => {
  switch (props.interaction.kind) {
    case 'tool_approval': return 'i-lucide-shield-alert'
    case 'user_question': return 'i-lucide-message-circle-question'
    case 'enter_plan_mode': return 'i-lucide-map'
    case 'exit_plan_mode': return 'i-lucide-clipboard-check'
    default: return 'i-lucide-message-circle-question'
  }
})
/** MCP 工具去掉 mcp__{server_key}__ 前缀，来源单独用徽标标出。 */
const toolSignature = computed(() => {
  if (props.interaction.kind !== 'tool_approval') return { fn: '' }
  const tool = props.interaction.request_payload.tool
  return toolCardFields(tool.name, tool.input, tool.source)
})

function submit(payload: InteractionResolutionRequest, label: string) {
  if (!pending.value || state.busy) return
  respondInteraction(props.interaction.request_id, payload, label)
}

function onToolDecision(decision: 'allow_once' | 'always_allow' | 'deny') {
  if (props.interaction.kind !== 'tool_approval') return
  let updatedInput: Record<string, unknown> | undefined
  if (decision !== 'deny' && props.interaction.request_payload.can_update_input) {
    try {
      const parsed = JSON.parse(toolInputJson.value) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        inputError.value = '调用参数必须是 JSON 对象'
        return
      }
      updatedInput = parsed as Record<string, unknown>
      inputError.value = ''
    } catch {
      inputError.value = '调用参数不是合法 JSON'
      return
    }
  }
  const payload: ToolApprovalResolutionRequest = {
    kind: 'tool_approval',
    response_payload: {
      decision,
      updated_input: updatedInput,
      always_scope: decision === 'always_allow' ? 'session' : undefined,
    },
  }
  const label = decision === 'deny'
    ? '已拒绝该工具调用'
    : decision === 'always_allow'
      ? '已允许，并记住本会话规则'
      : '已允许本次执行'
  submit(payload, label)
}

function onQuestionsSubmit() {
  if (props.interaction.kind !== 'user_question') return
  const answers: Record<string, string> = {}
  for (const question of props.interaction.request_payload.questions) {
    const custom = customAnswers[question.question]?.trim()
    const selected = selectedAnswers[question.question]
    const value = custom || (Array.isArray(selected) ? selected.join('、') : selected)
    if (!value) return
    answers[question.question] = value
  }
  const payload: UserQuestionResolutionRequest = {
    kind: 'user_question',
    response_payload: { decision: 'submit', answers },
  }
  submit(payload, '回答已提交')
}

function onQuestionCancel() {
  const payload: UserQuestionResolutionRequest = {
    kind: 'user_question',
    response_payload: { decision: 'cancel' },
  }
  submit(payload, '已取消回答')
}

function onPlanDecision(decision: 'approve' | 'reject') {
  if (props.interaction.kind === 'enter_plan_mode') {
    const payload: EnterPlanModeResolutionRequest = {
      kind: 'enter_plan_mode',
      response_payload: {
        decision,
        feedback: decision === 'reject' ? feedback.value.trim() || undefined : undefined,
      },
    }
    submit(payload, decision === 'approve' ? '已进入规划模式' : '已拒绝进入规划模式')
  } else if (props.interaction.kind === 'exit_plan_mode') {
    const payload: ExitPlanModeResolutionRequest = {
      kind: 'exit_plan_mode',
      response_payload: {
        decision,
        feedback: decision === 'reject' ? feedback.value.trim() || undefined : undefined,
        edited_plan: decision === 'approve' ? editedPlan.value.trim() || undefined : undefined,
      },
    }
    submit(payload, decision === 'approve' ? '计划已批准执行' : '计划已退回修改')
  }
}

function onCancelRun() {
  void cancelInteraction(props.interaction.request_id, props.interaction.suspension_id)
}
</script>

<template>
  <section :class="[$style.card, { [$style.resolved]: !pending }]">
    <header :class="$style.header">
      <UIcon :name="icon" :class="$style.icon" />
      <strong>{{ title }}</strong>
      <span :class="[$style.kind, 'mono']">{{ interaction.kind }}</span>
    </header>

    <template v-if="pending">
      <div v-if="interaction.kind === 'tool_approval'" :class="$style.body">
        <div :class="$style.signatureRow">
          <McpSourceBadge v-if="toolSignature.mcp" :server-key="toolSignature.mcp" />
          <code :class="$style.signature">{{ toolSignature.fn }}</code>
        </div>
        <p>{{ interaction.request_payload.reason }}</p>
        <UFormField v-if="interaction.request_payload.can_update_input" label="调用参数 JSON">
          <UTextarea v-model="toolInputJson" :class="$style.codeInput" autoresize :maxrows="10" />
        </UFormField>
        <UAlert v-if="inputError" color="error" variant="subtle" :description="inputError" />
        <div :class="$style.actions">
          <UButton icon="i-lucide-check" label="允许一次" :loading="state.busy" @click="onToolDecision('allow_once')" />
          <UButton color="neutral" variant="outline" icon="i-lucide-check-check" label="始终允许" :disabled="state.busy" @click="onToolDecision('always_allow')" />
          <UButton color="error" variant="outline" icon="i-lucide-x" label="拒绝" :disabled="state.busy" @click="onToolDecision('deny')" />
        </div>
      </div>

      <UForm v-else-if="interaction.kind === 'user_question'" :state="selectedAnswers" :class="$style.body" @submit="onQuestionsSubmit">
        <fieldset v-for="question in interaction.request_payload.questions" :key="question.question" :class="$style.question">
          <legend><span>{{ question.header }}</span>{{ question.question }}</legend>
          <UCheckboxGroup
            v-if="question.multiSelect"
            v-model="selectedAnswers[question.question] as string[]"
            :items="question.options.map((option) => ({ label: option.label, value: option.label, description: option.description }))"
          />
          <URadioGroup
            v-else
            v-model="selectedAnswers[question.question] as string"
            :items="question.options.map((option) => ({ label: option.label, value: option.label, description: option.description }))"
          />
          <UInput v-model="customAnswers[question.question]" placeholder="其他回答" />
        </fieldset>
        <div :class="$style.actions">
          <UButton type="submit" icon="i-lucide-send" label="提交回答" :loading="state.busy" />
          <UButton color="neutral" variant="outline" label="取消" :disabled="state.busy" @click="onQuestionCancel" />
        </div>
      </UForm>

      <div v-else :class="$style.body">
        <p v-if="interaction.kind === 'enter_plan_mode'">{{ interaction.request_payload.message }}</p>
        <template v-else>
          <div :class="$style.planMeta">计划版本 {{ interaction.request_payload.plan_version }}</div>
          <pre :class="$style.plan">{{ interaction.request_payload.plan }}</pre>
          <UFormField label="编辑后的计划" hint="可选">
            <UTextarea v-model="editedPlan" autoresize :maxrows="12" placeholder="保持为空则按原计划执行" />
          </UFormField>
        </template>
        <UFormField label="反馈" hint="拒绝时可填写">
          <UTextarea v-model="feedback" autoresize :maxrows="5" />
        </UFormField>
        <div :class="$style.actions">
          <UButton icon="i-lucide-check" :label="interaction.kind === 'enter_plan_mode' ? '进入规划模式' : '批准执行'" :loading="state.busy" @click="onPlanDecision('approve')" />
          <UButton color="error" variant="outline" icon="i-lucide-undo-2" label="退回" :disabled="state.busy" @click="onPlanDecision('reject')" />
        </div>
      </div>

      <footer :class="$style.footer">
        <UButton color="neutral" variant="ghost" icon="i-lucide-circle-stop" label="取消本次运行" :disabled="state.busy" @click="onCancelRun" />
      </footer>
    </template>

    <div v-else :class="$style.result">
      <UIcon :name="status === 'cancelled' ? 'i-lucide-circle-x' : 'i-lucide-circle-check'" />
      {{ responseLabel || (status === 'cancelled' ? '交互已取消' : '交互已处理') }}
    </div>
  </section>
</template>

<style module src="./index.module.css"></style>
