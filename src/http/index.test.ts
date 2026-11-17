import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, authErrorMessage, authRequest, request, requestBlob, withRetry } from './index'

// ===== localStorage mock：Node 环境无 localStorage =====
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem(key: string) {
    return this.store[key] ?? null
  },
  setItem(key: string, value: string) {
    this.store[key] = value
  },
  removeItem(key: string) {
    delete this.store[key]
  },
  clear() {
    this.store = {}
  },
}

function makeResponse(data: unknown, status = 200, contentType = 'application/json'): Response {
  return new Response(
    contentType.includes('json') ? JSON.stringify(data) : String(data),
    { status, headers: { 'content-type': contentType } },
  )
}

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageMock)
  localStorageMock.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('authRequest 错误解析', () => {
  it('body 为 JSON 且带 message 时，ApiError 取后端 message', async () => {
    stubFetch(() => makeResponse({ message: '验证码已过期', code: 'CAPTCHA_EXPIRED' }, 400))
    await expect(authRequest('/auth/login', { method: 'POST' })).rejects.toMatchObject({
      message: '验证码已过期',
      code: 'CAPTCHA_EXPIRED',
      status: 400,
    })
  })

  it('body 为 JSON 且带 detail 时(如 FastAPI 默认校验错误)，ApiError 取 detail', async () => {
    stubFetch(() => makeResponse({ detail: '密码错误' }, 401))
    await expect(authRequest('/auth/login', { method: 'POST' })).rejects.toMatchObject({
      message: '密码错误',
      status: 401,
    })
  })

  it('body 为 JSON 且带 code 时，ApiError 透传 code', async () => {
    stubFetch(() => makeResponse({ detail: '请求受限', code: 'RATE_LIMITED' }, 429))
    await expect(authRequest('/auth/login', { method: 'POST' })).rejects.toMatchObject({
      message: '请求受限',
      code: 'RATE_LIMITED',
      status: 429,
    })
  })

  it('统一 error envelope 中的 message/code/details 优先于旧顶层格式', async () => {
    stubFetch(() => makeResponse({
      data: null,
      error: { code: 'BAD_CREDENTIALS', message: '用户名或密码错误', details: { field: 'password' } },
      request_id: 'req-auth-1',
    }, 401))

    await expect(authRequest('/auth/login', { method: 'POST' })).rejects.toMatchObject({
      message: '用户名或密码错误',
      code: 'BAD_CREDENTIALS',
      status: 401,
      details: { field: 'password' },
    })
  })

  it('原生 fetch TypeError 时，允许重试的认证请求会重试一次', async () => {
    let attempts = 0
    stubFetch(() => {
      attempts += 1
      if (attempts === 1) return Promise.reject(new TypeError('Failed to fetch'))
      return makeResponse({ access_token: 'token-2', refresh_token: 'refresh-2' })
    })

    await expect(authRequest('/auth/login', { method: 'POST', retry: true })).resolves.toEqual({
      access_token: 'token-2',
      refresh_token: 'refresh-2',
    })
    expect(attempts).toBe(2)
  })

  it('body 非 JSON(HTML 错误页)时回落 HTTP status，不抛解析异常', async () => {
    stubFetch(() => makeResponse('<html>Bad Gateway</html>', 502, 'text/html'))
    await expect(authRequest('/auth/login', { method: 'POST' })).rejects.toMatchObject({
      message: 'HTTP 502',
      code: 'HTTP_ERROR',
      status: 502,
    })
  })
})

describe('request 信封解析', () => {
  it('JSON 信封 error 非空时抛 ApiError(message/code)', async () => {
    stubFetch(() => makeResponse({ data: null, error: { code: 'E_AGENT', message: '智能体不存在' } }, 404))
    await expect(request('/agents/99')).rejects.toMatchObject({
      message: '智能体不存在',
      code: 'E_AGENT',
      status: 404,
    })
  })

  it('原生 fetch TypeError 时重试 GET，并返回第二次响应', async () => {
    let attempts = 0
    stubFetch(() => {
      attempts += 1
      if (attempts === 1) return Promise.reject(new TypeError('Failed to fetch'))
      return makeResponse({ data: { ok: true }, error: null, request_id: 'req-1' })
    })

    await expect(request<{ ok: boolean }>('/agents')).resolves.toEqual({ ok: true })
    expect(attempts).toBe(2)
  })

  it('非 JSON 错误响应回落 HTTP status', async () => {
    stubFetch(() => makeResponse('<html>Not Found</html>', 404, 'text/html'))
    await expect(request('/agents/99')).rejects.toMatchObject({
      message: 'HTTP 404',
      status: 404,
    })
  })
})

