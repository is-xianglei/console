<script setup lang="ts">
import { computed, ref, useCssModule, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AgentResponse } from '@/interfaces/agent/api'
import type { SkillResponse } from '@/interfaces/skill/model'
import type { ToolResponse } from '@/interfaces/tool/model'
import { useSaveFeedback } from '@/hooks/useSaveFeedback'
import { RelativeTime } from '@/components/resource'
import { useAgentsStore } from '@/stores/agents'

defineOptions({ name: 'AgentResourceDetail' })

const styles = useCssModule()
const route = useRoute()
const router = useRouter()
const agentsStore = useAgentsStore()
const pendingDelete = ref(false)
const deleting = ref(false)
const saveFeedback = useSaveFeedback({
  listRoute: { name: 'platform-resource', params: { module: 'build', resource: 'agents' } },
})

const TAB_KEYS = ['basic', 'members', 'server'] as const
type TabKey = (typeof TAB_KEYS)[number]

const tabItems = [
  { value: 'basic', label: '基础信息' },
  { value: 'members', label: '成员' },
  { value: 'server', label: '服务端信息' },
]

function isTabKey(value: unknown): value is TabKey {
  return typeof value === 'string' && (TAB_KEYS as readonly string[]).includes(value)
}

const activeTab = computed<TabKey>({
  get() {
    const raw = route.query.tab
    const value = Array.isArray(raw) ? raw[0] : raw
    return isTabKey(value) ? value : 'basic'
  },
  set(tab) {
    if (tab === activeTab.value) return
    void router.replace({ query: { ...route.query, tab } })
  },
})

const agentId = computed(() => {
  const value = route.params.id
  return Number(Array.isArray(value) ? value[0] : value)
})
const agent = computed<AgentResponse | null>(
  () => agentsStore.state.items.find((item) => item.id === agentId.value) ?? null,
)
const loading = computed(() => agentsStore.state.loading)
const skills = computed<SkillResponse[]>(() => agentsStore.state.skills)
const tools = computed<ToolResponse[]>(() => agentsStore.state.tools)
const skillNames = computed(() => skills.value.filter((skill) => agent.value?.skill_ids?.includes(skill.id)).map((skill) => skill.name))
const toolNames = computed(() => tools.value.filter((tool) => agent.value?.tool_ids?.includes(tool.id)).map((tool) => tool.name))

function goToList() {
  void router.push({ name: 'platform-resource', params: { module: 'build', resource: 'agents' } })
}

function goToEdit() {
  void router.push({ name: 'agent-edit', params: { id: String(agentId.value) } })
}

function goToDuplicate() {
  void router.push({ name: 'agent-create', params: { module: 'build', resource: 'agents' }, query: { duplicate: String(agentId.value) } })
}

async function confirmDelete() {
  if (!agent.value || deleting.value) return
  deleting.value = true
  try {
    const error = await agentsStore.removeAgent(agent.value.id)
    if (error === undefined) return
    if (error) return
    await saveFeedback.afterDelete({ message: '已删除 Agent' })
  } finally {
    deleting.value = false
    pendingDelete.value = false
  }
}

watch(
  () => route.params.id,
  () => void agentsStore.loadAll(),
  { immediate: true },
)
</script>

