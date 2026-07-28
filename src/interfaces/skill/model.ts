/** Skill 列表与上传响应中的摘要。 */
export interface SkillResponse {
  id: number
  name: string
  description: string
  version: string | null
  status: string
  scope: string
  created_at: string
  updated_at: string
}

/** Skill 详情中的资源清单元素。 */
export interface SkillResourceItem {
  relative_path: string
  size: number
  mime: string
}

/** Skill 完整详情。 */
export interface SkillDetailResponse extends SkillResponse {
  frontmatter: Record<string, unknown>
  resources: SkillResourceItem[]
  body: string
}
