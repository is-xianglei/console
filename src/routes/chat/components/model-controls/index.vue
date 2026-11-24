<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useToast } from '@nuxt/ui/composables'
import { useChatModelsStore } from '@/stores/chat-models'
import { useConsoleStore } from '@/stores/console'
import { useAuthStore } from '@/stores/auth'
import { updateDefaultModelPreference } from '@/http/settings/models'
import { useChatModelNormalization } from '@/hooks/useChatModelNormalization'
import { canUseTurbo, chatEffortOptions, chatFastHint, normalizeChatEffort, normalizeChatMode, resolveChatPolicy, shouldUpdateModelPreference } from '@/utils/chat-models'
import type { ChatModeSlug, ChatModelSelection, ThinkingEffort } from '@/interfaces/settings/models/model'
import ModelMenu from './model-menu/index.vue'

defineOptions({ name: 'ChatModelControls' })

const models = useChatModelsStore()
const consoleStore = useConsoleStore()
const auth = useAuthStore()
const toast = useToast()
const saving = ref(false)
const effortModelLink = ref<{ $el?: HTMLElement } | null>(null)
const effortModelMenu = ref<InstanceType<typeof ModelMenu> | null>(null)
type ControlPanel = 'mode' | 'model' | 'effort'
const activePanel = ref<ControlPanel | null>(null)
const effortView = ref<'effort' | 'model'>('effort')
const effortDraft = ref(0)
const selection = computed(() => consoleStore.activeChatSelection())
const activeSession = computed(() => consoleStore.state.sessions.find((item) => item.id === consoleStore.state.activeSessionId))
/** 回合排队、执行或等待交互期间后端不允许改模型选项。 */
const disabled = computed(() => saving.value || consoleStore.state.chatSelectionSaving || consoleStore.hasOpenTurn() || activeSession.value?.readOnly === true)
const caps = computed(() => models.capabilities)
const workflowActive = computed(() => consoleStore.sessionWorkflowId(consoleStore.state.activeSessionId) != null)
/** Team 会话包含多智能体协作，后端拒绝极速模式。 */
const teamActive = computed(() => consoleStore.sessionTeamId(consoleStore.state.activeSessionId) != null)
const turboBlocked = computed(() => workflowActive.value || teamActive.value)
const policy = computed(() => resolveChatPolicy(caps.value, selection.value.model_provider_id, workflowActive.value))
const turboAvailable = computed(() => canUseTurbo(policy.value, turboBlocked.value))
const modeHint = computed(() => teamActive.value
  ? 'Team 会话包含多智能体协作，请使用标准模式'
  : workflowActive.value
  ? '工作流按编排执行，使用标准模式；模型与思考强度仍可调整'
  : !turboAvailable.value ? '当前模型未配置可验证的关闭思考能力，极速模式不可用' : currentMode.value?.description)
const modes = computed(() => caps.value?.modes.map((mode) => ({ label: mode.name, value: mode.slug, description: mode.description, disabled: mode.slug === 'turbo' && !turboAvailable.value })) ?? [])
const currentMode = computed(() => caps.value?.modes.find((mode) => mode.slug === selection.value.mode_slug))
const locked = computed(() => currentMode.value?.thinking_locked || selection.value.mode_slug === 'turbo')
const defaultModelLabel = computed(() => workflowActive.value ? '跟随工作流角色模型' : '跟随默认模型')
const resolvedModel = computed(() => caps.value?.models.find((item) => item.provider_id === (selection.value.model_provider_id
  ?? (workflowActive.value ? caps.value?.workflow_provider_id ?? caps.value?.main_provider_id : caps.value?.main_provider_id))))
const modelLabel = computed(() => resolvedModel.value?.display_name || resolvedModel.value?.model_name || defaultModelLabel.value)
const modelSwitchDisabled = computed(() => disabled.value || !caps.value?.allow_model_switch || !caps.value.models.length)
const effortItems = computed(() => policy.value ? chatEffortOptions(policy.value) : [])
const effortIndex = computed(() => Math.max(0, effortItems.value.findIndex((item) => item.value === selection.value.thinking_effort)))
const effortLabel = computed(() => locked.value ? '快速' : effortItems.value[effortIndex.value]?.label ?? '思考强度')
const draftLabel = computed(() => locked.value ? effortLabel.value : effortItems.value[effortDraft.value]?.label ?? effortLabel.value)
const showEffortSlider = computed(() => effortItems.value.length > 1)
const defaultEffort = computed(() => policy.value ? normalizeChatEffort(policy.value.default_reasoning_effort, policy.value) : 'medium')
const fastHint = computed(() => chatFastHint(policy.value, selection.value.thinking_effort))

