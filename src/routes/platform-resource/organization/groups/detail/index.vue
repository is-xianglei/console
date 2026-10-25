<script setup lang="ts">
import { computed, ref, useCssModule, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GroupFormModal from '../components/group-form-modal/index.vue'
import { groupJoinModeLabel, groupTypeLabel, groupVisibilityLabel } from '@/hooks/useGroupEditor'
import { useGroupManager } from '@/hooks/useGroupManager'
import { useOrganizationSupport } from '@/hooks/useOrganizationSupport'
import type { GroupMemberRole, GroupMemberResponse } from '@/interfaces/group/model'
import { useAuthStore } from '@/stores/auth'
import { useGroupsStore } from '@/stores/groups'

defineOptions({ name: 'GroupResourceDetail' })

/** 成员行上正在执行的操作类型，与 user_id 组合形成每行独立 loading。 */
type MemberAction = 'approve' | 'reject' | 'role' | 'transfer' | 'remove'

const styles = useCssModule()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const groupsStore = useGroupsStore()
const manager = useGroupManager()
const support = useOrganizationSupport()

const loadingError = ref('')
const pendingDelete = ref(false)
const deleting = ref(false)
const inviteUserId = ref('')
const inviteRole = ref<GroupMemberRole>('member')
const inviting = ref(false)
const memberBusy = ref<{ userId: number; action: MemberAction } | null>(null)
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
let loadRequest = 0

const roleOptions = [
  { value: 'member', label: '成员' },
  { value: 'admin', label: '管理员' },
]

const groupId = computed(() => {
  const value = route.params.id
  return Number(Array.isArray(value) ? value[0] : value)
})
const workspaceId = computed(() => authStore.currentWorkspaceId ?? authStore.currentWorkspace?.id ?? null)
const currentUserId = computed(() => authStore.state.user?.id ?? null)
const group = computed(() => (
  groupsStore.state.detail?.id === groupId.value ? groupsStore.state.detail : null
))
const loading = computed(() => groupsStore.state.loading || groupsStore.state.detailLoading)
const members = computed<GroupMemberResponse[]>(() => groupsStore.state.members)
const pendingCount = computed(() => members.value.filter((member) => member.status === 'pending').length)
const isMine = computed(() => manager.isMine(groupId.value))
const membershipBusy = computed(() => manager.membershipBusyId.value === groupId.value)

function formatTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false })
}

function memberStatusLabel(value: string) {
  return { active: '已加入', pending: '待审批', invited: '已邀请' }[value] ?? value
}

function memberName(member: GroupMemberResponse) {
  return member.full_name || member.username
}

function isBusy(member: GroupMemberResponse, action: MemberAction) {
  return memberBusy.value?.userId === member.user_id && memberBusy.value.action === action
}

function showToast(message: string) {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 2600)
}

function goToList() {
  void router.push({ name: 'platform-resource', params: { module: 'organization', resource: 'groups' } })
}

/** 编辑弹窗：保存后 store.saveGroup 已重拉目录并重选本群组，详情原地刷新，无需额外处理。 */
const formOpen = ref(false)

function goToEdit() {
  formOpen.value = true
}

async function load() {
  const request = ++loadRequest
  loadingError.value = ''
  const id = workspaceId.value
  if (!id) {
    loadingError.value = '当前账号没有可用工作区'
    return
  }
  if (groupsStore.state.workspaceId !== id || !groupsStore.state.items.length) {
    const listError = await groupsStore.loadGroups(id)
    if (request !== loadRequest) return
    if (listError) {
      loadingError.value = listError
      return
    }
  }
  // selectGroup 内部保留 include_pending 403 时降级重试的逻辑(见 stores/groups.ts)。
  const [detailError] = await Promise.all([
    groupsStore.selectGroup(groupId.value),
    support.loadSupportData(id),
  ])
  if (request !== loadRequest) return
  if (detailError) loadingError.value = detailError
}

