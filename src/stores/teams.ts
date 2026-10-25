import { defineStore } from 'pinia'
import { computed, reactive } from 'vue'
import { RESOURCE_PAGES } from '../constants/platform-catalog'
import type { ResourceRow, ResourceStatus } from '../interfaces/platform/model'
import {
  MAX_CONCURRENCY,
  MAX_TEAM_MEMBERS,
  MIN_CONCURRENCY,
  MIN_TEAM_MEMBERS,
  type TeamFormModel,
  type TeamMember,
  type TeamMode,
  type TeamValidationIssue,
} from '../interfaces/platform-team/model'

interface TeamsState {
  items: TeamFormModel[]
  loaded: boolean
}

/**
 * Teams 的内存数据源。
 *
 * 列表页（useBuildResourceManager）和编辑页共用同一份 `items`，
 * 但各自的行形态不同：列表用 ResourceRow.values 承载四列展示值，
 * 编辑页用结构化字段。这里提供双向转换，避免两套数据各改各的。
 */
/**
 * 由列表行转换成编辑草稿。
 *
 * 目录行只记录了「5 Agents」这样的数量，没有真实成员名单，所以这里只把入口
 * Agent 落成一条实名成员，其余留空（agentName 为 ''）交给使用者在编辑器里补全，
 * 不会编造「待指派 Agent 2」这种假名字。
 */
function fromRow(row: ResourceRow): TeamFormModel {
  const [modeLabel, entryName, memberText] = row.values
  const mode: TeamMode = modeLabel === '主管式' ? 'supervisor' : modeLabel === '并行协作' ? 'parallel' : 'pipeline'
  const memberCount = Number(memberText?.match(/\d+/)?.[0] ?? 0)
  const members: TeamMember[] = []
  if (memberCount > 0) {
    members.push({ agentId: '', agentName: entryName ?? '', duty: '', isEntry: true })
  }
  for (let index = 1; index < memberCount; index += 1) {
    members.push({ agentId: '', agentName: '', duty: '', isEntry: false })
  }
  return {
    id: row.id,
    name: row.name,
    mode,
    status: row.status,
    entryIndex: members.length ? 0 : -1,
    members,
    description: row.description,
    owner: row.owner,
    tags: [...row.tags],
    sharedContext: row.tags.includes('共享上下文'),
    requiresApproval: row.tags.some((tag) => tag.includes('审批')),
    concurrency: 4,
    timeoutSeconds: 90,
    createdAt: '',
    updatedAt: '',
  }
}

/** 编辑结果回写成列表页的 ResourceRow 形态，保证两处展示一致。 */
export function toRow(team: TeamFormModel): ResourceRow {
  const memberCount = `${team.members.length} Agents`
  const entryName = team.members[team.entryIndex]?.agentName ?? team.members[0]?.agentName ?? '未指定'
  return {
    id: team.id,
    name: team.name,
    status: team.status,
    values: [MODE_LABEL[team.mode], entryName, memberCount],
    description: team.description,
    tags: [...team.tags],
    owner: team.owner,
  }
}

const MODE_LABEL: Record<TeamMode, string> = {
  supervisor: '主管式',
  parallel: '并行协作',
  pipeline: '流水线',
}

