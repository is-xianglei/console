import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from '@nuxt/ui/composables'
import type {
  TeamDefinitionCreateRequest,
  TeamDefinitionMemberItem,
  TeamDefinitionMemberResponse,
  TeamDefinitionResponse,
  TeamDefinitionUpdateRequest,
} from '@/interfaces/team-definition/api'
import {
  MAX_TEAM_MEMBER_NAME_LENGTH,
  MAX_TEAM_MEMBER_ROLE_LENGTH,
  MAX_TEAM_NAME_LENGTH,
  RESERVED_TEAM_MEMBER_NAMES,
  type TeamFormModel,
  type TeamMemberFormModel,
  type TeamValidationIssue,
} from '@/interfaces/team-definition/model'
import { useAuthStore } from '@/stores/auth'
import { useTeamsStore, type TeamSaveError } from '@/stores/teams'

let memberKeySeed = 0

/** 成员行的渲染 key：增删行时保持输入框不串位。 */
function nextMemberKey() {
  memberKeySeed += 1
  return `team-member-${memberKeySeed}`
}

export function emptyTeamMember(): TeamMemberFormModel {
  return { key: nextMemberKey(), agentId: null, agentName: null, name: '', role: '' }
}

/** 新建草稿默认启用，带一行空成员方便直接填写。 */
export function emptyTeamForm(): TeamFormModel {
  return { id: null, name: '', description: '', isEnabled: true, members: [emptyTeamMember()] }
}

function responseMembers(team: TeamDefinitionResponse): TeamMemberFormModel[] {
  return team.members.map((member) => ({
    key: nextMemberKey(),
    agentId: member.agent_id,
    agentName: member.agent_name,
    name: member.name,
    role: member.role,
  }))
}

/** 后端已按 sort_order 排好成员，表单直接沿用这个顺序。 */
export function teamResponseToForm(team: TeamDefinitionResponse): TeamFormModel {
  return {
    id: team.id,
    name: team.name,
    description: team.description ?? '',
    isEnabled: team.is_enabled,
    members: responseMembers(team),
  }
}

/** 复制已有 Team 作为新建草稿。 */
export function duplicateTeamForm(team: TeamDefinitionResponse): TeamFormModel {
  return {
    id: null,
    name: `${team.name} 副本`.slice(0, MAX_TEAM_NAME_LENGTH),
    description: team.description ?? '',
    isEnabled: true,
    members: responseMembers(team),
  }
}

/**
 * 选 Agent 时预填的成员名：用 Agent 名，和其他成员重名或撞上保留名时加 -2、-3。
 * taken 里是其他行已用的成员名。
 */
export function suggestMemberName(agentName: string, taken: string[]): string {
  const base = agentName.trim().slice(0, MAX_TEAM_MEMBER_NAME_LENGTH) || 'member'
  const used = new Set(taken.map((name) => name.trim()))
  const blocked = (name: string) => used.has(name) || RESERVED_TEAM_MEMBER_NAMES.includes(name)
  if (!blocked(base)) return base
  for (let index = 2; ; index += 1) {
    const suffix = `-${index}`
    const candidate = `${base.slice(0, MAX_TEAM_MEMBER_NAME_LENGTH - suffix.length)}${suffix}`
    if (!blocked(candidate)) return candidate
  }
}