<template>
  <main :class="styles['ag-page']">
    <header :class="styles['ag-page-head']">
      <div :class="styles['ag-heading']"><nav aria-label="面包屑"><span>构建资源</span><i class="icon icon-chevron-right"></i><strong>智能体编排</strong><i class="icon icon-chevron-right"></i><strong>详情</strong></nav><div><span :class="styles['ag-page-icon']"><i class="icon icon-bot"></i></span><span><h1>{{ agent?.name ?? 'Agent 详情' }}</h1><p v-if="agent">AGT-{{ String(agent.id).padStart(4, '0') }} · 由后端持久化，绑定模型、Skill 与 Tool。</p><p v-else>查看 Agent 的配置摘要、绑定能力与系统提示词。</p></span></div></div>
      <div :class="styles['ag-page-actions']"><span :class="[styles['ag-local-badge'], 'mono']"><i class="icon icon-database"></i>API CONNECTED</span><UButton :class="styles['ag-secondary-button']" icon="i-lucide-arrow-left" label="返回列表" @click="goToList" /></div>
    </header>

    <UAlert v-if="!loading && !agent" color="error" variant="subtle" icon="i-lucide-circle-alert" title="Agent 详情加载失败" description="未找到该 Agent，可能已被删除或工作区已切换。" :actions="[{ label: '返回列表', color: 'neutral', variant: 'outline', onClick: goToList }]" />

    <section v-if="agent" :class="styles['ag-detail-shell']" aria-label="Agent 详情">
      <div :class="styles['ag-detail-state']"><UBadge color="neutral" variant="subtle" :class="[styles['ag-lifecycle'], agent.is_enabled ? 'published' : 'disabled']"><span class="dot" :class="agent.is_enabled ? 'nominal' : 'idle'"></span>{{ agent.is_enabled ? '已启用' : '已停用' }}</UBadge><span class="mono"><RelativeTime :value="agent.updated_at" /></span></div>
      <p :class="styles['ag-detail-description']">{{ agent.description || '未填写用途描述' }}</p>

      <UTabs v-model="activeTab" :items="tabItems" :content="false" variant="link" size="sm" :class="styles['ag-detail-tabs']" />

      <div v-if="activeTab === 'basic'" :class="styles['ag-detail-pane']">
        <section :class="styles['ag-detail-section']"><h3>配置摘要</h3><dl><div><dt>模型</dt><dd>{{ agent.model_name || '平台默认模型' }}</dd></div><div><dt>Skills</dt><dd>{{ agent.skill_ids?.length ?? 0 }}</dd></div><div><dt>Tools</dt><dd>{{ agent.tool_ids?.length ?? 0 }}</dd></div><div><dt>创建者 ID</dt><dd class="mono">{{ agent.created_by_user_id }}</dd></div></dl></section>
      </div>

      <div v-else-if="activeTab === 'members'" :class="styles['ag-detail-pane']">
        <section :class="styles['ag-detail-section']"><h3>绑定能力</h3><div :class="styles['ag-detail-bindings']"><span v-for="skill in skillNames" :key="skill"><i class="icon icon-wrench"></i>{{ skill }}</span><span v-for="tool in toolNames" :key="tool"><i class="icon icon-hammer"></i>{{ tool }}</span><em v-if="!skillNames.length && !toolNames.length">尚未绑定能力</em></div></section>

        <section :class="styles['ag-detail-section']"><h3>系统提示词</h3><p :class="styles['ag-prompt-preview']">{{ agent.system_prompt }}</p></section>
      </div>

      <div v-else :class="styles['ag-detail-pane']">
        <section :class="styles['ag-detail-section']"><h3>服务端信息</h3><dl><div><dt>Agent ID</dt><dd class="mono">{{ agent.id }}</dd></div><div><dt>工作区 ID</dt><dd class="mono">{{ agent.workspace_id }}</dd></div><div><dt>创建时间</dt><dd><RelativeTime :value="agent.created_at" /></dd></div><div><dt>更新时间</dt><dd><RelativeTime :value="agent.updated_at" /></dd></div></dl></section>
      </div>

      <footer :class="styles['ag-detail-actions']">
        <UButton :class="styles['ag-icon-button']" icon="i-lucide-trash-2" color="error" variant="ghost" square aria-label="删除当前 Agent" @click="pendingDelete = true" />
        <UButton :class="styles['ag-secondary-button']" icon="i-lucide-copy" color="neutral" variant="outline" label="复制" @click="goToDuplicate" />
        <UButton :class="styles['ag-primary-button']" icon="i-lucide-sliders-horizontal" label="配置 Agent" @click="goToEdit" />
      </footer>
    </section>

    <UModal :open="pendingDelete" class="ag-confirm-modal" :title="`删除 ${agent?.name ?? 'Agent'}？`" description="删除后该 Agent 将从当前工作区移除，已有会话记录不会被改绑。" @update:open="(open) => { if (!open) pendingDelete = false }">
      <template #body><p class="modal-copy">此操作会调用 Agents 删除接口，无法在前端撤销。</p></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="deleting" @click="pendingDelete = false" /><UButton label="确认删除" color="error" :loading="deleting" :disabled="deleting" @click="confirmDelete" /></template>
    </UModal>
  </main>
</template>

<style module src="./index.module.css"></style>
