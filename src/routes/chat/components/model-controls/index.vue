<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useToast } from '@nuxt/ui/composables'
import { useChatModelsStore } from '@/stores/chat-models'
import { useConsoleStore } from '@/stores/console'
import { useAuthStore } from '@/stores/auth'
import { updateDefaultModelPreference } from '@/http/settings/models'
import { useChatModelNormalization } from '@/hooks/useChatModelNormalization'
import { chatEffortOptions, chatFastHint, normalizeChatEffort, resolveChatPolicy, shouldUpdateModelPreference } from '@/utils/chat-models'
import type { ChatModelOption, ChatModelSelection, ThinkingEffort } from '@/interfaces/settings/models/model'
import ModelMenu from './model-menu/index.vue'

defineOptions({ name: 'ChatModelControls' })

const models = useChatModelsStore()
const consoleStore = useConsoleStore()
const auth = useAuthStore()
const toast = useToast()
const saving = ref(false)
const modelLink = ref<{ $el?: HTMLElement } | null>(null)
const modelMenu = ref<InstanceType<typeof ModelMenu> | null>(null)
const open = ref(false)
const view = ref<'effort' | 'model'>('effort')
const effortDraft = ref(0)
const selection = computed(() => consoleStore.activeChatSelection())
const activeSession = computed(() => consoleStore.state.sessions.find((item) => item.id === consoleStore.state.activeSessionId))
/** 回合排队、执行或等待交互期间后端不允许改模型选项。 */
const disabled = computed(() => saving.value || consoleStore.state.chatSelectionSaving || consoleStore.hasOpenTurn() || activeSession.value?.readOnly === true)
const caps = computed(() => models.capabilities)
const workflowActive = computed(() => consoleStore.sessionWorkflowId(consoleStore.state.activeSessionId) != null)
const policy = computed(() => resolveChatPolicy(caps.value, selection.value.model_provider_id, workflowActive.value))
const defaultModelLabel = computed(() => workflowActive.value ? '跟随工作流角色模型' : '跟随默认模型')
const defaultProviderId = computed(() => workflowActive.value
  ? caps.value?.workflow_provider_id ?? caps.value?.main_provider_id
  : caps.value?.main_provider_id)
const defaultModel = computed(() => caps.value?.models.find((item) => item.provider_id === defaultProviderId.value))
const resolvedModel = computed(() => selection.value.model_provider_id == null
  ? defaultModel.value
  : caps.value?.models.find((item) => item.provider_id === selection.value.model_provider_id))
const modelLabel = computed(() => modelName(resolvedModel.value) || defaultModelLabel.value)
const modelSwitchDisabled = computed(() => disabled.value || !caps.value?.allow_model_switch || !caps.value.models.length)
const effortItems = computed(() => policy.value ? chatEffortOptions(policy.value) : [])
const effortIndex = computed(() => Math.max(0, effortItems.value.findIndex((item) => item.value === selection.value.thinking_effort)))
const effortLabel = computed(() => effortItems.value[effortIndex.value]?.label ?? '')
const draftLabel = computed(() => effortItems.value[effortDraft.value]?.label ?? effortLabel.value)
const showEffortSlider = computed(() => effortItems.value.length > 1)
const defaultEffort = computed(() => policy.value ? normalizeChatEffort(policy.value.default_reasoning_effort, policy.value) : 'medium')
const fastHint = computed(() => chatFastHint(policy.value, selection.value.thinking_effort))

function modelName(item: ChatModelOption | undefined): string {
  return item?.display_name || item?.model_name || ''
}

function setOpen(value: boolean): void {
  if (value && disabled.value) return
  if (value) {
    view.value = 'effort'
    effortDraft.value = effortIndex.value
  }
  open.value = value
}

function updateEffortDraft(value: number | number[] | undefined): void {
  if (typeof value === 'number') effortDraft.value = value
}

function commitEffort(): void {
  const item = effortItems.value[effortDraft.value]
  if (item) void changeEffort(item.value)
}

function openModelView(): void {
  view.value = 'model'
  void nextTick(() => modelMenu.value?.focusInitial())
}

function returnToEffort(): void {
  view.value = 'effort'
  void nextTick(() => modelLink.value?.$el?.focus())
}

watch([effortIndex, effortItems], () => { effortDraft.value = effortIndex.value })
watch(() => [consoleStore.state.activeSessionId, auth.state.user?.id, auth.currentWorkspaceId, workflowActive.value], () => {
  open.value = false
  view.value = 'effort'
  effortDraft.value = effortIndex.value
})
watch(() => consoleStore.hasOpenTurn() || activeSession.value?.readOnly === true, (unavailable) => {
  if (unavailable) open.value = false
})