function openPanel(panel: ControlPanel, open: boolean): void {
  if (open && !disabled.value) {
    effortView.value = 'effort'
    effortDraft.value = effortIndex.value
    activePanel.value = panel
  } else if (!open && activePanel.value === panel) {
    activePanel.value = null
  }
}

function updateEffortDraft(value: number | number[] | undefined): void {
  if (typeof value === 'number') effortDraft.value = value
}

function commitEffort(): void {
  const item = effortItems.value[effortDraft.value]
  if (item) void changeEffort(item.value)
}

function openEffortModel(): void {
  effortView.value = 'model'
  void nextTick(() => effortModelMenu.value?.focusInitial())
}

function returnToEffort(): void {
  effortView.value = 'effort'
  void nextTick(() => effortModelLink.value?.$el?.focus())
}

watch([effortIndex, effortItems], () => { effortDraft.value = effortIndex.value })
watch(() => [consoleStore.state.activeSessionId, auth.state.user?.id, auth.currentWorkspaceId, workflowActive.value], () => {
  activePanel.value = null
  effortView.value = 'effort'
  effortDraft.value = effortIndex.value
})
watch(() => consoleStore.hasOpenTurn() || activeSession.value?.readOnly === true, (unavailable) => {
  if (unavailable) activePanel.value = null
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

function changeMode(mode: string): void {
  if (mode === selection.value.mode_slug || (mode === 'turbo' && !turboAvailable.value)) return
  const nextMode = mode as ChatModeSlug
  const previous = consoleStore.standardThinkingEffort()
  const effort = nextMode === 'turbo' ? 'fast' : policy.value ? normalizeChatEffort(previous, policy.value) : previous
  void save({ ...selection.value, mode_slug: nextMode, thinking_effort: effort })
}

async function changeModel(value: string): Promise<void> {
  if (modelSwitchDisabled.value) return
  const providerId = value === '__default__' ? null : value
  if (providerId === selection.value.model_provider_id) {
    if (activePanel.value === 'model') activePanel.value = null
    effortView.value = 'effort'
    return
  }
  const nextPolicy = resolveChatPolicy(caps.value, providerId, workflowActive.value)
  const mode = normalizeChatMode(selection.value.mode_slug, nextPolicy, turboBlocked.value)
  const candidate = mode !== selection.value.mode_slug ? consoleStore.standardThinkingEffort() : selection.value.thinking_effort
  const effort = mode === 'turbo' ? 'fast' : nextPolicy ? normalizeChatEffort(candidate, nextPolicy) : candidate
  // 工作流的 null 表示跟随 workflow 角色；不应改写 Agent 对话的个人默认偏好。
  await save({ ...selection.value, model_provider_id: providerId, thinking_effort: effort, mode_slug: mode }, shouldUpdateModelPreference(providerId, workflowActive.value))
  if (activePanel.value === 'model') activePanel.value = null
  effortView.value = 'effort'
}

async function changeEffort(value: ThinkingEffort): Promise<void> {
  if (!locked.value && value !== selection.value.thinking_effort) {
    await save({ ...selection.value, thinking_effort: value })
  }
  effortDraft.value = effortIndex.value
}

const resetNormalization = useChatModelNormalization({
  selection: () => selection.value,
  capabilities: () => caps.value,
  disabled: () => disabled.value,
  workflowActive: () => workflowActive.value,
  turboBlocked: () => turboBlocked.value,
  sessionId: () => consoleStore.state.activeSessionId,
  revision: () => models.revision,
  error: () => models.error,
  standardEffort: () => consoleStore.standardThinkingEffort(),
  save,
})
watch(() => [auth.state.user?.id, auth.currentWorkspaceId], () => { models.reset(); resetNormalization(); void models.load() })
onMounted(() => { void models.load() })
</script>

<template>
  <div :class="$style.controls" aria-label="聊天模型与运行模式">
    <template v-if="caps">
      <UPopover :open="activePanel === 'mode'" :content="{ side: 'top', align: 'end' }"
        :ui="{ content: $style.popover }" @update:open="openPanel('mode', $event)">
        <UButton :class="[$style.trigger, $style.modeTrigger]" :disabled="disabled" color="neutral" variant="ghost"
          :icon="selection.mode_slug === 'turbo' ? 'i-lucide-zap' : 'i-lucide-sparkles'"
          :label="currentMode?.name ?? '标准模式'" :aria-label="'运行模式：' + (currentMode?.name ?? '标准模式')" />
        <template #content>
          <section :class="$style.modePanel" aria-label="选择运行模式">
            <UButton v-for="mode in modes" :key="mode.value" :class="$style.modeOption"
              :disabled="disabled || mode.disabled" :aria-pressed="selection.mode_slug === mode.value"
              color="neutral" variant="ghost" @click="changeMode(mode.value)">
              <span :class="$style.optionCopy">
                <span :class="$style.optionTitle">{{ mode.label }}</span>
                <span :class="$style.description">{{ mode.description }}</span>
                <span v-if="mode.disabled" :class="$style.description">{{ modeHint }}</span>
              </span>
              <UIcon v-if="selection.mode_slug === mode.value" name="i-lucide-check" :class="$style.check" />
            </UButton>
          </section>
        </template>
      </UPopover>

      <UPopover :open="activePanel === 'model'" :content="{ side: 'top', align: 'end' }"
        :ui="{ content: $style.popover }" @update:open="openPanel('model', $event)">
        <UButton :class="[$style.trigger, $style.modelTrigger]" :disabled="modelSwitchDisabled"
          color="neutral" variant="ghost" trailing-icon="i-lucide-chevron-down" :title="modelLabel"
          :aria-label="'对话模型：' + modelLabel" :ui="{ label: 'truncate' }" :label="modelLabel" />
        <template #content>
          <ModelMenu :items="caps.models" :selected="selection.model_provider_id" :default-label="defaultModelLabel"
            :disabled="modelSwitchDisabled" @select="changeModel" @close="activePanel = null" />
        </template>
      </UPopover>

      <UPopover :open="activePanel === 'effort'" :content="{ side: 'top', align: 'end' }"
        :ui="{ content: $style.popover }" @update:open="openPanel('effort', $event)">
        <UButton :class="$style.trigger" :disabled="disabled || !effortItems.length"
          color="neutral" variant="ghost" trailing-icon="i-lucide-chevron-down"
          :label="effortLabel" :aria-label="'思考强度：' + effortLabel" />
        <template #content>
          <ModelMenu v-if="effortView === 'model'" ref="effortModelMenu" :items="caps.models" :selected="selection.model_provider_id"
            :default-label="defaultModelLabel" :disabled="modelSwitchDisabled" back
            @select="changeModel" @back="returnToEffort" @close="activePanel = null" />
          <section v-else :class="$style.effortPanel" aria-label="调整思考强度">
            <div :class="$style.panelHeader">
              <div>
                <p :class="$style.eyebrow">思考强度</p>
                <p :class="$style.effortTitle" aria-live="polite">{{ draftLabel }}</p>
              </div>
              <UTooltip text="恢复模型默认强度">
                <UButton icon="i-lucide-rotate-ccw" aria-label="恢复模型默认强度" color="neutral" variant="ghost"
                  :disabled="disabled || locked || selection.thinking_effort === defaultEffort" @click="changeEffort(defaultEffort)" />
              </UTooltip>
            </div>
            <UButton ref="effortModelLink" :class="$style.modelLink" :disabled="modelSwitchDisabled" :label="modelLabel"
              color="neutral" variant="link" trailing-icon="i-lucide-chevron-right" :ui="{ label: 'truncate' }"
              :aria-label="'选择模型，当前为' + modelLabel" @click="openEffortModel" />
            <template v-if="!locked">
              <USlider v-if="showEffortSlider" :model-value="effortDraft" :min="0" :max="effortItems.length - 1" :step="1"
                :disabled="disabled" :class="$style.slider" aria-label="思考强度档位"
                :aria-valuetext="draftLabel" @update:model-value="updateEffortDraft" @change="() => void nextTick(commitEffort)" />
              <div :class="$style.effortSteps" aria-label="可用思考档位">
                <UButton v-for="item in effortItems" :key="item.value" :class="$style.effortStep"
                  :disabled="disabled" :aria-pressed="selection.thinking_effort === item.value"
                  :label="item.label" color="neutral" variant="ghost" @click="changeEffort(item.value)" />
              </div>
            </template>
            <p :class="$style.hint">{{ locked ? '当前模式不额外思考，切回标准模式后可调整强度。' : '更高的思考强度适合复杂任务，可能需要更多时间。' }}</p>
            <p v-if="fastHint" :class="$style.hint">{{ fastHint }}</p>
            <p v-if="workflowActive" :class="$style.hint">{{ modeHint }}</p>
            <p v-if="!caps.models.length" :class="$style.hint">使用环境配置；可前往设置添加模型服务。</p>
          </section>
        </template>
      </UPopover>
    </template>
    <span v-else-if="models.loading" :class="$style.hint" role="status">正在加载模型配置…</span>
    <UButton v-if="models.error" size="xs" color="error" variant="ghost" icon="i-lucide-refresh-cw"
      :title="models.error" aria-label="模型配置加载失败，点击重试" @click="models.load" />
  </div>
</template>

<style module src="./index.module.css"></style>
