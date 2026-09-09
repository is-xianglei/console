<script setup lang="ts">
import { computed, ref, useCssModule, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PLAN_MODE_LABEL } from '@/hooks/useOrchestrationPlanManager'
import { useSaveFeedback } from '@/hooks/useSaveFeedback'
import type { PlanResponse } from '@/interfaces/orchestration-plan/api'
import { RelativeTime } from '@/components/resource'
import { useAgentsStore } from '@/stores/agents'
import { useOrchestrationPlansStore } from '@/stores/orchestrationPlans'

defineOptions({ name: 'PlanResourceDetail' })

const styles = useCssModule()
const route = useRoute()
const router = useRouter()
const plansStore = useOrchestrationPlansStore()
const agentsStore = useAgentsStore()
const pendingDelete = ref(false)
const deleting = ref(false)
const saveFeedback = useSaveFeedback({
  listRoute: { name: 'platform-resource', params: { module: 'build', resource: 'plans' } },
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

const planId = computed(() => {
  const value = route.params.id
  return Number(Array.isArray(value) ? value[0] : value)
})
const detail = computed<PlanResponse | null>(
  () => plansStore.state.items.find((item) => item.id === planId.value) ?? null,
)
const loading = computed(() => plansStore.state.loading || agentsStore.state.loading)

function planCode(id: number) {
  return `PLAN-${String(id).padStart(4, '0')}`
}

function sortedMembers(plan: PlanResponse) {
  return [...plan.members].sort((left, right) => left.position - right.position)
}

function isMemberAvailable(member: PlanResponse['members'][number]) {
  return member.is_available
}

function brokenMembers(plan: PlanResponse) {
  return plan.members.filter((member) => !member.is_available).length
}

function goToList() {
  void router.push({ name: 'platform-resource', params: { module: 'build', resource: 'plans' } })
}

function goToEdit() {
  void router.push({ name: 'plan-edit', params: { id: String(planId.value) } })
}

function goToDuplicate() {
  void router.push({ name: 'plan-create', params: { module: 'build', resource: 'plans' }, query: { duplicate: String(planId.value) } })
}

function requestDelete() {
  if (!detail.value) return
  pendingDelete.value = true
}

async function confirmDelete() {
  if (!detail.value || deleting.value) return
  deleting.value = true
  try {
    const error = await plansStore.removePlan(detail.value.id)
    if (error === undefined) return
    if (error) return
    await saveFeedback.afterDelete({ message: '已删除编排方案' })
  } finally {
    deleting.value = false
    pendingDelete.value = false
  }
}

async function load() {
  if (Number.isNaN(planId.value)) return
  await Promise.all([
    plansStore.loadPlanDetail(planId.value),
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
  <main :class="styles['pl-page']">
    <header :class="styles['pl-page-head']">
      <div :class="styles['pl-heading']"><nav aria-label="面包屑"><span>构建资源</span><i class="icon icon-chevron-right"></i><strong>智能体编排</strong><i class="icon icon-chevron-right"></i><strong>详情</strong></nav><div><span :class="styles['pl-page-icon']"><i class="icon icon-workflow"></i></span><span><h1>{{ detail?.name ?? '编排方案详情' }}</h1><p v-if="detail">{{ planCode(detail.id) }} · 由后端持久化，会话绑定后按编排模式执行。</p><p v-else>查看编排方案的成员组成、编排模式与服务端信息。</p></span></div></div>
      <div :class="styles['pl-page-actions']"><span :class="[styles['pl-local-badge'], 'mono']"><i class="icon icon-database"></i>API CONNECTED</span><UButton :class="styles['pl-secondary-button']" icon="i-lucide-arrow-left" label="返回列表" @click="goToList" /></div>
    </header>

    <UAlert v-if="!loading && !detail" color="error" variant="subtle" icon="i-lucide-circle-alert" title="编排方案详情加载失败" description="未找到该方案，可能已被删除或工作区已切换。" :actions="[{ label: '返回列表', color: 'neutral', variant: 'outline', onClick: goToList }]" />

    <section v-if="detail" :class="styles['pl-detail-shell']" aria-label="编排方案详情">
      <div :class="styles['pl-detail-top']">
        <UBadge color="neutral" variant="subtle" :class="[styles['pl-lifecycle'], detail.is_enabled ? 'published' : 'disabled']"><span class="dot" :class="detail.is_enabled ? 'nominal' : 'idle'"></span>{{ detail.is_enabled ? '已启用' : '已停用' }}</UBadge>
        <span :class="styles['pl-detail-mode']">{{ PLAN_MODE_LABEL[detail.mode] }} <small class="mono">{{ detail.mode.toUpperCase() }}</small></span>
        <UAlert v-if="brokenMembers(detail) > 0" color="error" variant="subtle" icon="i-lucide-triangle-alert" title="部分成员 Agent 已停用，方案将无法运行。" />
      </div>

      <UTabs v-model="activeTab" :items="tabItems" :content="false" variant="link" size="sm" :class="styles['pl-detail-tabs']" />

      <div v-if="activeTab === 'basic'" :class="styles['pl-detail-pane']">
        <dl :class="styles['pl-detail-list']">
          <div><dt>描述</dt><dd>{{ detail.description || '未填写用途描述' }}</dd></div>
          <div><dt>模式</dt><dd>{{ PLAN_MODE_LABEL[detail.mode] }} <small class="mono">{{ detail.mode.toUpperCase() }}</small></dd></div>
          <div><dt>状态</dt><dd>{{ detail.is_enabled ? '已启用' : '已停用' }}</dd></div>
        </dl>
      </div>

      <div v-else-if="activeTab === 'members'" :class="styles['pl-detail-pane']">
        <ol :class="styles['pl-detail-members']">
          <li v-for="member in sortedMembers(detail)" :key="member.id" :class="{ [styles.unavailable]: !isMemberAvailable(member) }">
            <span class="mono">{{ String(member.position + 1).padStart(2, '0') }}</span>
            <span :class="styles['pl-detail-member-main']">
              <strong>{{ member.agent_name }}</strong>
              <small v-if="typeof member.role_config.route_key === 'string' && member.role_config.route_key" class="mono">{{ member.role_config.route_key }}</small>
            </span>
            <em v-if="!isMemberAvailable(member)"><i class="icon icon-triangle-alert"></i>已停用</em>
          </li>
        </ol>
        <p v-if="!detail.members.length" :class="styles['pl-detail-empty']">尚未添加任何成员。</p>
      </div>

      <div v-else :class="styles['pl-detail-pane']">
        <dl :class="styles['pl-detail-list']">
          <div><dt>方案 ID</dt><dd class="mono">{{ detail.id }}</dd></div>
          <div><dt>工作区 ID</dt><dd class="mono">{{ detail.workspace_id }}</dd></div>
          <div><dt>创建者 ID</dt><dd class="mono">{{ detail.created_by_user_id }}</dd></div>
          <div><dt>创建时间</dt><dd><RelativeTime :value="detail.created_at" /></dd></div>
          <div><dt>更新时间</dt><dd><RelativeTime :value="detail.updated_at" /></dd></div>
        </dl>
      </div>

      <footer :class="styles['pl-detail-actions']">
        <UButton :class="styles['pl-icon-button']" icon="i-lucide-trash-2" color="error" variant="ghost" square aria-label="删除当前方案" @click="requestDelete" />
        <UButton :class="styles['pl-secondary-button']" icon="i-lucide-copy" color="neutral" variant="outline" label="复制" @click="goToDuplicate" />
        <UButton :class="styles['pl-primary-button']" icon="i-lucide-sliders-horizontal" label="配置" @click="goToEdit" />
      </footer>
    </section>

    <UModal :open="pendingDelete" class="ag-confirm-modal" :title="`删除 ${detail?.name ?? '编排方案'}？`" description="删除后该方案将从当前工作区移除，已绑定的会话需要重新选择编排。" @update:open="(open) => { if (!open) pendingDelete = false }">
      <template #body><p :class="styles['pl-modal-copy']">此操作会调用编排方案删除接口，无法在前端撤销。</p></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="deleting" @click="pendingDelete = false" /><UButton label="确认删除" color="error" :loading="deleting" :disabled="deleting" @click="confirmDelete" /></template>
    </UModal>
  </main>
</template>

<style module src="./index.module.css"></style>
