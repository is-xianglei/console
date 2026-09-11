/** Team 领域模型。当前 Teams 仍由前端目录驱动，字段刻意贴近后续后端契约。 */

export type TeamMode = 'supervisor' | 'parallel' | 'pipeline'

export interface TeamMember {
  /** 成员 Agent 的目录 ID，例如 AGT-0014。 */
  agentId: string
  agentName: string
  /** 成员在 Team 中的职责说明。 */
  duty: string
  /** 是否为该 Team 的入口 Agent。 */
  isEntry: boolean
}

export interface TeamFormModel {
  id: string
  name: string
  mode: TeamMode
  status: 'nominal' | 'warning' | 'error' | 'idle'
  /** 入口 Agent 在 members 中的下标；无成员时为 -1。 */
  entryIndex: number
  members: TeamMember[]
  description: string
  owner: string
  tags: string[]
  /** 是否共享上下文。 */
  sharedContext: boolean
  /** 是否需要人工审批节点。 */
  requiresApproval: boolean
  /** 并发上限。 */
  concurrency: number
  /** 单次运行超时秒数。 */
  timeoutSeconds: number
  createdAt: string
  updatedAt: string
}

/** 与 PlanValidationIssue 同构，供 Builder 分组展示与首错定位。 */
export interface TeamValidationIssue {
  section: 'basic' | 'members' | 'runtime'
  message: string
}

export const TEAM_MODE_OPTIONS: Array<{ value: TeamMode; label: string; hint: string }> = [
  { value: 'supervisor', label: '主管式', hint: '入口 Agent 分派任务并汇总结果，其余成员作为执行单元。' },
  { value: 'parallel', label: '并行协作', hint: '多个 Agent 同时处理子任务，适合相互独立的约束求解。' },
  { value: 'pipeline', label: '流水线', hint: '按成员顺序依次交接，上一步的输出即下一步的输入。' },
]

export const TEAM_MODE_LABEL: Record<TeamMode, string> = {
  supervisor: '主管式',
  parallel: '并行协作',
  pipeline: '流水线',
}

export const MIN_TEAM_MEMBERS = 2
export const MAX_TEAM_MEMBERS = 8
export const MIN_CONCURRENCY = 1
export const MAX_CONCURRENCY = 8

export function isTeamMode(value: unknown): value is TeamMode {
  return value === 'supervisor' || value === 'parallel' || value === 'pipeline'
}

/** 目录里的 Team 展示成 TEAM-0003 这种编号。 */
export function teamCode(id: string) {
  return id.toUpperCase().startsWith('TEAM-') ? id : `TEAM-${id}`
}
