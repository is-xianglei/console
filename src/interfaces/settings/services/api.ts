/** 批量更新中的单项；value 为空串表示清空。 */
export interface ServiceConfigUpdateItem {
  key: string
  value: string | null
}

/** PUT /v1/me/system/service-configs 请求体。 */
export interface ServiceConfigUpdateRequest {
  items: ServiceConfigUpdateItem[]
}

/** PUT /v1/me/system/service-configs 返回。 */
export interface ServiceConfigUpdateResult {
  updated: number
}
