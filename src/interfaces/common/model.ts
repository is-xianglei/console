/** 后端错误响应结构。 */
export interface ErrorBody {
  code: string
  message: string
  details?: Record<string, unknown>
}
