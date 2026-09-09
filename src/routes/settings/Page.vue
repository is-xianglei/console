<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import { useToast } from '@nuxt/ui/composables'
import { computed, onMounted, reactive, ref } from 'vue'
import type { PermissionBehavior } from '@/interfaces/permission/model'
import { usePermissionsStore } from '@/stores/permissions'

defineOptions({ name: 'SettingsPage' })

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
  allow: '放行',
  ask: '需审批',
  deny: '拒绝',
}
const behaviorOptions = (['allow', 'ask', 'deny'] as PermissionBehavior[]).map((value) => ({
  label: behaviorLabel[value],
  value,
}))

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
  <main :class="$style.settings">
    <div :class="$style['set-scroll']">
      <div :class="$style['set-inner']">
        <header :class="$style['set-head']">
          <div>
            <h1 :class="$style['set-title']">设置 · 工具权限</h1>
            <p :class="$style['set-sub']">
              配置哪些工具在执行前需要审批。<strong>需审批</strong>的工具会在对话中弹出批准/拒绝卡片;
              <strong>拒绝</strong>的工具直接被阻止;<strong>放行</strong>的工具静默执行。
            </p>
          </div>
        </header>

        <!-- 新增规则 -->
        <section :class="$style['set-card']">
          <div :class="$style['set-card-title']">添加全局规则</div>
          <UForm
            :class="$style['set-form']"
            :state="form"
            :validate="validate"
            :disabled="saving"
            @submit="onAddRule"
          >
            <UFormField :class="$style['set-tool-item']" name="tool">
              <UInput v-model="form.tool" :class="[$style['set-input'], 'mono']" placeholder="工具名，如 Bash" />
            </UFormField>
            <UFormField :class="$style['set-behavior-item']" name="behavior">
              <UTabs
                v-model="form.behavior"
                :class="$style['set-segmented']"
                :items="behaviorOptions"
                :content="false"
                :ui="{ list: 'w-full', trigger: 'grow' }"
              />
            </UFormField>
            <UButton :class="$style['set-submit-item']" type="submit" icon="i-lucide-plus" label="添加" :disabled="!form.tool.trim()" :loading="saving" />
          </UForm>
        </section>

        <!-- 规则列表 -->
        <section :class="$style['set-card']">
          <div :class="$style['set-card-title']">
            全局规则
            <span :class="[$style['set-count'], 'mono']">{{ globalRules.length }}</span>
          </div>

          <div v-if="state.permissionRulesLoading" :class="$style['set-loading']">
            <UIcon name="i-lucide-loader-circle" :class="$style['set-spinner']" />
            <span>加载中…</span>
          </div>
          <UEmpty
            v-else-if="!globalRules.length"
            :class="$style['set-empty']"
            variant="naked"
            icon="i-lucide-shield-check"
            title="暂无全局规则"
            description="暂无全局规则。危险工具(如 Bash)默认即需审批。"
          />
          <ul v-else :class="$style['set-list']">
            <li v-for="r in globalRules" :key="r.id" :class="$style['set-row']">
              <span :class="[$style['set-tool'], 'mono']">{{ r.tool_name }}</span>
              <UBadge :class="[$style['set-badge'], $style[r.behavior]]" color="neutral" variant="subtle" :label="behaviorLabel[r.behavior] ?? r.behavior" />
              <span v-if="r.source === 'always_allow'" :class="$style['set-source']">始终允许</span>
              <span :class="$style['set-spacer']"></span>
              <UTooltip text="删除规则">
                <UButton
                  :class="$style['set-delete']"
                  color="error"
                  variant="ghost"
                  icon="i-lucide-trash-2"
                  square
                  :loading="deletingId === r.id"
                  :disabled="deletingId !== null && deletingId !== r.id"
                  aria-label="删除规则"
                  @click="pendingDeleteId = r.id; pendingDeleteName = r.tool_name"
                />
              </UTooltip>
            </li>
          </ul>
        </section>
      </div>
    </div>

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
  </main>
</template>

<style module src="./index.module.css"></style>
