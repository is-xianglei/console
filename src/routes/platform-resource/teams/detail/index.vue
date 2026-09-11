<script setup lang="ts">
import { computed, ref, useCssModule, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RelativeTime } from '@/components'
import { useSaveFeedback } from '@/hooks/useSaveFeedback'
import {
  TEAM_MODE_LABEL,
  type TeamFormModel,
  type TeamMember,
  teamCode,
} from '@/interfaces/platform-team/model'
import { useAgentsStore } from '@/stores/agents'
import { useTeamsStore } from '@/stores/teams'

defineOptions({ name: 'TeamResourceDetail' })

const styles = useCssModule()
const route = useRoute()
const router = useRouter()
const teamsStore = useTeamsStore()
const agentsStore = useAgentsStore()
const pendingDelete = ref(false)
const deleting = ref(false)

const listRoute = { name: 'platform-resource', params: { module: 'build', resource: 'teams' } } as const
const saveFeedback = useSaveFeedback({ listRoute })

const TAB_KEYS = ['basic', 'members', 'runtime'] as const
type TabKey = (typeof TAB_KEYS)[number]

const tabItems = [
  { value: 'basic', label: '基础信息' },
  { value: 'members', label: '成员' },
  { value: 'runtime', label: '运行策略' },
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

/** Teams 的 id 是「TEAM-0001」形态的目录编号，直接按字符串查找。 */
const teamId = computed(() => {
  const raw = route.params.id
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' ? value.trim() : ''
})

const detail = computed<TeamFormModel | null>(() => (teamId.value ? teamsStore.findTeam(teamId.value) : null))

const STATUS_LABEL: Record<TeamFormModel['status'], string> = {
  nominal: '正常',
  warning: '需关注',
  error: '异常',
  idle: '未启用',
}

const entryIndex = computed(() => {
  const team = detail.value
  if (!team || !team.members.length) return -1
  return team.entryIndex >= 0 && team.entryIndex < team.members.length ? team.entryIndex : 0
})

/** 已停用且不是入口的成员会让 Team 无法完整运行，详情页标红提示。 */
const stoppedMembers = computed(() => {
  const team = detail.value
  if (!team) return []
  return team.members.filter((member, index) => index !== entryIndex.value && !isAvailable(member))
})

/** 只在 Agent 目录里查得到且被停用时才算不可用，查不到视为未知而非异常。 */
function isAvailable(member: TeamMember) {
  if (!member.agentId) return false
  const agent = agentsStore.state.items.find((item) => String(item.id) === member.agentId)
  return agent ? agent.is_enabled : true
}

function memberCode(member: TeamMember) {
  return member.agentId ? `AGT-${member.agentId}` : '未指派'
}

function goToList() {
  void router.push(listRoute)
}

function goToEdit() {
  void router.push({ name: 'team-edit', params: { id: teamId.value } })
}

function goToDuplicate() {
  void router.push({ name: 'team-create', params: { module: 'build', resource: 'teams' }, query: { duplicate: teamId.value } })
}

function requestDelete() {
  if (!detail.value) return
  pendingDelete.value = true
}

async function confirmDelete() {
  const team = detail.value
  if (!team || deleting.value) return
  deleting.value = true
  try {
    const name = team.name
    teamsStore.removeTeam(team.id)
    pendingDelete.value = false
    await saveFeedback.afterDelete({ message: `Team「${name}」已删除` })
  } finally {
    deleting.value = false
  }
}

watch(
  () => teamId.value,
  () => {
    pendingDelete.value = false
    if (!teamId.value) return
    teamsStore.ensureLoaded()
    if (!agentsStore.state.items.length) void agentsStore.loadAgents()
  },
  { immediate: true },
)
</script>

<template>
  <main :class="styles['tm-page']">
    <header :class="styles['tm-page-head']">
      <div :class="styles['tm-heading']"><nav aria-label="面包屑"><span>构建资源</span><i class="icon icon-chevron-right"></i><strong>智能体编排</strong><i class="icon icon-chevron-right"></i><strong>详情</strong></nav><div><span :class="styles['tm-page-icon']"><i class="icon icon-users-round"></i></span><span><h1>{{ detail?.name ?? 'Team 详情' }}</h1><p v-if="detail">{{ teamCode(detail.id) }} · 由本地草稿维护，刷新页面后重置。</p><p v-else>查看 Team 的成员组成、编排模式与运行策略。</p></span></div></div>
      <div :class="styles['tm-page-actions']"><span :class="[styles['tm-local-badge'], 'mono']"><i class="icon icon-database"></i>LOCAL DRAFT</span><UButton :class="styles['tm-secondary-button']" icon="i-lucide-arrow-left" label="返回列表" @click="goToList" /></div>
    </header>

    <UAlert v-if="!detail" color="error" variant="subtle" icon="i-lucide-circle-alert" title="Team 详情加载失败" description="未找到该 Team，可能已被删除或工作区已切换。" :actions="[{ label: '返回列表', color: 'neutral', variant: 'outline', onClick: goToList }]" />

    <section v-if="detail" :class="styles['tm-detail-shell']" aria-label="Team 详情">
      <div :class="styles['tm-detail-top']">
        <UBadge color="neutral" variant="subtle" :class="[styles['tm-lifecycle'], detail.status === 'nominal' ? 'published' : 'disabled']"><span class="dot" :class="detail.status"></span>{{ STATUS_LABEL[detail.status] }}</UBadge>
        <span :class="styles['tm-detail-mode']">{{ TEAM_MODE_LABEL[detail.mode] }} <small class="mono">{{ detail.mode.toUpperCase() }}</small></span>
        <span :class="styles['tm-detail-mode']">入口 Agent <small class="mono">{{ detail.members[entryIndex]?.agentName || '未指定' }}</small></span>
        <UAlert v-if="stoppedMembers.length" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="`${stoppedMembers.length} 个成员 Agent 已停用，Team 将无法完整运行。`" />
      </div>

      <UTabs v-model="activeTab" :items="tabItems" :content="false" variant="link" size="sm" :class="styles['tm-detail-tabs']" />

      <div v-if="activeTab === 'basic'" :class="styles['tm-detail-pane']">
        <dl :class="styles['tm-detail-list']">
          <div><dt>描述</dt><dd>{{ detail.description || '未填写用途描述' }}</dd></div>
          <div><dt>模式</dt><dd>{{ TEAM_MODE_LABEL[detail.mode] }} <small class="mono">{{ detail.mode.toUpperCase() }}</small></dd></div>
          <div><dt>状态</dt><dd>{{ STATUS_LABEL[detail.status] }}</dd></div>
          <div><dt>负责人</dt><dd>{{ detail.owner || '未指定' }}</dd></div>
          <div><dt>标签</dt><dd>{{ detail.tags.length ? detail.tags.join('、') : '无标签' }}</dd></div>
        </dl>
      </div>

      <div v-else-if="activeTab === 'members'" :class="styles['tm-detail-pane']">
        <ol :class="styles['tm-detail-members']">
          <li v-for="(member, index) in detail.members" :key="member.agentId + index" :class="{ [styles.unavailable]: index !== entryIndex && !isAvailable(member) }">
            <span class="mono">{{ String(index + 1).padStart(2, '0') }}</span>
            <span :class="styles['tm-detail-member-main']">
              <strong>{{ member.agentName || '未指定 Agent' }}</strong>
              <small class="mono">{{ member.duty || '未填写职责' }}</small>
            </span>
            <em v-if="index === entryIndex" :class="styles.success"><i class="icon icon-circle-check-big"></i>入口 Agent</em>
            <em v-else-if="!isAvailable(member)"><i class="icon icon-triangle-alert"></i>已停用</em>
            <small class="mono">{{ memberCode(member) }}</small>
          </li>
        </ol>
        <p v-if="!detail.members.length" :class="styles['tm-detail-empty']">尚未添加任何成员。</p>
      </div>

      <div v-else :class="styles['tm-detail-pane']">
        <dl :class="styles['tm-detail-list']">
          <div><dt>共享上下文</dt><dd>{{ detail.sharedContext ? '已开启' : '各自独立' }}</dd></div>
          <div><dt>人工审批</dt><dd>{{ detail.requiresApproval ? '需要审批' : '无需审批' }}</dd></div>
          <div><dt>并发上限</dt><dd class="mono">{{ detail.concurrency }}</dd></div>
          <div><dt>超时时间</dt><dd class="mono">{{ detail.timeoutSeconds }} 秒</dd></div>
          <div><dt>创建时间</dt><dd><RelativeTime :value="detail.createdAt" /></dd></div>
          <div><dt>更新时间</dt><dd><RelativeTime :value="detail.updatedAt" /></dd></div>
        </dl>
      </div>

      <footer :class="styles['tm-detail-actions']">
        <UButton :class="styles['tm-icon-button']" icon="i-lucide-trash-2" color="error" variant="ghost" square aria-label="删除当前 Team" @click="requestDelete" />
        <UButton :class="styles['tm-secondary-button']" icon="i-lucide-copy" color="neutral" variant="outline" label="复制" @click="goToDuplicate" />
        <UButton :class="styles['tm-primary-button']" icon="i-lucide-sliders-horizontal" label="配置" @click="goToEdit" />
      </footer>
    </section>

    <UModal :open="pendingDelete" class="ag-confirm-modal" :title="`删除 ${detail?.name ?? 'Team'}？`" description="删除后该 Team 将从内存草稿中移除，刷新页面会重新载入目录数据。" @update:open="(open) => { if (!open) pendingDelete = false }">
      <template #body><p :class="styles['tm-modal-copy']">删除只影响当前会话的内存草稿，不会调用任何后端接口。</p></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="deleting" @click="pendingDelete = false" /><UButton label="确认删除" color="error" :loading="deleting" :disabled="deleting" @click="confirmDelete" /></template>
    </UModal>
  </main>
</template>

<style module src="./index.module.css"></style>
