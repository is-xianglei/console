import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchEventSource, type FetchEventSourceInit } from '@microsoft/fetch-event-source'
import { respondInteraction, sendMessage, SseOpenError, subscribeTurn } from './console'

vi.mock('@microsoft/fetch-event-source', () => ({ fetchEventSource: vi.fn() }))

function streamOptions(): FetchEventSourceInit {
  const options = vi.mocked(fetchEventSource).mock.calls.at(-1)?.[1]
  if (!options) throw new Error('事件流尚未建立')
  return options
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', { getItem: () => 'test-token' })
  vi.mocked(fetchEventSource).mockResolvedValue(undefined)
})

describe('控制台 SSE HTTP 契约', () => {
  it('发送消息只携带 AgentOS 支持的字段并允许主动断开连接', () => {
    const abort = sendMessage({ content: '接口验证', agent_id: 30 }, { onEvent: vi.fn() })
    expect(fetchEventSource).toHaveBeenCalledWith('/api/sessions/messages', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
      body: JSON.stringify({ content: '接口验证', agent_id: 30 }),
      openWhenHidden: true,
    }))
    const signal = streamOptions().signal
    expect(signal?.aborted).toBe(false)
    abort()
    expect(signal?.aborted).toBe(true)
  })

  it('订阅使用 GET 和编码后的 turn ID，不会重新发送用户消息', () => {
    subscribeTurn(42, 'turn/id', { onEvent: vi.fn() })
    expect(fetchEventSource).toHaveBeenCalledWith(
      '/api/sessions/42/turns/turn%2Fid/subscription',
      expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer test-token' } }),
    )
    expect(streamOptions().body).toBeUndefined()
  })

  it('人工交互的恢复流使用 resolve 路由及原始响应载荷', () => {
    const payload = {
      kind: 'user_question' as const,
      response_payload: { decision: 'submit' as const, answers: { choice: '确认' } },
    }
    respondInteraction(42, 'request/id', payload, { onEvent: vi.fn() })
    expect(fetchEventSource).toHaveBeenCalledWith(
      '/api/interactions/sessions/42/requests/request%2Fid/resolve',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) }),
    )
  })

  it('正常 SSE 响应通过建流校验', async () => {
    sendMessage({ content: '接口验证' }, { onEvent: vi.fn() })
    await expect(streamOptions().onopen?.(new Response('', {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
    }))).resolves.toBeUndefined()
  })

  it('发送被拒时保留统一错误信封的中文原因、状态和详情', async () => {
    sendMessage({ content: '接口验证' }, { onEvent: vi.fn() })
    await expect(streamOptions().onopen?.(new Response(JSON.stringify({
      data: null,
      error: { code: 'AGENT_DISABLED', message: '智能体已停用', details: { agent_id: 6 } },
      request_id: 'test-request',
    }), { status: 403, headers: { 'Content-Type': 'application/json' } }))).rejects.toMatchObject({
      message: '智能体已停用', code: 'AGENT_DISABLED', status: 403, details: { agent_id: 6 },
    })
  })

  it('订阅被拒也产生可识别的 SseOpenError', async () => {
    subscribeTurn(42, 'turn', { onEvent: vi.fn() })
    await expect(streamOptions().onopen?.(new Response(JSON.stringify({
      detail: '轮次不存在',
    }), { status: 404 }))).rejects.toBeInstanceOf(SseOpenError)
  })

  it('网关返回非 JSON 错误页时保留 HTTP 状态', async () => {
    sendMessage({ content: '接口验证' }, { onEvent: vi.fn() })
    await expect(streamOptions().onopen?.(new Response('<html>Bad Gateway</html>', {
      status: 502, headers: { 'Content-Type': 'text/html' },
    }))).rejects.toMatchObject({ message: 'HTTP 502', status: 502 })
  })

  it('onerror 上报一次并抛出原错误，禁止库自动重发 POST', () => {
    const onError = vi.fn()
    sendMessage({ content: '接口验证' }, { onEvent: vi.fn(), onError })
    const error = new SseOpenError('没有权限', 'FORBIDDEN', 403)
    expect(() => streamOptions().onerror?.(error)).toThrow(error)
    expect(onError).toHaveBeenCalledExactlyOnceWith(error)
  })
})