/** 与后端规则对齐的前端校验，最终以后端 422 为准。 */
export function validateTeamForm(form: TeamFormModel): TeamValidationIssue[] {
  const issues: TeamValidationIssue[] = []
  const name = form.name.trim()
  if (!name) issues.push({ field: 'name', message: '请输入 Team 名称' })
  else if (name.length > MAX_TEAM_NAME_LENGTH) issues.push({ field: 'name', message: `名称不能超过 ${MAX_TEAM_NAME_LENGTH} 个字符` })

  if (!form.members.length) {
    issues.push({ field: 'members', message: '至少需要 1 个成员' })
    return issues
  }

  const counts = new Map<string, number>()
  for (const member of form.members) {
    const memberName = member.name.trim()
    if (memberName) counts.set(memberName, (counts.get(memberName) ?? 0) + 1)
  }

  form.members.forEach((member, index) => {
    const label = `第 ${index + 1} 个成员`
    const push = (memberField: 'agent' | 'name' | 'role', message: string) =>
      issues.push({ field: 'members', memberIndex: index, memberField, message: `${label}${message}` })

    if (member.agentId == null) push('agent', '未选择 Agent')
    else if (member.agentName == null) push('agent', '的 Agent 已删除，请重新选择')

    const memberName = member.name.trim()
    if (!memberName) push('name', '未填写成员名')
    else if (memberName.length > MAX_TEAM_MEMBER_NAME_LENGTH) push('name', `的成员名不能超过 ${MAX_TEAM_MEMBER_NAME_LENGTH} 个字符`)
    else if (RESERVED_TEAM_MEMBER_NAMES.includes(memberName)) push('name', '的成员名不能是 lead 或 *')
    else if ((counts.get(memberName) ?? 0) > 1) push('name', `的成员名「${memberName}」重复`)

    const role = member.role.trim()
    if (!role) push('role', '未填写角色')
    else if (role.length > MAX_TEAM_MEMBER_ROLE_LENGTH) push('role', `的角色不能超过 ${MAX_TEAM_MEMBER_ROLE_LENGTH} 个字符`)
  })
  return issues
}

/** 成员载荷：数组下标写进 sort_order。 */
export function teamMembersPayload(form: TeamFormModel): TeamDefinitionMemberItem[] {
  return form.members.map((member, index) => ({
    agent_id: member.agentId ?? 0,
    name: member.name.trim(),
    role: member.role.trim(),
    sort_order: index,
  }))
}

export function buildTeamCreatePayload(form: TeamFormModel): TeamDefinitionCreateRequest {
  const description = form.description.trim()
  return {
    name: form.name.trim(),
    description: description || null,
    is_enabled: form.isEnabled,
    members: teamMembersPayload(form),
  }
}

function sameMembers(next: TeamDefinitionMemberItem[], current: TeamDefinitionMemberResponse[]): boolean {
  return next.length === current.length && next.every((member, index) => {
    const other = current[index]!
    return member.agent_id === other.agent_id && member.name === other.name && member.role === other.role
  })
}

/** PATCH 只带改动的字段：描述清空传 null，成员有变化才整体替换。没有改动时返回空对象。 */
export function buildTeamUpdatePayload(form: TeamFormModel, original: TeamDefinitionResponse): TeamDefinitionUpdateRequest {
  const payload: TeamDefinitionUpdateRequest = {}
  const name = form.name.trim()
  if (name !== original.name) payload.name = name
  const description = form.description.trim() || null
  if (description !== (original.description ?? null)) payload.description = description
  if (form.isEnabled !== original.is_enabled) payload.is_enabled = form.isEnabled
  const members = teamMembersPayload(form)
  if (!sameMembers(members, original.members)) payload.members = members
  return payload
}

/** 后端保存失败时要标红的成员行：按 loc 下标、成员名、Agent id 三种线索定位。 */
export function teamSaveErrorRows(error: TeamSaveError | null, form: TeamFormModel): number[] {
  if (!error || error.field !== 'members') return []
  const rows = new Set(error.memberIndexes.filter((index) => index >= 0 && index < form.members.length))
  form.members.forEach((member, index) => {
    if (error.memberNames.includes(member.name.trim())) rows.add(index)
    if (member.agentId != null && error.agentIds.includes(member.agentId)) rows.add(index)
  })
  return [...rows].sort((a, b) => a - b)
}