export const useTeamsStore = defineStore('teams', () => {
  const state = reactive<TeamsState>({ items: [], loaded: false })

  const teamCount = computed(() => state.items.length)

  /** 首次访问时用目录数据播种，之后以内存中的编辑结果为准。 */
  function ensureLoaded() {
    if (state.loaded) return
    state.items = (RESOURCE_PAGES.teams?.rows ?? []).map(fromRow)
    state.loaded = true
  }

  function findTeam(id: string) {
    ensureLoaded()
    return state.items.find((item) => item.id === id) ?? null
  }

  function nextId() {
    ensureLoaded()
    const max = state.items.reduce((acc, item) => Math.max(acc, Number(item.id.match(/\d+/)?.[0] ?? 0)), 0)
    return `TEAM-${String(max + 1).padStart(4, '0')}`
  }

  /** 新建的空草稿；id 由 store 生成，保证不与已有编号冲突。 */
  function createDraft(): TeamFormModel {
    return {
      id: nextId(),
      name: '',
      mode: 'supervisor',
      status: 'idle',
      entryIndex: -1,
      members: [],
      description: '',
      owner: 'AI 平台组',
      tags: [],
      sharedContext: true,
      requiresApproval: false,
      concurrency: 4,
      timeoutSeconds: 90,
      createdAt: '',
      updatedAt: '',
    }
  }

  /** 复制一份草稿，清掉编号与运行状态。 */
  function duplicateDraft(source: TeamFormModel): TeamFormModel {
    return {
      ...source,
      id: nextId(),
      name: `${source.name} 副本`,
      status: 'idle',
      members: source.members.map((member) => ({ ...member })),
      tags: [...source.tags],
    }
  }

  function upsert(team: TeamFormModel) {
    ensureLoaded()
    const index = state.items.findIndex((item) => item.id === team.id)
    const snapshot: TeamFormModel = {
      ...team,
      members: team.members.map((member) => ({ ...member })),
      tags: [...team.tags],
      updatedAt: new Date().toISOString(),
      createdAt: index >= 0 ? state.items[index]!.createdAt : new Date().toISOString(),
    }
    if (index >= 0) state.items[index] = snapshot
    else state.items.unshift(snapshot)
  }

  function removeTeam(id: string) {
    ensureLoaded()
    const index = state.items.findIndex((item) => item.id === id)
    if (index >= 0) state.items.splice(index, 1)
  }

  function setStatus(id: string, status: ResourceStatus) {
    ensureLoaded()
    const target = state.items.find((item) => item.id === id)
    if (target) target.status = status as TeamFormModel['status']
  }

  return { state, teamCount, ensureLoaded, findTeam, nextId, createDraft, duplicateDraft, upsert, removeTeam, setStatus }
})

/** Team 名称最长字符数：校验与 Builder 输入框的 maxlength 共用。 */
export const MAX_TEAM_NAME_LENGTH = 40
/** 单次运行超时秒数的范围：校验与 Builder 数字输入的 min / max 共用。 */
export const MIN_TEAM_TIMEOUT_SECONDS = 10
export const MAX_TEAM_TIMEOUT_SECONDS = 600

/** 校验问题落到的表单字段，与 TeamBuilder 里 UFormField 的 name 一一对应。 */
export type TeamIssueField = 'name' | 'members' | 'concurrency' | 'timeoutSeconds'

/** 在 TeamValidationIssue 上追加 field（不改原有字段），Builder 据此标记出错字段，不再匹配消息文本。 */
export interface TeamIssue extends TeamValidationIssue {
  field: TeamIssueField
}

/** 与 PlanValidationIssue 同构的校验，供编辑页与详情页共用。 */
export function validateTeam(team: TeamFormModel): TeamIssue[] {
  const issues: TeamIssue[] = []
  if (!team.name.trim()) issues.push({ section: 'basic', field: 'name', message: '请输入 Team 名称' })
  if (team.name.trim().length > MAX_TEAM_NAME_LENGTH) {
    issues.push({ section: 'basic', field: 'name', message: `Team 名称不能超过 ${MAX_TEAM_NAME_LENGTH} 个字符` })
  }
  if (team.members.length < MIN_TEAM_MEMBERS) {
    issues.push({ section: 'members', field: 'members', message: `至少需要 ${MIN_TEAM_MEMBERS} 个成员 Agent` })
  }
  if (team.members.length > MAX_TEAM_MEMBERS) {
    issues.push({ section: 'members', field: 'members', message: `成员 Agent 不能超过 ${MAX_TEAM_MEMBERS} 个` })
  }
  if (team.members.some((member) => !member.agentName.trim())) {
    issues.push({ section: 'members', field: 'members', message: '存在未指定 Agent 的成员行' })
  }
  const names = team.members.map((member) => member.agentName.trim()).filter(Boolean)
  if (new Set(names).size !== names.length) {
    issues.push({ section: 'members', field: 'members', message: '同一个 Agent 不能重复加入 Team' })
  }
  if (team.members.length && (team.entryIndex < 0 || team.entryIndex >= team.members.length)) {
    issues.push({ section: 'members', field: 'members', message: '请指定入口 Agent' })
  }
  if (team.concurrency < MIN_CONCURRENCY || team.concurrency > MAX_CONCURRENCY) {
    issues.push({ section: 'runtime', field: 'concurrency', message: `并发上限需要在 ${MIN_CONCURRENCY} 到 ${MAX_CONCURRENCY} 之间` })
  }
  if (team.timeoutSeconds < MIN_TEAM_TIMEOUT_SECONDS || team.timeoutSeconds > MAX_TEAM_TIMEOUT_SECONDS) {
    issues.push({ section: 'runtime', field: 'timeoutSeconds', message: `超时时间需要在 ${MIN_TEAM_TIMEOUT_SECONDS} 到 ${MAX_TEAM_TIMEOUT_SECONDS} 秒之间` })
  }
  return issues
}