async function save(next: ChatModelSelection, saveDefault = false): Promise<void> {
  if (disabled.value) return
  saving.value = true
  try {
    if (!await consoleStore.setChatSelection(next)) return
    if (saveDefault) {
      await updateDefaultModelPreference({ preferences: { default_model_provider_id: next.model_provider_id } })
      await models.load()
    }
  } catch (error) {
    toast.add({ title: error instanceof Error ? error.message : '保存聊天配置失败', color: 'error' })
  } finally {
    saving.value = false
  }
}

/** 选完模型回到强度视图，新模型的档位立即可见。 */
async function changeModel(value: string): Promise<void> {
  if (modelSwitchDisabled.value) return
  const providerId = value === '__default__' ? null : value
  if (providerId !== selection.value.model_provider_id) {
    const nextPolicy = resolveChatPolicy(caps.value, providerId, workflowActive.value)
    const current = selection.value.thinking_effort
    const effort = nextPolicy ? normalizeChatEffort(current, nextPolicy) : current
    // 工作流的 null 表示跟随 workflow 角色；不应改写 Agent 对话的个人默认偏好。
    await save({ ...selection.value, model_provider_id: providerId, thinking_effort: effort }, shouldUpdateModelPreference(providerId, workflowActive.value))
  }
  if (open.value) returnToEffort()
}

async function changeEffort(value: ThinkingEffort): Promise<void> {
  if (value !== selection.value.thinking_effort) {
    await save({ ...selection.value, thinking_effort: value })
  }
  effortDraft.value = effortIndex.value
}

const resetNormalization = useChatModelNormalization({
  selection: () => selection.value,
  capabilities: () => caps.value,
  disabled: () => disabled.value,
  workflowActive: () => workflowActive.value,
  sessionId: () => consoleStore.state.activeSessionId,
  revision: () => models.revision,
  error: () => models.error,
  save,
})
watch(() => [auth.state.user?.id, auth.currentWorkspaceId], () => { models.reset(); resetNormalization(); void models.load() })
onMounted(() => { void models.load() })
</script>

<template>
  <div :class="$style.controls">
    <UPopover v-if="caps" :open="open" :content="{ side: 'top', align: 'end', sideOffset: 8 }"
      :ui="{ content: $style.popover }" @update:open="setOpen">
      <UButton :class="$style.trigger" :disabled="disabled" color="neutral" variant="ghost"
        trailing-icon="i-lucide-chevron-down" :title="modelLabel"
        :aria-label="`对话模型 ${modelLabel}，思考强度 ${effortLabel}`">
        <span :class="$style.modelName">{{ modelLabel }}</span>
        <span :class="$style.effortName">{{ effortLabel }}</span>
      </UButton>

      <template #content>
        <ModelMenu v-if="view === 'model'" ref="modelMenu" :items="caps.models" :selected="selection.model_provider_id"
          :default-label="defaultModelLabel" :default-description="modelName(defaultModel)"
          :disabled="modelSwitchDisabled" @select="changeModel" @back="returnToEffort" />

        <section v-else :class="$style.effort" aria-label="调整思考强度">
          <p :class="$style.effortTitle" aria-live="polite">{{ draftLabel }}</p>
          <UTooltip text="恢复默认强度">
            <UButton :class="$style.reset" icon="i-lucide-rotate-ccw" size="xs" color="neutral" variant="ghost"
              aria-label="恢复默认强度" :disabled="disabled || selection.thinking_effort === defaultEffort"
              @click="changeEffort(defaultEffort)" />
          </UTooltip>
          <UButton ref="modelLink" :class="$style.modelLink" :disabled="modelSwitchDisabled" :label="modelLabel"
            color="neutral" variant="link" size="xs" trailing-icon="i-lucide-chevron-right" :ui="{ label: 'truncate' }"
            :aria-label="`选择模型，当前为 ${modelLabel}`" @click="openModelView" />
          <div v-if="showEffortSlider" :class="$style.scale">
            <USlider :model-value="effortDraft" :min="0" :max="effortItems.length - 1" :step="1" :disabled="disabled"
              :ui="{ track: $style.track, thumb: $style.thumb }" aria-label="思考强度档位" :aria-valuetext="draftLabel"
              @update:model-value="updateEffortDraft" @change="() => void nextTick(commitEffort)" />
            <span :class="$style.ticks" aria-hidden="true">
              <span v-for="(item, index) in effortItems" :key="item.value" :class="$style.tick"
                :data-filled="index < effortDraft || undefined" />
            </span>
          </div>
          <p v-if="fastHint" :class="$style.hint">{{ fastHint }}</p>
        </section>
      </template>
    </UPopover>
    <span v-else-if="models.loading" :class="$style.loading" role="status">正在加载模型配置…</span>
    <UButton v-if="models.error" size="xs" color="error" variant="ghost" icon="i-lucide-refresh-cw"
      :title="models.error" aria-label="模型配置加载失败，点击重试" @click="models.load" />
  </div>
</template>

<style module src="./index.module.css"></style>