/** 工作区 owner / admin 才能新建、修改、删除 Team；其他成员只读。 */
export function useTeamWriteAccess() {
  const authStore = useAuthStore()
  return computed(() => {
    const role = authStore.currentWorkspace?.membership_role
    return role === 'owner' || role === 'admin'
  })
}

export interface TeamSaveOptions {
  /** 保存成功、跳转之前调用；页面用它重置脏检查快照。 */
  onSaved?: () => void
}

/** 新建 / 编辑 Team：保存成功后进入详情页。 */
export function useTeamEditor() {
  const router = useRouter()
  const toast = useToast()
  const teamsStore = useTeamsStore()
  const canManage = useTeamWriteAccess()

  const draft = ref<TeamFormModel>(emptyTeamForm())
  /** 编辑时加载到的原始数据，用来算 PATCH 的改动字段。 */
  const original = ref<TeamDefinitionResponse | null>(null)
  const loadingDetail = ref(false)
  const saving = ref(false)
  const notFound = ref(false)
  const loadError = ref('')
  /** 后端保存失败的定位信息；表单顶部显示 message，并标红对应字段或成员行。 */
  const saveError = ref<TeamSaveError | null>(null)

  const issues = computed<TeamValidationIssue[]>(() => validateTeamForm(draft.value))
  const error = computed(() => saveError.value?.message ?? '')

  function resetStatus() {
    notFound.value = false
    loadError.value = ''
    saveError.value = null
  }

  function goToList() {
    void router.push({ name: 'platform-resource', params: { module: 'build', resource: 'teams' } })
  }

  /** 返回 true 表示草稿已从复制源预填。 */
  async function openCreate(duplicateId?: number): Promise<boolean> {
    resetStatus()
    original.value = null
    draft.value = emptyTeamForm()
    if (duplicateId == null) return false
    loadingDetail.value = true
    const result = await teamsStore.loadTeamDetail(duplicateId)
    loadingDetail.value = false
    if (result?.status !== 'ok') return false
    draft.value = duplicateTeamForm(result.item)
    return true
  }

  async function openEdit(id: number): Promise<boolean> {
    resetStatus()
    original.value = null
    draft.value = emptyTeamForm()
    loadingDetail.value = true
    const result = await teamsStore.loadTeamDetail(id)
    loadingDetail.value = false
    if (result === undefined) return false
    if (result.status === 'not-found') {
      notFound.value = true
      return false
    }
    if (result.status === 'error') {
      loadError.value = result.message
      return false
    }
    original.value = result.item
    draft.value = teamResponseToForm(result.item)
    return true
  }

  async function save(options?: TeamSaveOptions): Promise<boolean> {
    if (saving.value || issues.value.length) return false
    saving.value = true
    try {
      const current = draft.value
      let saved: TeamDefinitionResponse | null
      if (current.id == null) {
        const result = await teamsStore.saveTeam({ create: buildTeamCreatePayload(current) })
        saveError.value = result.error
        saved = result.item
      } else {
        const update = original.value ? buildTeamUpdatePayload(current, original.value) : buildTeamCreatePayload(current)
        if (!Object.keys(update).length) {
          // 没有改动：不发请求，直接回详情。
          saveError.value = null
          options?.onSaved?.()
          await router.push({ name: 'team-detail', params: { id: String(current.id) } })
          return true
        }
        const result = await teamsStore.saveTeam({ id: current.id, update })
        saveError.value = result.error
        saved = result.item
      }
      if (!saved) return false
      original.value = saved
      options?.onSaved?.()
      toast.add({ title: `${saved.name} 已保存`, color: 'success' })
      await router.push({ name: 'team-detail', params: { id: String(saved.id) } })
      return true
    } finally {
      saving.value = false
    }
  }

  return {
    draft,
    original,
    issues,
    canManage,
    loadingDetail,
    saving,
    error,
    saveError,
    notFound,
    loadError,
    openCreate,
    openEdit,
    save,
    goToList,
  }
}
