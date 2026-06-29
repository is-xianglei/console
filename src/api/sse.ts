import { fetchEventSource } from '@microsoft/fetch-event-source'
import type { SseEvent } from './types'

const BASE = '/api'

export interface SseHandlers {
  onEvent: (ev: SseEvent) => void
  onError?: (err: Error) => void
  onDone?: () => void
}

/** 致命错误:抛出后 fetchEventSource 停止,不再自动重试 */
class FatalError extends Error {}

/**
 * 以 POST 发起一个 SSE 流并逐事件回调,基于官方库 @microsoft/fetch-event-source。
 * 返回一个 abort 函数,可中途取消。
 *
 * 说明:LLM 流不可重发,因此这里把所有错误都当致命错误抛出以禁用自动重试;
 * openWhenHidden 设为 true,避免切到后台标签页时连接被库自动关闭。
 */
export function streamPost(path: string, body: unknown, handlers: SseHandlers): () => void {
  const ctrl = new AbortController()

  fetchEventSource(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: ctrl.signal,
    openWhenHidden: true,

    async onopen(resp) {
      const ct = resp.headers.get('content-type') ?? ''
      if (resp.ok && ct.includes('text/event-stream')) return
      throw new FatalError(`SSE 打开失败: HTTP ${resp.status}`)
    },

    onmessage(msg) {
      if (!msg.data || msg.data === '[DONE]') return
      try {
        handlers.onEvent(JSON.parse(msg.data) as SseEvent)
      } catch {
        // 跳过无法解析的帧(心跳/注释等)
      }
    },

    onclose() {
      handlers.onDone?.()
    },

    onerror(err) {
      // 所有错误视为致命:回调上报并抛出以停止库的自动重试
      handlers.onError?.(err as Error)
      throw err
    },
  }).catch(() => {
    // onerror 抛出后 fetchEventSource 的 promise 会 reject,这里吞掉(已通过 onError 上报)
  })

  return () => ctrl.abort()
}
