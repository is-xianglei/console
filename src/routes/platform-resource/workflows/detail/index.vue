<script setup lang="ts">
import { computed, ref, useCssModule, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { WORKFLOW_MODE_LABEL } from '@/constants/workflow'
import { isWorkflowMemberAvailable } from '@/hooks/useWorkflowManager'
import type { WorkflowResponse } from '@/interfaces/workflow/api'
import { useAgentsStore } from '@/stores/agents'
import { useWorkflowsStore } from '@/stores/workflows'

defineOptions({ name: 'WorkflowResourceDetail' })

const styles = useCssModule()
const route = useRoute()
const router = useRouter()
const workflowsStore = useWorkflowsStore()
const agentsStore = useAgentsStore()
const pendingDelete = ref(false)
const deleting = ref(false)

const workflowId = computed(() => {
  const value = route.params.id
  return Number(Array.isArray(value) ? value[0] : value)
})
const detail = computed<WorkflowResponse | null>(
  () => workflowsStore.state.items.find((item) => item.id === workflowId.value) ?? null,
)
const loading = computed(() => workflowsStore.state.loading || agentsStore.state.loading)
const agents = computed(() => agentsStore.state.items)

function isMemberAvailable(member: WorkflowResponse['agents'][number]) {
  return isWorkflowMemberAvailable(member, agents.value)
}

function brokenMembers(workflow: WorkflowResponse) {
  return workflow.agents.filter((member) => !isMemberAvailable(member)).length
}

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false })
}

function goToList() {
  void router.push({ name: 'platform-resource', params: { module: 'build', resource: 'workflows' } })
}

function goToEdit() {
  void router.push({ name: 'workflow-edit', params: { id: String(workflowId.value) } })
}

function goToDuplicate() {
  void router.push({ name: 'workflow-create', params: { module: 'build', resource: 'workflows' }, query: { duplicate: String(workflowId.value) } })
}

function requestDelete() {
  if (!detail.value) return
  pendingDelete.value = true
}

async function confirmDelete() {
  if (!detail.value || deleting.value) return
  deleting.value = true
  try {
    const error = await workflowsStore.removeWorkflow(detail.value.id)
    if (error === undefined) return
    if (error) return
    goToList()
  } finally {
    deleting.value = false
    pendingDelete.value = false
  }
}

async function load() {
  if (Number.isNaN(workflowId.value)) return
  await Promise.all([
    workflowsStore.loadWorkflowDetail(workflowId.value),
    agentsStore.loadAgents(),
  ])
}

watch(
  () => route.params.id,
  () => void load(),
  { immediate: true },
)
</script>

