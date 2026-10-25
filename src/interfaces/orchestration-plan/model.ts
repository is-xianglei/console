import type { PlanMode } from './api'

/** 编辑器中的方案成员模型；routing 模式使用 routeKey/when。 */
export interface PlanMemberFormModel {
  agentId: number
  agentName: string
  routeKey: string
  when: string
  isAvailable: boolean
}

/** 方案创建与编辑页使用的表单模型，仅包含后端可持久化字段。 */
export interface PlanFormModel {
  id: number | null
  workspaceId: number | null
  createdByUserId: number | null
  name: string
  description: string
  mode: PlanMode
  maxIterations: number
  fallback: string
  isEnabled: boolean
  members: PlanMemberFormModel[]
  createdAt: string
  updatedAt: string
}

/**
 * 校验问题所指的表单字段，Builder 据此定位步骤与 UFormField：
 * - name：方案名称；members：成员数量 / 成员重复 / 成员已停用；
 * - routeKey / when：routing 模式下第 memberIndex 个成员的路由标识 / 触发条件（含路由标识重复）；
 * - maxIterations：loop 模式的循环轮数；fallback：routing 模式的兜底路由。
 */
export type PlanIssueField = 'name' | 'members' | 'routeKey' | 'when' | 'maxIterations' | 'fallback'

/** 方案表单校验问题，section 用于定位编辑器区块。 */
export interface PlanValidationIssue {
  section: 'basic' | 'members' | 'config'
  /** 问题所指的字段；routeKey / when 另带 memberIndex。 */
  field: PlanIssueField
  /** field 为 routeKey / when 时所属成员在 members 中的下标。 */
  memberIndex?: number
  message: string
}

/** 方案 Builder 的步骤：config 仅 loop / routing 模式出现。 */
export type PlanBuilderStep = 'basic' | 'mode' | 'members' | 'order' | 'config'
