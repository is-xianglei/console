import type {
  CreateMemoryRequest,
  DeleteMemoryRequest,
  DeleteMemoryResponse,
  ExportMemoryResponse,
  GetMemoryDetailResponse,
  GetMemoryListParams,
  GetMemoryListResponse,
  MemoryPurgeConfirmationResponse,
  PurgeMemoryRequest,
  PurgeMemoryResponse,
  RollbackMemoryDreamRequest,
  RollbackMemoryDreamResponse,
  SearchMemoryRequest,
  SearchMemoryResponse,
  UpdateMemoryRequest,
} from '@/interfaces/memory/api'
import { request } from './index'

function memoryListQuery(params?: GetMemoryListParams): string {
  const query = new URLSearchParams()
  if (params?.status) query.set('status', params.status)
  if (params?.memory_type) query.set('memory_type', params.memory_type)
  if (params?.limit != null) query.set('limit', String(params.limit))
  if (params?.offset != null) query.set('offset', String(params.offset))
  const value = query.toString()
  return value ? `?${value}` : ''
}

/** 查询当前用户在当前工作区中的 Memory。 */
export function getMemoryList(params?: GetMemoryListParams): Promise<GetMemoryListResponse> {
  return request<GetMemoryListResponse>(`/memories${memoryListQuery(params)}`)
}

/** 显式创建长期记忆。 */
export function createMemory(payload: CreateMemoryRequest): Promise<GetMemoryDetailResponse> {
  return request<GetMemoryDetailResponse>('/memories', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 使用管理端词法搜索 Memory。 */
export function searchMemory(payload: SearchMemoryRequest): Promise<SearchMemoryResponse> {
  return request<SearchMemoryResponse>('/memories/search', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 导出当前用户在当前工作区中的完整 Memory 数据。 */
export function exportMemory(): Promise<ExportMemoryResponse> {
  return request<ExportMemoryResponse>('/memories/export')
}

/** 获取彻底删除 Memory Space 所需的短时确认令牌。 */
export function createMemoryPurgeConfirmation(): Promise<MemoryPurgeConfirmationResponse> {
  return request<MemoryPurgeConfirmationResponse>('/memories/purge-confirmation', {
    method: 'POST',
  })
}

/** 彻底删除当前用户在当前工作区中的 Memory Space。 */
export function purgeMemory(payload: PurgeMemoryRequest): Promise<PurgeMemoryResponse> {
  return request<PurgeMemoryResponse>('/memories/purge', {
    method: 'DELETE',
    body: JSON.stringify(payload),
  })
}

/** 按 Catalog 版本回滚一次 Dream 任务。 */
export function rollbackMemoryDream(
  dreamJobId: string,
  payload: RollbackMemoryDreamRequest,
): Promise<RollbackMemoryDreamResponse> {
  return request<RollbackMemoryDreamResponse>(
    `/memories/dreams/${encodeURIComponent(dreamJobId)}/rollback`,
    { method: 'POST', body: JSON.stringify(payload) },
  )
}

/** 查询 Memory 正文、修订和来源。 */
export function getMemoryDetail(memoryId: number): Promise<GetMemoryDetailResponse> {
  return request<GetMemoryDetailResponse>(`/memories/${memoryId}`)
}

/** 携带乐观锁版本更新 Memory。 */
export function updateMemory(
  memoryId: number,
  payload: UpdateMemoryRequest,
): Promise<GetMemoryDetailResponse> {
  return request<GetMemoryDetailResponse>(`/memories/${memoryId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/** 携带乐观锁版本软删除 Memory。 */
export function deleteMemory(
  memoryId: number,
  payload: DeleteMemoryRequest,
): Promise<DeleteMemoryResponse> {
  return request<DeleteMemoryResponse>(`/memories/${memoryId}`, {
    method: 'DELETE',
    body: JSON.stringify(payload),
  })
}
