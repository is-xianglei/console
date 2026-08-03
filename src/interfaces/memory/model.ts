export type MemoryType = 'user' | 'feedback' | 'project' | 'reference'
export type MemoryStatus = 'active' | 'superseded' | 'archived'
export type MemorySourceKind = 'explicit' | 'extracted' | 'dream' | 'manual'

/** Memory 列表与搜索结果中的摘要。 */
export interface MemorySummary {
  id: number
  memory_key: string
  memory_type: MemoryType
  name: string
  description: string
  status: MemoryStatus
  version: number
  superseded_by_id: number | null
  source_kind: MemorySourceKind
  last_used_at: string | null
  use_count: number
  created_at: string
  updated_at: string
}

/** Memory 的不可变修订记录。 */
export interface MemoryRevision {
  id: number
  revision: number
  memory_type: MemoryType
  name: string
  description: string
  body: string
  actor_type: string
  actor_id: string | null
  created_at: string
}

/** Memory 的来源证据。 */
export interface MemorySource {
  id: number
  revision_id: number
  session_id: number | null
  turn_id: string | null
  from_message_id: number | null
  to_message_id: number | null
  source_kind: MemorySourceKind
  source_excerpt: string | null
  created_at: string
}

/** 包含正文、修订和来源的 Memory 详情。 */
export interface MemoryDetail extends MemorySummary {
  body: string
  catalog_version: number
  revisions: MemoryRevision[]
  sources: MemorySource[]
}

interface MemoryExportAuditFields {
  created_at: string
  updated_at: string
  is_deleted: boolean
  deleted_at: string | null
}

export interface MemoryExportRevision extends MemoryExportAuditFields {
  id: number
  memory_id: number
  revision: number
  memory_type: MemoryType
  name: string
  description: string
  body: string
  actor_type: string
  actor_id: string | null
  run_id: string | null
}

export interface MemoryExportSource extends MemoryExportAuditFields {
  id: number
  memory_id: number
  revision_id: number
  session_id: number | null
  turn_id: string | null
  from_message_id: number | null
  to_message_id: number | null
  source_kind: MemorySourceKind
  source_excerpt: string | null
}

export interface MemoryExportItem extends MemoryExportAuditFields {
  id: number
  space_id: number
  memory_key: string
  memory_type: MemoryType
  name: string
  description: string
  body: string
  status: MemoryStatus
  version: number
  superseded_by_id: number | null
  source_kind: MemorySourceKind
  last_used_at: string | null
  use_count: number
  revisions: MemoryExportRevision[]
  sources: MemoryExportSource[]
}

export interface MemoryExportSpace extends MemoryExportAuditFields {
  id: number
  workspace_id: number
  user_id: number
  catalog_version: number
  last_dream_at: string | null
  last_scan_at: string | null
  sessions_since_dream: number
  settings: Record<string, unknown>
}

export interface MemoryExportJob extends MemoryExportAuditFields {
  id: number
  space_id: number
  job_type: 'extract' | 'dream'
  session_id: number | null
  turn_id: string | null
  idempotency_key: string
  status: 'pending' | 'running' | 'retry' | 'succeeded' | 'dead'
  attempts: number
  max_attempts: number
  available_at: string
  lease_until: string | null
  worker_id: string | null
  model: string | null
  prompt_version: string | null
  base_catalog_version: number
  started_at: string | null
  finished_at: string | null
  last_error_code: string | null
  last_error_message: string | null
  payload: Record<string, unknown>
}

export interface MemoryExportContext extends MemoryExportAuditFields {
  id: number
  turn_id: string
  space_id: number | null
  catalog_version: number
  selected_revision_ids: number[]
  rendered_catalog: string
  rendered_memories: string
  selector_status: 'selected' | 'empty' | 'degraded'
  degraded_reason: string | null
  byte_count: number
}
