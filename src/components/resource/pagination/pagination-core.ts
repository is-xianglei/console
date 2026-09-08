/** 分页计算纯函数（供组件与单测共用）。 */

/** 是否启用真分页：page 已定义且 itemsPerPage > 0。 */
export function isPaged(page: number | undefined, itemsPerPage: number): boolean {
  return page != null && itemsPerPage > 0
}

/** 计算页数并把页码钳制到 [1, pageCount]。 */
export function clampPage(page: number, total: number, itemsPerPage: number): number {
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, itemsPerPage)))
  return Math.min(Math.max(1, page), pageCount)
}
