export type PlatformModuleKey = 'build' | 'governance' | 'organization'
export type ResourceStatus = 'nominal' | 'warning' | 'error' | 'idle'

export interface PlatformNavItem {
  key: string
  label: string
  icon: string
  count?: string
  route?: string
}

export interface PlatformNavSection {
  label: string
  items: PlatformNavItem[]
}

export interface PlatformModule {
  key: PlatformModuleKey
  title: string
  caption: string
  sections: PlatformNavSection[]
}

export interface ResourceRow {
  id: string
  name: string
  status: ResourceStatus
  values: string[]
  description: string
  tags: string[]
  owner: string
}

export interface ResourcePage {
  key: string
  module: PlatformModuleKey
  title: string
  group: string
  icon: string
  action: string
  description: string
  stats: Array<[string, string]>
  /** 是否在页面顶部渲染统计卡片；未设置时按 true 处理。Teams 暂不展示。 */
  showStats?: boolean
  columns: string[]
  rows: ResourceRow[]
  featureTitle: string
  featureHint: string
  mode: 'orchestration' | 'connection' | 'policy' | 'observe' | 'directory' | 'access'
}
