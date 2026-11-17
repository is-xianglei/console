import type { ModelProviderType } from './model'

/** 新增 / 更新供应商请求。更新时 api_key 缺省表示不修改现有密钥。 */
export interface ModelProviderInput {
  display_name: string
  provider_type: ModelProviderType
  provider: string
  base_url: string
  api_key?: string
  model_name: string
  extra_config: Record<string, unknown>
  is_active: boolean
}

/** 上下文窗口 / 思考档位探测请求：用未保存的表单值即可探测。 */
export interface ModelProbeRequest {
  provider: string
  provider_type: ModelProviderType
  base_url: string
  api_key: string
  model_name: string
  /** 编辑时 API Key 留空，传 provider_id 让后端复用已存密钥。 */
  provider_id?: string
}

/** 角色指派请求（PUT /v1/models/roles/{role_key}）。 */
export interface ModelRoleAssignRequest {
  provider_id: string
}

/** 默认模型偏好更新（PATCH /api/users/me）。 */
export interface DefaultModelUpdateRequest {
  preferences: {
    default_model_provider_id: string | null
  }
}
