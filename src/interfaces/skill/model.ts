/** Skill 列表、新建、更新、覆盖、启停接口返回的元数据。 */
export interface SkillResponse {
  id: number
  workspace_id: number
  name: string
  description: string
  version: string | null
  /** 目前固定为 "workspace"。 */
  scope: string
  is_enabled: boolean
  created_at: string
  updated_at: string
}

/** Skill 详情中的附属文件清单元素（不含内容）。 */
export interface SkillResourceItem {
  relative_path: string
  size: number
  mime: string
  /** "utf-8" 文本 / "base64" 二进制。 */
  encoding: string
}

/** Skill 完整详情。 */
export interface SkillDetailResponse extends SkillResponse {
  frontmatter: Record<string, unknown>
  resources: SkillResourceItem[]
  body: string
}
