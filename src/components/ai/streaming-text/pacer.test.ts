import { describe, expect, it } from 'vitest'
import {
  BASE_RATE,
  CATCH_UP_MS,
  advancePacer,
  createPacer,
  initialPacer,
  retargetPacer,
  revealedLength,
} from './pacer'

/** 按固定帧长连续推进，模拟 rAF 驱动 */
function run(state: ReturnType<typeof createPacer>, ms: number, frame = 16) {
  let s = state
  for (let t = 0; t < ms; t += frame) s = advancePacer(s, Math.min(frame, ms - t))
  return s
}

describe('streaming-text 揭示节奏', () => {
  it('已结束的内容挂载时直接全部显示', () => {
    const s = initialPacer(120, false)
    expect(s.cursor).toBe(120)
    expect(advancePacer(s, 500).cursor).toBe(120)
  })

  it('流式中挂载时已有的字从头揭示，并在追赶上限内追平', () => {
    const s = initialPacer(30, true)
    expect(s.cursor).toBe(0)
    expect(s.target).toBe(30)
    expect(advancePacer(s, 90).cursor).toBeCloseTo(20)
    expect(run(initialPacer(3000, true), CATCH_UP_MS).cursor).toBe(3000)
  })

  it('积压不多时按基准速度揭示：每 9ms 2 字', () => {
    const s = retargetPacer(createPacer(0), 100)
    expect(s.rate).toBe(BASE_RATE)
    expect(advancePacer(s, 90).cursor).toBeCloseTo(20)
    expect(advancePacer(s, 450).cursor).toBeCloseTo(100)
  })

  it('积压过多时提速，在追赶上限内追平', () => {
    const s = retargetPacer(createPacer(0), 3000)
    expect(s.rate).toBeGreaterThan(BASE_RATE)
    expect(run(s, CATCH_UP_MS).cursor).toBe(3000)
    expect(run(s, CATCH_UP_MS / 2).cursor).toBeLessThan(3000)
  })

  it('追赶途中又来新内容，按新的积压重算，仍在上限内追平', () => {
    const half = run(retargetPacer(createPacer(0), 3000), CATCH_UP_MS / 2)
    const s = retargetPacer(half, 6000)
    expect(run(s, CATCH_UP_MS).cursor).toBe(6000)
  })

  it('游标不超过目标，非正的经过时间不推进', () => {
    const s = retargetPacer(createPacer(0), 10)
    expect(advancePacer(s, 10_000).cursor).toBe(10)
    expect(advancePacer(s, 0)).toBe(s)
    expect(advancePacer(s, -5)).toBe(s)
  })

  it('文本整体替换变短时游标回落', () => {
    const s = retargetPacer(createPacer(50), 20)
    expect(s.cursor).toBe(20)
    expect(s.target).toBe(20)
  })

  it('不在 emoji 代理对中间截断', () => {
    const text = '你好😊'
    expect(text.length).toBe(4)
    expect(revealedLength(text, 3)).toBe(2)
    expect(revealedLength(text, 3.9)).toBe(2)
    expect(revealedLength(text, 4)).toBe(4)
    expect(revealedLength(text, 1.5)).toBe(1)
  })
})