describe('withRetry', () => {
  it('status 0(网络错误)重试一次', async () => {
    let attempts = 0
    const fn = vi.fn(async () => {
      attempts += 1
      if (attempts === 1) throw new ApiError('网络请求失败: fetch failed', 'NETWORK_ERROR', 0)
      return 'ok'
    })
    const result = await withRetry(fn, { retries: 1, when: (e) => e instanceof ApiError && e.status === 0 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('status 0 重试一次后仍失败则抛出最后一次错误', async () => {
    const fn = vi.fn(async () => {
      throw new ApiError('网络请求失败: fetch failed', 'NETWORK_ERROR', 0)
    })
    await expect(withRetry(fn, { retries: 1 })).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
    })
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('默认条件识别原生 fetch TypeError，且不重试 AbortError', async () => {
    const network = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(withRetry(network, { retries: 1, delay: 0 })).rejects.toThrow('Failed to fetch')
    expect(network).toHaveBeenCalledTimes(2)

    const aborted = vi.fn(async () => {
      const error = new Error('请求已取消')
      error.name = 'AbortError'
      throw error
    })
    await expect(withRetry(aborted, { retries: 1, delay: 0 })).rejects.toMatchObject({ name: 'AbortError' })
    expect(aborted).toHaveBeenCalledTimes(1)
  })

  it('401 不重试(服务端响应非网络错误)', async () => {
    const fn = vi.fn(async () => {
      throw new ApiError('HTTP 401', 'HTTP_ERROR', 401)
    })
    await expect(withRetry(fn, { retries: 1, when: (e) => e instanceof ApiError && e.status === 0 }))
      .rejects.toMatchObject({ status: 401 })
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('requestBlob', () => {
  it('原生 fetch TypeError 时重试并返回二进制响应', async () => {
    let attempts = 0
    stubFetch(() => {
      attempts += 1
      if (attempts === 1) return Promise.reject(new TypeError('Failed to fetch'))
      return makeResponse('zip-content', 200, 'application/zip')
    })

    const blob = await requestBlob('/skills/1/export')
    await expect(blob.text()).resolves.toBe('zip-content')
    expect(attempts).toBe(2)
  })

  it('失败时解析统一 error envelope', async () => {
    stubFetch(() => makeResponse({
      data: null,
      error: { code: 'EXPORT_FAILED', message: '导出失败', details: { skill_id: 1 } },
      request_id: 'req-2',
    }, 500))

    await expect(requestBlob('/skills/1/export')).rejects.toMatchObject({
      message: '导出失败',
      code: 'EXPORT_FAILED',
      status: 500,
      details: { skill_id: 1 },
    })
  })
})

describe('authErrorMessage 分场景文案', () => {
  it('401 / 429 / status 0 / 其它后端 message', () => {
    expect(authErrorMessage(new ApiError('HTTP 401', 'HTTP_ERROR', 401), 'login 失败')).toBe('邮箱或密码错误')
    expect(authErrorMessage(new ApiError('HTTP 429', 'HTTP_ERROR', 429), 'login 失败')).toBe('请求过于频繁，请稍后再试')
    expect(authErrorMessage(new ApiError('网络请求失败: fetch failed', 'NETWORK_ERROR', 0), 'login 失败')).toBe('网络连接失败，请检查网络')
    expect(authErrorMessage(new ApiError('密码错误', 'BAD_PASSWORD', 400), 'login 失败')).toBe('密码错误')
    expect(authErrorMessage(new Error('unknown'), 'login 失败')).toBe('login 失败')
  })
})
