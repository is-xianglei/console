import type {
  SkillCreateRequest,
  SkillDeleteResult,
  SkillEnabledRequest,
  SkillUpdateRequest,
  SkillValidateResult,
} from '../interfaces/skill/api'
import type { SkillDetailResponse, SkillResponse } from '../interfaces/skill/model'
import { request, requestBlob } from './index'

function bundleForm(file: File): FormData {
  const form = new FormData()
  form.append('file', file)
  return form
}

/** GET /api/skills — 当前工作区全部未删除 skill（含已停用），按创建时间倒序。 */
export function getSkillList(): Promise<SkillResponse[]> {
  return request<SkillResponse[]>('/skills')
}

/** GET /api/skills/{skill_id} — 详情（frontmatter / 附属文件清单 / 正文）。 */
export function getSkillDetail(skillId: number): Promise<SkillDetailResponse> {
  return request<SkillDetailResponse>(`/skills/${skillId}`)
}

/** POST /api/skills/validate — 预检 zip，不写库。 */
export function validateSkill(file: File): Promise<SkillValidateResult> {
  return request<SkillValidateResult>('/skills/validate', { method: 'POST', body: bundleForm(file) })
}

/** POST /api/skills/upload — 上传 zip 新建；同名有效 skill 存在时 409。 */
export function uploadSkillBundle(file: File): Promise<SkillResponse> {
  return request<SkillResponse>('/skills/upload', { method: 'POST', body: bundleForm(file) })
}

/** PUT /api/skills/{skill_id}/bundle — 用 zip 整体覆盖；zip 内 name 必须与记录一致。 */
export function replaceSkillBundle(skillId: number, file: File): Promise<SkillResponse> {
  return request<SkillResponse>(`/skills/${skillId}/bundle`, { method: 'PUT', body: bundleForm(file) })
}

/** POST /api/skills — JSON 新建。 */
export function createSkill(payload: SkillCreateRequest): Promise<SkillResponse> {
  return request<SkillResponse>('/skills', { method: 'POST', body: JSON.stringify(payload) })
}

/** PUT /api/skills/{skill_id} — JSON 更新。 */
export function updateSkill(skillId: number, payload: SkillUpdateRequest): Promise<SkillResponse> {
  return request<SkillResponse>(`/skills/${skillId}`, { method: 'PUT', body: JSON.stringify(payload) })
}

/** PATCH /api/skills/{skill_id}/enabled — 启用 / 停用。 */
export function setSkillEnabled(skillId: number, payload: SkillEnabledRequest): Promise<SkillResponse> {
  return request<SkillResponse>(`/skills/${skillId}/enabled`, { method: 'PATCH', body: JSON.stringify(payload) })
}

/** GET /api/skills/{skill_id}/export — 导出 zip 二进制。 */
export function exportSkill(skillId: number): Promise<Blob> {
  return requestBlob(`/skills/${skillId}/export`)
}

/** DELETE /api/skills/{skill_id} — 软删除，同时解除 agent 绑定。 */
export function deleteSkill(skillId: number): Promise<SkillDeleteResult> {
  return request<SkillDeleteResult>(`/skills/${skillId}`, { method: 'DELETE' })
}