/** header「加入/退出」：复用 manager 的带 loading 实现，store 会自动刷新 myGroups 与成员列表。 */
async function toggleMembership() {
  const wasMine = isMine.value
  const ok = wasMine
    ? await manager.leaveGroup(groupId.value)
    : await manager.joinGroup(groupId.value)
  if (!ok) {
    if (manager.loadingError.value) loadingError.value = manager.loadingError.value
    return
  }
  loadingError.value = ''
  showToast(wasMine ? '已退出群组' : '加入请求已提交')
}

/** 邀请行：USelect 选用户 + 角色 → inviteMember。 */
async function inviteMember() {
  const userId = Number(inviteUserId.value)
  if (!userId || !group.value || inviting.value) return
  inviting.value = true
  try {
    const error = await groupsStore.inviteMember(userId, inviteRole.value)
    if (error) {
      loadingError.value = error
      return
    }
    inviteUserId.value = ''
    loadingError.value = ''
    showToast('群组邀请已发送')
  } finally {
    inviting.value = false
  }
}

/**
 * 成员子表格所有操作的统一入口：同一时刻只允许一个成员行处理中，
 * memberBusy 记录 (user_id, action) 供对应按钮显示独立 loading，其余按钮禁用。
 */
async function runMemberAction(
  member: GroupMemberResponse,
  action: MemberAction,
  request: () => Promise<string | null>,
  success: string,
) {
  if (memberBusy.value) return
  memberBusy.value = { userId: member.user_id, action }
  try {
    const error = await request()
    if (error) {
      loadingError.value = error
      return
    }
    loadingError.value = ''
    showToast(success)
  } finally {
    memberBusy.value = null
  }
}

/** pending 行：批准。 */
function approveMember(member: GroupMemberResponse) {
  return runMemberAction(member, 'approve', () => groupsStore.approveMember(member.user_id), `${memberName(member)} 的申请已批准`)
}

/** pending 行：拒绝。 */
function rejectMember(member: GroupMemberResponse) {
  return runMemberAction(member, 'reject', () => groupsStore.rejectMember(member.user_id), `${memberName(member)} 的申请已拒绝`)
}

/** 非 pending 行：管理员 ⇄ 成员切换。 */
function toggleMemberRole(member: GroupMemberResponse) {
  const role: GroupMemberRole = member.role === 'admin' ? 'member' : 'admin'
  return runMemberAction(member, 'role', () => groupsStore.changeMemberRole(member.user_id, { role }), `${memberName(member)} 已设为${role === 'admin' ? '管理员' : '成员'}`)
}

/** 非 pending 且非当前负责人的行：转让负责人。 */
function transferOwner(member: GroupMemberResponse) {
  return runMemberAction(member, 'transfer', () => groupsStore.transferOwner(member.user_id), `群组负责人已转让给 ${memberName(member)}`)
}

/** 非 pending 且非当前用户的行：移除成员。 */
function removeMember(member: GroupMemberResponse) {
  return runMemberAction(member, 'remove', () => groupsStore.removeMember(member.user_id), `${memberName(member)} 已移除`)
}

async function confirmDelete() {
  if (!group.value || deleting.value) return
  deleting.value = true
  try {
    const error = await groupsStore.removeGroup(group.value.id)
    if (error) {
      loadingError.value = error
      return
    }
    goToList()
  } finally {
    deleting.value = false
    pendingDelete.value = false
  }
}

watch(
  () => [groupId.value, workspaceId.value] as const,
  () => { void load() },
  { immediate: true },
)
</script>

