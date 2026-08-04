import type { SkillValidateResult } from '../interfaces/skill/api'
import type { SkillDetailResponse, SkillResponse } from '../interfaces/skill/model'
import { request } from './index'

/** GET /api/skills — 列出当前工作区全部 skill 的精简元数据。 */
export function getSkillList(): Promise<SkillResponse[]> {
  return request<SkillResponse[]>('/skills')
}

/** GET /api/skills/{name} — 查询单个 skill 详情。 */
export function getSkillDetail(name: string): Promise<SkillDetailResponse> {
  return request<SkillDetailResponse>(`/skills/${encodeURIComponent(name)}`)
}

/** POST /api/skills — 通过 multipart 的 file 字段上传或覆盖 skill zip bundle。 */
export function createSkill(file: File): Promise<SkillResponse> {
  const form = new FormData()
  form.append('file', file)
  return request<SkillResponse>('/skills', { method: 'POST', body: form })
}

/** POST /api/skills/validate — 预检 skill bundle，不写入存储。 */
export function validateSkill(file: File): Promise<SkillValidateResult> {
  const form = new FormData()
  form.append('file', file)
  return request<SkillValidateResult>('/skills/validate', { method: 'POST', body: form })
}

/** DELETE /api/skills/{name} — 软删除指定 skill。 */
export function deleteSkill(name: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/skills/${encodeURIComponent(name)}`, { method: 'DELETE' })
}
