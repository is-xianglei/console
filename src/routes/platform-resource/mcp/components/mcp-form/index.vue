<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ActionIconButton } from '@/components'
import { focusFirstError } from '@/hooks/useFormHelpers'
import type { McpApprovalMode, McpAuthType, McpVisibility } from '@/interfaces/mcp/api'
import type { McpFormField, McpFormModel, McpValidationIssue } from '@/interfaces/mcp/model'
import { canKeepHeaders, MCP_APPROVAL_LABEL, MCP_AUTH_LABEL, MCP_SERVER_KEY_MAX } from '@/utils/mcp'

/** 新建 / 编辑共用的 MCP server 表单：页头操作 + 基本信息、连接、工具策略三组。 */
defineOptions({ name: 'McpForm' })

const props = defineProps<{
  server: McpFormModel
  title: string
  issues: McpValidationIssue[]
  saving: boolean
  /** 工作区 owner / admin 才能建共享 server。 */
  canManageShared: boolean
  loading?: boolean
  error?: string
}>()
const emit = defineEmits<{ close: []; save: []; publish: [] }>()

const rootRef = ref<HTMLElement | null>(null)
/** 点过保存后才在字段下方显示错误。 */
const attempted = ref(false)

const isEdit = computed(() => props.server.id != null)

const fieldErrors = computed(() => {
  if (!attempted.value) return {} as Partial<Record<McpFormField, string>>
  return Object.fromEntries(props.issues.map((issue) => [issue.field, issue.message])) as Partial<Record<McpFormField, string>>
})

const visibilityItems = computed(() => [
  { value: 'workspace' as McpVisibility, label: '工作区共享', disabled: !props.canManageShared },
  { value: 'private' as McpVisibility, label: '仅自己' },
])

const authItems = (Object.keys(MCP_AUTH_LABEL) as McpAuthType[]).map((value) => ({ value, label: MCP_AUTH_LABEL[value] }))

const approvalItems = [
  { value: 'always', label: MCP_APPROVAL_LABEL.always },
  { value: 'trust_annotations', label: MCP_APPROVAL_LABEL.trust_annotations, description: '声明只读的工具免审批' },
  { value: 'never', label: MCP_APPROVAL_LABEL.never },
] as { value: McpApprovalMode; label: string; description?: string }[]

const keepHeaders = computed(() => canKeepHeaders(props.server))

function addHeader() {
  props.server.headers.push({ name: '', value: '' })
}

