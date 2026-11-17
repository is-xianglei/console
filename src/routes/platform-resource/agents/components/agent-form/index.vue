<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ActionIconButton } from '@/components'
import { focusFirstError } from '@/hooks/useFormHelpers'
import type { AgentFormModel, AgentValidationIssue } from '@/interfaces/agent/model'
import type { SkillResponse } from '@/interfaces/skill/model'
import type { ToolResponse } from '@/interfaces/tool/model'
import { getAgentToolItems } from '@/utils/agent-tools'

/** 新建 / 编辑 / 复制共用的 Agent 表单：页头操作 + 基本信息、系统提示词、能力三组。 */
defineOptions({ name: 'AgentForm' })

const props = defineProps<{
  agent: AgentFormModel
  title: string
  issues: AgentValidationIssue[]
  skills: SkillResponse[]
  tools: ToolResponse[]
  saving: boolean
  /** 详情 / 复制源加载中：显示骨架，禁用保存。 */
  loading?: boolean
  catalogsLoading?: boolean
  /** 保存失败或复制源加载失败的提示。 */
  error?: string
}>()
const emit = defineEmits<{ close: []; save: []; publish: [] }>()

interface CapabilityItem {
  label: string
  value: number
  disabled: boolean
  /** 已停用：选项后缀 muted「已停用」。 */
  inactive: boolean
  /** 能力策略禁止用户 Agent 新增绑定；遗留绑定可取消。 */
  restricted?: boolean
  /** 额外的搜索字段（工具 key）。 */
  keywords: string
}

const rootRef = ref<HTMLElement | null>(null)
/** 点过保存后才在字段下方显示错误。 */
const attempted = ref(false)

const fieldErrors = computed(() => {
  if (!attempted.value) return {} as Partial<Record<AgentValidationIssue['field'], string>>
  return Object.fromEntries(props.issues.map((issue) => [issue.field, issue.message])) as Partial<Record<AgentValidationIssue['field'], string>>
})

/** 已停用的技能仍可绑定，启用后生效。 */
const skillItems = computed<CapabilityItem[]>(() => props.skills.map((skill) => ({
  label: skill.name,
  value: skill.id,
  disabled: false,
  inactive: !skill.is_enabled,
  keywords: skill.description,
})))

/** 工具选择遵守服务端策略，已绑定的停用或受限工具仍可取消。 */
const toolItems = computed<CapabilityItem[]>(() => getAgentToolItems(props.tools, props.agent.toolIds))

const promptLength = computed(() => props.agent.systemPrompt.length)

/** 有错误时滚动到第一个错误字段并聚焦，返回 false 阻止提交。 */
/** 点到提示词卡片的空白处（内边距、字数计数）也聚焦输入框。 */
function focusPrompt(event: MouseEvent) {
  if ((event.target as HTMLElement).tagName === 'TEXTAREA') return
  document.getElementById('agent-form-prompt')?.focus()
}

async function attemptSubmit() {
  attempted.value = true
  if (!props.issues.length) return true
  await nextTick()
  if (rootRef.value) focusFirstError(rootRef.value)
  return false
}

async function onSave() {
  if (props.saving || props.loading) return
  if (await attemptSubmit()) emit('save')
}

async function onPublish() {
  if (props.saving || props.loading) return
  if (await attemptSubmit()) emit('publish')
}

