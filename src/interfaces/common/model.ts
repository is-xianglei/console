/** 后端错误响应结构。 */
export interface ErrorBody {
  /** OpenAPI 声明为必填，运行时不返回。 */
  code?: string
  message: string
  details?: Record<string, unknown>
}
