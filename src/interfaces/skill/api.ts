/** Skill 包预检结果；校验不通过也是 200，看 ok / errors。 */
export interface SkillValidateResult {
  ok: boolean
  name: string | null
  description: string | null
  /** 只含遇到的第一个错误；通过时为 []。 */
  errors: string[]
}

/** POST /api/skills（JSON 新建）请求体。 */
export interface SkillCreateRequest {
  name: string
  description: string
  body: string
  version?: string | null
  compatibility?: string | null
  metadata?: Record<string, unknown> | null
}

/** PUT /api/skills/{skill_id}（JSON 更新）请求体；可选字段不传或 null 表示保留原值。 */
export interface SkillUpdateRequest {
  /** 传了必须与记录一致。 */
  name?: string | null
  description: string
  body: string
  version?: string | null
  compatibility?: string | null
  metadata?: Record<string, unknown> | null
}

/** PATCH /api/skills/{skill_id}/enabled 请求体。 */
export interface SkillEnabledRequest {
  enabled: boolean
}

/** DELETE /api/skills/{skill_id} 结果；不存在也是 200 + deleted:false。 */
export interface SkillDeleteResult {
  deleted: boolean
}