<template>
  <main :class="styles.page">
    <header :class="styles.header">
      <div :class="styles.heading">
        <nav :class="styles.breadcrumb" aria-label="面包屑"><span>组织管理</span><i class="icon icon-chevron-right"></i><span>群组</span><i class="icon icon-chevron-right"></i><strong>详情</strong></nav>
        <div :class="styles.titleRow">
          <span :class="styles.titleIcon"><UIcon name="i-lucide-users-round" /></span>
          <div><h1>{{ group?.name ?? '群组详情' }}</h1><p v-if="group">GROUP-{{ group.id }} · <span class="mono">{{ group.slug }}</span> · {{ group.description || '未填写群组描述。' }}</p><p v-else>查看群组的类型、可见性、加入方式与成员。</p></div>
          <UBadge v-if="group" :color="group.is_active ? 'success' : 'neutral'" variant="subtle" size="xs">{{ group.is_active ? '启用' : '停用' }}</UBadge>
          <UBadge v-if="group && isMine" color="primary" variant="subtle" size="xs">我已加入</UBadge>
        </div>
      </div>
      <div :class="styles.headerActions">
        <UButton icon="i-lucide-arrow-left" label="返回列表" color="neutral" variant="outline" @click="goToList" />
        <UButton :label="isMine ? '退出群组' : '加入群组'" :icon="isMine ? 'i-lucide-log-out' : 'i-lucide-log-in'" color="neutral" variant="outline" :disabled="!group || manager.membershipBusyId.value != null" :loading="membershipBusy" @click="toggleMembership" />
        <UButton icon="i-lucide-pencil" label="编辑群组" :disabled="!group" @click="goToEdit" />
      </div>
    </header>

    <UAlert v-if="loadingError" :class="styles.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="loadingError" :actions="[{ label: '重试', color: 'neutral', variant: 'outline', onClick: load }]" />
    <UAlert v-else-if="!loading && !group" :class="styles.alert" color="error" variant="subtle" icon="i-lucide-circle-alert" title="未找到该群组" description="可能已被删除或工作区已切换。" :actions="[{ label: '返回列表', color: 'neutral', variant: 'outline', onClick: goToList }]" />

    <section v-if="group" :class="styles.detailShell" aria-label="群组详情">
      <div :class="styles.card">
        <div :class="styles.stateRow"><span class="mono">GROUP-{{ group.id }}</span><span>更新于 {{ formatTime(group.updated_at) }}</span></div>
        <p :class="styles.description" style="margin-top: 12px">{{ group.description || '未填写群组描述。' }}</p>
        <dl :class="styles.meta">
          <div><dt>唯一标识</dt><dd class="mono">{{ group.slug }}</dd></div>
          <div><dt>类型</dt><dd>{{ groupTypeLabel(group.group_type) }}</dd></div>
          <div><dt>可见性</dt><dd>{{ groupVisibilityLabel(group.visibility) }}</dd></div>
          <div><dt>加入方式</dt><dd>{{ groupJoinModeLabel(group.join_mode) }}</dd></div>
          <div><dt>负责人</dt><dd>{{ support.userName(group.owner_id) }}<span v-if="group.owner_id === currentUserId">（我）</span></dd></div>
          <div><dt>创建人</dt><dd>{{ support.userName(group.created_by) }}</dd></div>
          <div><dt>成员数</dt><dd class="mono">{{ members.length }}<template v-if="pendingCount"> · 待审批 {{ pendingCount }}</template></dd></div>
          <div><dt>创建时间</dt><dd>{{ formatTime(group.created_at) }}</dd></div>
        </dl>

        <footer :class="styles.detailActions">
          <UButton icon="i-lucide-trash-2" color="error" variant="ghost" square aria-label="删除当前群组" @click="pendingDelete = true" />
          <UButton icon="i-lucide-pencil" label="编辑群组" @click="goToEdit" />
        </footer>
      </div>

      <aside :class="styles.card" aria-label="群组成员">
        <div :class="styles.sectionHeader" style="margin-top: 0"><div><span>MEMBERS</span><h3>群组成员</h3></div><div :class="styles.badgeGroup"><UBadge v-if="pendingCount" :label="`待审批 ${pendingCount}`" color="warning" variant="subtle" /><UBadge :label="String(members.length)" color="neutral" variant="subtle" /></div></div>
        <div :class="styles.inlineForm"><USelect v-model="inviteUserId" :items="support.invitableGroupUsers.value" placeholder="选择用户" aria-label="选择邀请用户" :disabled="inviting" /><USelect v-model="inviteRole" :items="roleOptions" aria-label="邀请角色" :disabled="inviting" /><UTooltip text="发送邀请"><UButton icon="i-lucide-send" aria-label="发送邀请" :loading="inviting" :disabled="!inviteUserId" @click="inviteMember" /></UTooltip></div>

        <!-- 自建成员子表格：pending 行 → 批准/拒绝；非 pending 行 → 切角色 / 转让(非负责人) / 移除(非当前用户)。 -->
        <div :class="styles.memberTable" role="table" aria-label="群组成员列表">
          <div v-for="member in members" :key="member.id" :class="[styles.memberRow, member.status === 'pending' && styles.memberRowPending]" role="row">
            <UAvatar :alt="memberName(member)" :src="member.avatar_url || undefined" size="sm" />
            <span role="cell"><strong>{{ memberName(member) }}<em v-if="member.user_id === group.owner_id" :class="styles.ownerMark" title="负责人">负责人</em><em v-else-if="member.user_id === currentUserId" :class="styles.ownerMark">我</em></strong><small>{{ memberStatusLabel(member.status) }} · {{ member.role === 'admin' ? '管理员' : '成员' }} · {{ member.email }}</small></span>
            <UBadge :class="styles.memberRole" :color="member.status === 'pending' ? 'warning' : (member.role === 'admin' ? 'primary' : 'neutral')" variant="subtle" size="xs">{{ member.status === 'pending' ? '待审批' : member.role }}</UBadge>
            <div :class="styles.memberActions" role="cell">
              <template v-if="member.status === 'pending'">
                <UTooltip text="批准申请"><UButton icon="i-lucide-check" color="success" variant="ghost" square :aria-label="`批准 ${memberName(member)} 的申请`" :loading="isBusy(member, 'approve')" :disabled="memberBusy != null" @click="approveMember(member)" /></UTooltip>
                <UTooltip text="拒绝申请"><UButton icon="i-lucide-x" color="error" variant="ghost" square :aria-label="`拒绝 ${memberName(member)} 的申请`" :loading="isBusy(member, 'reject')" :disabled="memberBusy != null" @click="rejectMember(member)" /></UTooltip>
              </template>
              <template v-else>
                <UTooltip :text="member.role === 'admin' ? '设为成员' : '设为管理员'"><UButton :icon="member.role === 'admin' ? 'i-lucide-user' : 'i-lucide-shield-check'" color="neutral" variant="ghost" square :aria-label="`将 ${memberName(member)} ${member.role === 'admin' ? '设为成员' : '设为管理员'}`" :loading="isBusy(member, 'role')" :disabled="memberBusy != null" @click="toggleMemberRole(member)" /></UTooltip>
                <UTooltip v-if="member.user_id !== group.owner_id" text="转让负责人"><UButton icon="i-lucide-crown" color="neutral" variant="ghost" square :aria-label="`将负责人转让给 ${memberName(member)}`" :loading="isBusy(member, 'transfer')" :disabled="memberBusy != null" @click="transferOwner(member)" /></UTooltip>
                <UTooltip v-if="member.user_id !== currentUserId" text="移除成员"><UButton icon="i-lucide-user-minus" color="error" variant="ghost" square :aria-label="`移除 ${memberName(member)}`" :loading="isBusy(member, 'remove')" :disabled="memberBusy != null" @click="removeMember(member)" /></UTooltip>
              </template>
            </div>
          </div>
          <UEmpty v-if="!members.length" icon="i-lucide-users" title="暂无成员" description="从上方选择用户发送群组邀请。" variant="naked" />
        </div>
      </aside>
    </section>

    <UModal :open="pendingDelete" :title="`删除群组「${group?.name ?? ''}」？`" description="此操作会直接调用后端删除接口，无法在当前页面撤销。" @update:open="(open) => { if (!open) pendingDelete = false }">
      <template #body><UAlert color="error" variant="subtle" icon="i-lucide-triangle-alert" title="请确认该群组没有仍需保留的成员或引用。" /></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="deleting" @click="pendingDelete = false" /><UButton label="确认删除" icon="i-lucide-trash-2" color="error" :loading="deleting" :disabled="deleting" @click="confirmDelete" /></template>
    </UModal>

    <GroupFormModal v-model:open="formOpen" :group-id="groupId" />
  </main>
  <Transition name="dept-toast"><div v-if="toast" :class="styles.toast" role="status"><i class="icon icon-circle-check-big"></i>{{ toast }}</div></Transition>
</template>

<style module src="./index.module.css"></style>
