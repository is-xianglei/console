import { describe, expect, it } from 'vitest'
import { clampPage, isPaged } from './pagination-core'

describe('ResourcePagination 分页计算', () => {
  it('总条数 / 每页条数计算 pageCount', () => {
    expect(clampPage(1, 55, 20)).toBe(1)
    expect(clampPage(3, 55, 20)).toBe(3)
    // 整除边界：60/20=3 页。
    expect(clampPage(3, 60, 20)).toBe(3)
  })

  it('越界页码被钳制到 [1, pageCount]', () => {
    expect(clampPage(0, 55, 20)).toBe(1)
    expect(clampPage(4, 55, 20)).toBe(3)
    // 负数兜底为 1。
    expect(clampPage(-5, 10, 20)).toBe(1)
  })

  it('itemsPerPage 为 0 时退化为 1 页并视为未启用真分页', () => {
    expect(isPaged(1, 0)).toBe(false)
    expect(isPaged(undefined, 0)).toBe(false)
    expect(clampPage(1, 30, 0)).toBe(1)
  })

  it('page 未定义时不算真分页', () => {
    expect(isPaged(undefined, 20)).toBe(false)
    expect(isPaged(3, 20)).toBe(true)
  })
})
