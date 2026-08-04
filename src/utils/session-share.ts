/** 解析逗号分隔的正整数 ID；任一项非法时拒绝整个输入。 */
export function parseShareIdList(value: string): number[] | null {
  const input = value.trim()
  if (!input) return []

  const ids: number[] = []
  for (const item of input.split(',')) {
    const token = item.trim()
    if (!/^\d+$/.test(token)) return null
    const id = Number(token)
    if (!Number.isSafeInteger(id) || id <= 0) return null
    ids.push(id)
  }
  return [...new Set(ids)]
}