<template>
  <main :class="styles['wf-page']">
    <header :class="styles['wf-page-head']">
      <div :class="styles['wf-heading']"><nav aria-label="面包屑"><span>构建资源</span><i class="icon icon-chevron-right"></i><strong>Workflows</strong><i class="icon icon-chevron-right"></i><strong>详情</strong></nav><div><span :class="styles['wf-page-icon']"><i class="icon icon-workflow"></i></span><span><h1>{{ detail?.name ?? 'Workflow 详情' }}</h1><p v-if="detail">WF-{{ String(detail.id).padStart(4, '0') }} · 由后端持久化，会话绑定后按编排模式执行。</p><p v-else>查看 Workflow 的成员组成、编排模式与服务端信息。</p></span></div></div>
      <div :class="styles['wf-page-actions']"><span :class="[styles['wf-local-badge'], 'mono']"><i class="icon icon-database"></i>API CONNECTED</span><UButton :class="styles['wf-secondary-button']" icon="i-lucide-arrow-left" label="返回列表" @click="goToList" /></div>
    </header>

    <UAlert v-if="!loading && !detail" color="error" variant="subtle" icon="i-lucide-circle-alert" title="Workflow 详情加载失败" description="未找到该 Workflow，可能已被删除或工作区已切换。" :actions="[{ label: '返回列表', color: 'neutral', variant: 'outline', onClick: goToList }]" />

    <section v-if="detail" :class="styles['wf-detail-shell']" aria-label="Workflow 详情">
      <div :class="styles['wf-detail-top']">
        <UBadge color="neutral" variant="subtle" :class="[styles['wf-lifecycle'], detail.is_enabled ? 'published' : 'disabled']"><span class="dot" :class="detail.is_enabled ? 'nominal' : 'idle'"></span>{{ detail.is_enabled ? '已启用' : '已停用' }}</UBadge>
        <span :class="styles['wf-detail-mode']">{{ WORKFLOW_MODE_LABEL[detail.mode] }} <small class="mono">{{ detail.mode.toUpperCase() }}</small></span>
        <UAlert v-if="brokenMembers(detail) > 0" color="error" variant="subtle" icon="i-lucide-triangle-alert" title="部分成员 Agent 已停用或已删除，Workflow 将无法运行。" />
      </div>

      <p :class="styles['wf-detail-description']">{{ detail.description || '未填写用途描述' }}</p>

      <section :class="styles['wf-detail-section']">
        <h3>执行成员</h3>
        <ol :class="styles['wf-detail-members']">
          <li v-for="(member, index) in [...detail.agents].sort((left, right) => left.sort_order - right.sort_order || left.agent_id - right.agent_id)" :key="`${member.agent_id}-${member.sort_order}`" :class="{ [styles.unavailable]: !isMemberAvailable(member) }">
            <span class="mono">{{ String(index + 1).padStart(2, '0') }}</span>
            <span :class="styles['wf-detail-member-main']">
              <strong>{{ member.agent_name ?? '已删除的 Agent' }}</strong>
              <small class="mono">AGT-{{ String(member.agent_id).padStart(4, '0') }}</small>
            </span>
            <em v-if="!isMemberAvailable(member)"><i class="icon icon-triangle-alert"></i>已失效</em>
          </li>
        </ol>
        <p v-if="!detail.agents.length" :class="styles['wf-detail-empty']">尚未添加任何执行成员。</p>
      </section>

      <section :class="styles['wf-detail-section']">
        <h3>服务端信息</h3>
        <dl :class="styles['wf-detail-list']">
          <div><dt>Workflow ID</dt><dd class="mono">{{ detail.id }}</dd></div>
          <div><dt>工作区 ID</dt><dd class="mono">{{ detail.workspace_id }}</dd></div>
          <div><dt>创建者 ID</dt><dd class="mono">{{ detail.created_by_user_id }}</dd></div>
          <div><dt>创建时间</dt><dd>{{ formatTime(detail.created_at) }}</dd></div>
          <div><dt>更新时间</dt><dd>{{ formatTime(detail.updated_at) }}</dd></div>
        </dl>
      </section>

      <footer :class="styles['wf-detail-actions']">
        <UButton :class="styles['wf-icon-button']" icon="i-lucide-trash-2" color="error" variant="ghost" square aria-label="删除当前 Workflow" @click="requestDelete" />
        <UButton :class="styles['wf-secondary-button']" icon="i-lucide-copy" color="neutral" variant="outline" label="复制" @click="goToDuplicate" />
        <UButton :class="styles['wf-primary-button']" icon="i-lucide-pencil" label="编辑" @click="goToEdit" />
      </footer>
    </section>

    <UModal :open="pendingDelete" class="ag-confirm-modal" :title="`删除 ${detail?.name ?? 'Workflow'}？`" description="删除后不可恢复，请确认是否继续。" @update:open="(open) => { if (!open) pendingDelete = false }">
      <template #body><p :class="styles['wf-modal-copy']">此操作会调用 Workflow 删除接口，删除后该 Workflow 将从当前工作区移除，无法在前端撤销。</p></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="deleting" @click="pendingDelete = false" /><UButton label="确认删除" color="error" :loading="deleting" :disabled="deleting" @click="confirmDelete" /></template>
    </UModal>
  </main>
</template>

<style module src="./index.module.css"></style>