function removeHeader(index: number) {
  props.server.headers.splice(index, 1)
  if (!props.server.headers.length) addHeader()
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
        <ActionIconButton label="返回 MCP Servers" icon="i-lucide-arrow-left" @click="emit('close')" />
        <h1 :class="$style.title">{{ title }}</h1>
        <div :class="$style.actions">
          <UButton label="保存" color="neutral" variant="outline" :loading="saving" :disabled="saving || loading" @click="onSave" />
          <UButton label="保存并启用" color="primary" :loading="saving" :disabled="saving || loading" @click="onPublish" />
        </div>
      </header>

      <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" role="alert" />

      <div v-if="loading" :class="$style.skeletons" aria-busy="true">
        <USkeleton v-for="n in 3" :key="n" :class="$style.skeleton" />
      </div>

      <template v-else>
        <section :class="$style.group">
          <h2 :class="$style.groupTitle">基本信息</h2>
          <div :class="$style.card">
            <div :class="[$style.cardBody, $style.formGrid]">
              <UFormField label="名称" name="name" required :error="fieldErrors.name">
                <UInput v-model="server.name" class="w-full" maxlength="120" autocomplete="off" />
              </UFormField>
              <UFormField label="标识" name="serverKey" required :error="fieldErrors.serverKey">
                <UInput
                  v-model="server.serverKey"
                  :class="['w-full', 'mono']"
                  :maxlength="MCP_SERVER_KEY_MAX"
                  autocomplete="off"
                  spellcheck="false"
                  :disabled="isEdit"
                  placeholder="小写字母开头，如 deepwiki"
                />
              </UFormField>
              <UFormField label="可见范围" name="visibility" :class="$style.span2">
                <URadioGroup
                  v-model="server.visibility"
                  :items="visibilityItems"
                  value-key="value"
                  orientation="horizontal"
                  :disabled="isEdit"
                  :class="$style.radios"
                />
              </UFormField>
              <UFormField label="描述" name="description" :class="$style.span2">
                <UTextarea v-model="server.description" class="w-full" :rows="2" autoresize :maxrows="6" />
              </UFormField>
            </div>
          </div>
        </section>

        <section :class="$style.group">
          <h2 :class="$style.groupTitle">连接</h2>
          <div :class="$style.card">
            <div :class="[$style.cardBody, $style.formGrid]">
              <UFormField label="地址" name="url" required :error="fieldErrors.url" :class="$style.span2">
                <UInput
                  v-model="server.url"
                  :class="['w-full', 'mono']"
                  maxlength="2048"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="https://"
                />
              </UFormField>
              <UFormField label="认证" name="authType" :class="$style.span2">
                <URadioGroup
                  v-model="server.authType"
                  :items="authItems"
                  value-key="value"
                  orientation="horizontal"
                  variant="table"
                  indicator="hidden"
                  :class="$style.segmented"
                />
              </UFormField>
              <UFormField
                v-if="server.authType === 'static_headers'"
                label="请求头"
                name="headers"
                :required="!keepHeaders"
                :error="fieldErrors.headers"
                :help="keepHeaders ? '留空沿用现有请求头，填写后整体替换' : undefined"
                :class="$style.span2"
              >
                <div :class="$style.headerRows">
                  <div v-for="(row, index) in server.headers" :key="index" :class="$style.headerRow">
                    <UInput
                      v-model="row.name"
                      :class="['mono', $style.headerName]"
                      placeholder="Authorization"
                      autocomplete="off"
                      spellcheck="false"
                      :aria-label="`第 ${index + 1} 个请求头名称`"
                      :aria-invalid="Boolean(fieldErrors.headers) || undefined"
                    />
                    <UInput
                      v-model="row.value"
                      type="password"
                      :class="['mono', $style.headerValue]"
                      autocomplete="new-password"
                      :aria-label="`第 ${index + 1} 个请求头的值`"
                      :aria-invalid="Boolean(fieldErrors.headers) || undefined"
                    />
                    <ActionIconButton label="删除请求头" icon="i-lucide-x" @click="removeHeader(index)" />
                  </div>
                  <UButton icon="i-lucide-plus" label="添加请求头" color="neutral" variant="ghost" size="sm" :class="$style.addHeader" @click="addHeader" />
                </div>
              </UFormField>
            </div>
          </div>
        </section>

        <section :class="$style.group">
          <h2 :class="$style.groupTitle">工具策略</h2>
          <div :class="$style.card">
            <div :class="[$style.cardBody, $style.formGrid]">
              <UFormField label="审批" name="approvalMode">
                <USelect v-model="server.approvalMode" class="w-full" :items="approvalItems" value-key="value" />
              </UFormField>
              <UFormField label="调用超时" name="callTimeoutSeconds" :error="fieldErrors.callTimeoutSeconds">
                <UInput v-model="server.callTimeoutSeconds" class="w-full" inputmode="numeric" placeholder="默认" autocomplete="off">
                  <template #trailing><span :class="$style.unit">秒</span></template>
                </UInput>
              </UFormField>
              <UFormField label="白名单" name="toolAllowlist" :class="$style.span2">
                <UInputTags v-model="server.toolAllowlist" class="w-full" add-on-blur add-on-paste placeholder="工具原名，回车添加" />
              </UFormField>
              <UFormField label="黑名单" name="toolDenylist" :class="$style.span2">
                <UInputTags v-model="server.toolDenylist" class="w-full" add-on-blur add-on-paste placeholder="工具原名，回车添加" />
              </UFormField>
            </div>
          </div>
        </section>
      </template>
    </div>
  </main>
</template>

<style module src="./index.module.css"></style>
