import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClientInputId, presentClientInputIds } from './client-input-id'

const PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('客户端发言 ID', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('生成符合后端格式的 UUID，每次不同', () => {
    const first = createClientInputId()
    const second = createClientInputId()
    expect(first).toMatch(PATTERN)
    expect(first.length).toBeLessThanOrEqual(64)
    expect(first).not.toBe(second)
  })

  it('非安全上下文没有 randomUUID 时用随机字节拼 UUID v4', () => {
    const getRandomValues = (bytes: Uint8Array) => bytes.fill(0xff)
    vi.stubGlobal('crypto', { getRandomValues })
    const id = createClientInputId()
    expect(id).toMatch(UUID_V4)
    expect(id).toMatch(PATTERN)
  })

  it('去掉没传的位置', () => {
    expect(presentClientInputIds(['a', null, 'b', undefined])).toEqual(['a', 'b'])
    expect(presentClientInputIds(undefined)).toEqual([])
  })
})
