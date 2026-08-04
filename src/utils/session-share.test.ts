import { describe, expect, it } from 'vitest'
import { parseShareIdList } from './session-share'

describe('parseShareIdList', () => {
  it('解析、去重逗号分隔的正整数 ID', () => {
    expect(parseShareIdList('12, 18, 12')).toEqual([12, 18])
    expect(parseShareIdList('')).toEqual([])
  })

  it.each(['12, 18x', '12,', '0', '-1', '9007199254740992'])(
    '拒绝包含非法项的输入 %s',
    (value) => expect(parseShareIdList(value)).toBeNull(),
  )
})
