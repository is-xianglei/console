import type {
  MemoryDetail,
  MemoryExportContext,
  MemoryExportItem,
  MemoryExportJob,
  MemoryExportSpace,
  MemoryStatus,
  MemorySummary,
  MemoryType,
} from './model'

export interface GetMemoryListParams {
  status?: MemoryStatus | null
  memory_type?: MemoryType | null
  limit?: number
  offset?: number
}

export interface GetMemoryListResponse {
  items: MemorySummary[]
  total: number
  limit: number
  offset: number
}

export interface CreateMemoryRequest {
  memory_key: string
  memory_type: MemoryType
  name: string
  description: string
  body: string
}

export interface UpdateMemoryRequest {
  version: number
  memory_type?: MemoryType | null
  name?: string | null
  description?: string | null
  body?: string | null
}

export interface DeleteMemoryRequest {
  version: number
}

export interface DeleteMemoryResponse {
  id: number
  deleted: boolean
  version: number
  catalog_version: number
}

export interface SearchMemoryRequest {
  query: string
  memory_type?: MemoryType | null
  limit?: number
}

export interface SearchMemoryResponse {
  items: MemorySummary[]
  total: number
}

export interface ExportMemoryResponse {
  schema_version: '1.0'
  exported_at: string
  workspace_id: number
  user_id: number
  space: MemoryExportSpace | null
  items: MemoryExportItem[]
  jobs: MemoryExportJob[]
  contexts: MemoryExportContext[]
}

export interface MemoryPurgeConfirmationResponse {
  confirmation_token: string
  expected_catalog_version: number
  expires_at: string
}

export interface PurgeMemoryRequest {
  confirmation_token: string
  expected_catalog_version: number
}

export interface PurgeMemoryResponse {
  spaces_deleted: number
  items_deleted: number
  revisions_deleted: number
  sources_deleted: number
  jobs_deleted: number
  contexts_deleted: number
}

export interface RollbackMemoryDreamRequest {
  expected_after_catalog_version: number
}

export interface RollbackMemoryDreamResponse {
  dream_job_id: string
  restored_item_ids: number[]
  rolled_back_catalog_version: number
  catalog_version: number
}

export type GetMemoryDetailResponse = MemoryDetail
