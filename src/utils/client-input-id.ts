/**
 * 客户端发言 ID：前端为每条发言生成，随 POST /api/sessions/messages 提交，
 * 后端在 input_queued、input_claimed、快照、排队发言和消息列表里回显，同时作幂等键。
 * 后端要求 1～64 个字母、数字、下划线或连字符，首字符不能是符号；UUID 满足。
 */

/** 生成 UUID v4。crypto.randomUUID 只在安全上下文（HTTPS、localhost）可用，局域网 HTTP 调试时用随机字节拼。 */
export function createClientInputId(): string {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID()
  const bytes = new Uint8Array(16)
  cryptoApi.getRandomValues(bytes)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** 去掉没传的位置（null），留下真正的客户端发言 ID。 */
export function presentClientInputIds(ids: ReadonlyArray<string | null | undefined> | null | undefined): string[] {
  return (ids ?? []).filter((id): id is string => typeof id === 'string' && id.length > 0)
}
