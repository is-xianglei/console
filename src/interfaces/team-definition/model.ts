/** Team 表单模型：新建 / 编辑页的草稿与前端校验结果。成员数组顺序即提交时的 sort_order，只表示展示顺序。 */

/** 与后端 Schema 约束一致的长度上限。 */
export const MAX_TEAM_NAME_LENGTH = 128
export const MAX_TEAM_MEMBER_NAME_LENGTH = 120
export const MAX_TEAM_MEMBER_ROLE_LENGTH = 120

/** 成员名保留字：lead 是会话主 Agent，* 是广播收件人。 */
export const RESERVED_TEAM_MEMBER_NAMES: readonly string[] = ['lead', '*']

/** 名单里的一行：同一个 Agent 可以用不同成员名出现多次。 */
export interface TeamMemberFormModel {
  /** 前端行 key，只用于列表渲染，不提交。 */
  key: string
  agentId: number | null
  /** Agent 名称；后端返回 null 表示该 Agent 已删除，需要重新选择。 */
  agentName: string | null
  name: string
  role: string
}

export interface TeamFormModel {
  id: number | null
  name: string
  description: string
  isEnabled: boolean
  members: TeamMemberFormModel[]
}

export type TeamFormField = 'name' | 'members'
export type TeamMemberField = 'agent' | 'name' | 'role'

/** 校验问题；成员行问题带下标和列，表单据此标红对应控件。 */
export interface TeamValidationIssue {
  field: TeamFormField
  memberIndex?: number
  memberField?: TeamMemberField
  message: string
}
