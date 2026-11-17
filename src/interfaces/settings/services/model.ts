/** 服务配置项；is_secret 为真时 config_value 已脱敏（含 `****`）。 */
export interface ServiceConfigItem {
  config_key: string
  config_value: string | null
  display_name: string
  /** 后端带的含义 / 取值范围说明。 */
  description: string
  group_key: string
  is_secret: boolean
  updated_at?: string | null
  updated_by?: string | null
}

/** GET /v1/me/system/service-configs 返回的分组。 */
export interface ServiceConfigGroup {
  group_key: string
  label: string
  /** 是否支持连通性测试。 */
  testable: boolean
  items: ServiceConfigItem[]
}

/** POST /v1/me/system/service-configs/test/{group_key} 的结果。 */
export interface ServiceConfigTestResult {
  success: boolean
  latency_ms: number
  error: string | null
}
