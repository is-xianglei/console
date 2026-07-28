/** Skill 包预检结果。 */
export interface SkillValidateResult {
  ok: boolean
  name: string | null
  description: string | null
  errors: string[]
}

/** Skill 软删除结果。 */
export interface SkillDeleteResult {
  deleted: boolean
}
