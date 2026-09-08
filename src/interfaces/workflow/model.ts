import type { WorkflowMode } from './api'

/** 表单里的成员行；isAvailable 由前端用 Agent 列表反查 is_enabled 得到，后端不返回。 */
export interface WorkflowMemberFormModel {
  agentId: number
  agentName: string
  isAvailable: boolean
}

/** Workflow 表单模型；成员数组顺序即提交时的 sort_order。 */
export interface WorkflowFormModel {
  id: number | null
  name: string
  description: string
  mode: WorkflowMode
  isEnabled: boolean
  members: WorkflowMemberFormModel[]
}

/** 表单校验问题，section 用于把提示定位到对应分区。 */
export interface WorkflowValidationIssue {
  section: 'basic' | 'members'
  message: string
}
