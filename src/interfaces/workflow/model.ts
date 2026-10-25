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

/** Workflow Builder 的步骤 id：基本信息 → 编排模式 → 选择成员 → 成员配置。 */
export type WorkflowBuilderStep = 'basic' | 'mode' | 'members' | 'config'

/** 表单校验问题，section 用于把提示定位到对应分区。 */
export interface WorkflowValidationIssue {
  section: 'basic' | 'members'
  /**
   * 问题所在的 Builder 步骤，比 section 更细：成员数量不足 / 重复属于「选择成员」，
   * 成员不可用属于「成员配置」（警告显示在该步的成员行上）。
   */
  step: Exclude<WorkflowBuilderStep, 'mode'>
  message: string
}
