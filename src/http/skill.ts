import type { SkillDeleteResult, SkillValidateResult } from '../interfaces/skill/api'
import type { SkillDetailResponse, SkillResponse } from '../interfaces/skill/model'
import { request } from './index'

/** GET /api/skills — 列出全部未软删的 skill(无分页,按 name 升序;前端自行筛选) */
export function getSkillList(): Promise<SkillResponse[]> {
  return request<SkillResponse[]>('/skills')
}

/** GET /api/skills/{name} — 单个 skill 详情(含 frontmatter、资源清单、正文) */
export function getSkillDetail(name: string): Promise<SkillDetailResponse> {
  return request<SkillDetailResponse>(`/skills/${encodeURIComponent(name)}`)
}

/**
 * POST /api/skills — 上传 / 覆盖更新 skill(multipart,字段名 file,zip ≤8MB)。
 * 同名覆盖更新;同名同哈希幂等短路;软删的同名 skill 会被复活并置 enabled。
 * 校验失败后端返回 422(如 SKILL_BUNDLE_INVALID / SKILL_NAME_MISMATCH),经 request 抛 ApiError。
 */
export function createSkill(file: File): Promise<SkillResponse> {
  const form = new FormData()
  form.append('file', file)
  return request<SkillResponse>('/skills', { method: 'POST', body: form })
}

/**
 * POST /api/skills/validate — 预检 bundle(不落库、不写存储)。
 * 即使校验不通过也返回 HTTP 200,以返回体的 ok / errors 区分。
 */
export function validateSkill(file: File): Promise<SkillValidateResult> {
  const form = new FormData()
  form.append('file', file)
  return request<SkillValidateResult>('/skills/validate', { method: 'POST', body: form })
}

/** DELETE /api/skills/{name} — 软删除(不物理删,亦不删 MinIO 文件) */
export function deleteSkill(name: string): Promise<SkillDeleteResult> {
  return request<SkillDeleteResult>(`/skills/${encodeURIComponent(name)}`, { method: 'DELETE' })
}
