<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import { useToast } from '@nuxt/ui/composables'
import { computed, onMounted, reactive, ref } from 'vue'
import type { PermissionBehavior } from '@/interfaces/permission/model'
import { usePermissionsStore } from '@/stores/permissions'

defineOptions({ name: 'ToolsSection' })

const { state, loadPermissionRules, savePermissionRule, removePermissionRule } = usePermissionsStore()
const toast = useToast()

// 新增规则表单
const form = reactive({
  tool: '',
  behavior: 'ask' as PermissionBehavior,
})
const saving = ref(false)
const deletingId = ref<number | null>(null)
const pendingDeleteId = ref<number | null>(null)
const pendingDeleteName = ref('')

/** 只展示全局规则(会话级规则在对话里通过"始终允许"产生,不在此集中管理) */
const globalRules = computed(() => state.permissionRules.filter((r) => r.scope === 'global'))

const behaviorLabel: Record<string, string> = {
  allow: '允许',
  ask: '询问',
  deny: '拒绝',
}
const behaviorOptions = (['allow', 'ask', 'deny'] as PermissionBehavior[]).map((value) => ({
  label: behaviorLabel[value],
  value,
}))
/** 规则行右侧的状态文字：颜色 + 图标区分三种行为。 */
const behaviorStatus: Record<string, { label: string; tone: string; icon: string }> = {
  allow: { label: '始终允许', tone: 'success', icon: 'i-lucide-circle-check' },
  ask: { label: '始终询问', tone: 'warning', icon: 'i-lucide-circle-help' },
  deny: { label: '始终拒绝', tone: 'error', icon: 'i-lucide-circle-x' },
}
function statusOf(behavior: string) {
  return behaviorStatus[behavior] ?? { label: behavior, tone: 'muted', icon: 'i-lucide-circle-dashed' }
}

function validate(values: Partial<typeof form>): FormError[] {
  return values.tool?.trim() ? [] : [{ name: 'tool', message: '请输入工具名' }]
}

async function onAddRule() {
  const tool = form.tool.trim()
  if (!tool || saving.value) return
  saving.value = true
  const message = await savePermissionRule({ scope: 'global', tool_name: tool, behavior: form.behavior })
  saving.value = false
  if (message === null) {
    form.tool = ''
    form.behavior = 'ask'
    toast.add({ title: '全局规则已添加', color: 'success', icon: 'i-lucide-circle-check' })
  } else {
    toast.add({ title: '添加规则失败', description: message, color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

async function handleDelete(id: number) {
  deletingId.value = id
  const message = await removePermissionRule(id)
  deletingId.value = null
  if (message) {
    toast.add({ title: '删除规则失败', description: message, color: 'error', icon: 'i-lucide-circle-alert' })
  } else {
    toast.add({ title: '全局规则已删除', color: 'success', icon: 'i-lucide-circle-check' })
  }
}

async function onConfirmDelete() {
  if (pendingDeleteId.value === null) return
  const id = pendingDeleteId.value
  await handleDelete(id)
  if (!state.permissionRules.some((rule) => rule.id === id)) pendingDeleteId.value = null
}

onMounted(() => {
  loadPermissionRules('global')
})
</script>

<template>
  <div :class="$style.stack">
    <section :class="$style.group" aria-labelledby="tools-add-title">
      <header :class="$style.groupHeader">
        <h3 id="tools-add-title" :class="$style.groupTitle">添加规则</h3>
      </header>
      <UCard :ui="{ body: 'py-0 sm:py-0' }">
        <UForm
          :class="[$style.cardBody, $style.addForm]"
          :state="form"
          :validate="validate"
          :disabled="saving"
          @submit="onAddRule"
        >
          <UFormField :class="$style.toolField" name="tool">
            <UInput v-model="form.tool" :class="[$style.toolInput, 'mono']" aria-label="工具名" placeholder="工具名，如 Bash" />
          </UFormField>
          <UFormField :class="$style.behaviorField" name="behavior">
            <UTabs
              v-model="form.behavior"
              :items="behaviorOptions"
              :content="false"
              :ui="{ list: 'w-full', trigger: 'grow' }"
            />
          </UFormField>
          <UButton :class="$style.addButton" type="submit" icon="i-lucide-plus" label="添加" :disabled="!form.tool.trim()" :loading="saving" />
        </UForm>
      </UCard>
    </section>

    <section :class="$style.group" aria-labelledby="tools-rules-title">
      <header :class="$style.groupHeader">
        <h3 id="tools-rules-title" :class="$style.groupTitle">
          全局规则
          <span :class="$style.count">{{ globalRules.length }}</span>
        </h3>
      </header>
      <UCard :ui="{ body: 'py-0 sm:py-0' }">
        <ul v-if="state.permissionRulesLoading" :class="$style.rows" aria-busy="true">
          <li v-for="index in 2" :key="index" :class="$style.row">
            <div :class="$style.rowMain"><USkeleton class="h-4 w-32" /></div>
            <USkeleton class="h-4 w-24" />
          </li>
        </ul>
        <UEmpty
          v-else-if="!globalRules.length"
          variant="naked"
          icon="i-lucide-shield-check"
          title="暂无全局规则"
          description="危险工具（如 Bash）默认询问。"
        />
        <ul v-else :class="$style.rows">
          <li v-for="r in globalRules" :key="r.id" :class="$style.row">
            <div :class="$style.rowMain">
              <span :class="[$style.rowTitle, 'mono']">{{ r.tool_name }}</span>
              <span v-if="r.source === 'always_allow'" :class="$style.rowMeta">来自对话中的「始终允许」</span>
            </div>
            <div :class="$style.rowActions">
              <span :class="$style.behavior" :data-tone="statusOf(r.behavior).tone">
                <UIcon :name="statusOf(r.behavior).icon" :class="$style.behaviorIcon" aria-hidden="true" />
                {{ statusOf(r.behavior).label }}
              </span>
              <UButton
                color="neutral"
                variant="ghost"
                label="删除"
                :loading="deletingId === r.id"
                :disabled="deletingId !== null && deletingId !== r.id"
                :aria-label="`删除规则 ${r.tool_name}`"
                @click="pendingDeleteId = r.id; pendingDeleteName = r.tool_name"
              />
            </div>
          </li>
        </ul>
      </UCard>
    </section>

    <UModal
      :open="pendingDeleteId !== null"
      title="删除全局规则"
      :description="`将删除规则「${pendingDeleteName}」，该工具将恢复平台默认权限策略。`"
      @update:open="(open) => { if (!open) { pendingDeleteId = null; pendingDeleteName = '' } }"
    >
      <template #footer>
        <UButton color="neutral" variant="outline" label="取消" @click="pendingDeleteId = null" />
        <UButton color="error" label="确认删除" :loading="deletingId !== null" @click="onConfirmDelete" />
      </template>
    </UModal>
  </div>
</template>

<style module src="./index.module.css"></style>