/** 焦点在弹窗或下拉浮层里时，Esc 交给浮层自己关闭。 */
function inOverlay(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[role="dialog"], [data-reka-popper-content-wrapper]'))
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !event.defaultPrevented && !inOverlay(event.target)) emit('close')
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void onSave()
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <main ref="rootRef" :class="$style.page">
    <div :class="$style.inner">
      <header :class="$style.header">
        <ActionIconButton label="返回智能体列表" icon="i-lucide-arrow-left" @click="emit('close')" />
        <h1 :class="$style.title">{{ title }}</h1>
        <div :class="$style.actions">
          <UButton label="保存" color="neutral" variant="outline" :loading="saving" :disabled="saving || loading" @click="onSave" />
          <UButton label="保存并启用" color="primary" :loading="saving" :disabled="saving || loading" @click="onPublish" />
        </div>
      </header>

      <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" role="alert" />

      <div v-if="loading" :class="$style.skeletons" aria-busy="true">
        <USkeleton v-for="n in 4" :key="n" :class="$style.skeleton" />
      </div>

      <template v-else>
        <section :class="$style.group">
          <h2 :class="$style.groupTitle">基本信息</h2>
          <div :class="$style.card">
            <div :class="[$style.cardBody, $style.formGrid]">
              <UFormField label="名称" name="name" required :error="fieldErrors.name">
                <UInput v-model="agent.name" class="w-full" maxlength="128" autocomplete="off" />
              </UFormField>
              <UFormField label="模型名称" name="modelName">
                <UInput v-model="agent.modelName" class="w-full" maxlength="128" autocomplete="off" placeholder="默认模型" />
              </UFormField>
              <UFormField label="描述" name="description" :class="$style.span2">
                <UTextarea v-model="agent.description" class="w-full" :rows="2" autoresize :maxrows="6" />
              </UFormField>
            </div>
          </div>
        </section>

        <section :class="$style.group">
          <h2 :class="$style.groupTitle">
            <label for="agent-form-prompt">系统提示词<span :class="$style.required" aria-hidden="true">*</span></label>
          </h2>
          <UFormField
            name="systemPrompt"
            :error="fieldErrors.systemPrompt"
            :class="[$style.card, $style.promptCard]"
            @click="focusPrompt"
          >
            <UTextarea
              id="agent-form-prompt"
              v-model="agent.systemPrompt"
              :class="$style.prompt"
              variant="none"
              :rows="8"
              autoresize
              :maxrows="24"
              aria-required="true"
              placeholder="你是一名……&#10;&#10;职责：&#10;- ……&#10;&#10;约束：&#10;- ……"
            />
            <span :class="[$style.counter, 'mono']">{{ promptLength }}</span>
          </UFormField>
        </section>

        <section :class="$style.group">
          <h2 :class="$style.groupTitle">能力</h2>
          <div :class="$style.card">
            <div :class="[$style.cardBody, $style.formGrid]">
              <UFormField label="技能" name="skillIds" :hint="agent.skillIds.length ? String(agent.skillIds.length) : undefined">
                <USelectMenu
                  v-model="agent.skillIds"
                  class="w-full"
                 
                  :items="skillItems"
                  value-key="value"
                  :filter-fields="['label', 'keywords']"
                  multiple
                  :loading="catalogsLoading"
                  placeholder="选择技能"
                  :search-input="{ placeholder: '搜索' }"
                >
                  <template #item-label="{ item }">
                    {{ item.label }}<span v-if="item.inactive" :class="$style.inactive">已停用</span>
                  </template>
                </USelectMenu>
              </UFormField>
              <UFormField label="工具" name="toolIds" :hint="agent.toolIds.length ? String(agent.toolIds.length) : undefined">
                <USelectMenu
                  v-model="agent.toolIds"
                  class="w-full"
                 
                  :items="toolItems"
                  value-key="value"
                  :filter-fields="['label', 'keywords']"
                  multiple
                  :loading="catalogsLoading"
                  placeholder="选择工具"
                  :search-input="{ placeholder: '搜索' }"
                >
                  <template #item-label="{ item }">
                    {{ item.label }}<span v-if="item.inactive" :class="$style.inactive">已停用</span><span v-if="item.restricted" :class="$style.inactive">不可新增绑定</span>
                  </template>
                </USelectMenu>
              </UFormField>
            </div>
          </div>
        </section>
      </template>
    </div>
  </main>
</template>

<style module src="./index.module.css"></style>
