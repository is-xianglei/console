/** 会话关联的应用标识。 */
export type SessionAppId = string

/** 应用中心条目。 */
export interface AppTile {
  id: string
  name: string
  icon: string
  color: string
  desc: string
  category: string
  /** 是否启用;false 时置灰并展示「未启用」原因副文案。 */
  enabled?: boolean
  /** 应用级权限要求;缺权限时置灰并展示对应原因。 */
  permission?: { code: string; label: string }
}

export type AppRuntimeStatus = 'nominal' | 'warning'

export interface RuntimeAsset {
  name: string
  score: number
  reading: string
  status: AppRuntimeStatus
}

export interface RuntimeMeasure {
  label: string
  value: string
}

/** 制造应用运行工作台数据。 */
export interface WorkbenchApp {
  id: string
  name: string
  icon: string
  status: AppRuntimeStatus
  team: string
  subject: string
  unit: string
  location: string
  score: number
  tabs: string[]
  readingLabel: string
  detail: string
  reviewLabel: string
  assets: RuntimeAsset[]
  measures: RuntimeMeasure[]
  events: string[]
}
