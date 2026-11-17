/** 表单校验问题：field 对应 UFormField 的 name，错误显示在该字段下方。 */
export interface AgentValidationIssue {
  field: 'name' | 'systemPrompt'
  message: string
}

/** Agent 创建与编辑页使用的表单模型，仅包含后端可持久化字段。 */
export interface AgentFormModel {
  id: number | null
  workspaceId: number | null
  createdByUserId: number | null
  name: string
  description: string
  systemPrompt: string
  modelName: string
  isEnabled: boolean
  toolIds: number[]
  skillIds: number[]
  createdAt: string
  updatedAt: string
}
