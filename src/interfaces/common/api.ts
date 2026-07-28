import type { ErrorBody } from './model'

/** 后端统一响应信封。 */
export interface ApiResponse<T> {
  data: T | null
  error: ErrorBody | null
  request_id: string | null
}
