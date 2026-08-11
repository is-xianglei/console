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

/** 方案表单校验问题，section 用于定位编辑器区块。 */
export interface PlanValidationIssue {
  section: 'basic' | 'members' | 'config'
  message: string
}
