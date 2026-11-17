import type { ApiResponse } from '../interfaces/common/api'

/** 后端基址前缀。开发期由 vite.config.ts 的 /api 代理转发到 :8000;
 *  生产期同源部署也走 /api。需要改基址时只动这里。 */
const BASE = '/api'

/** API 调用异常:携带后端 ErrorBody 的 code/message/details */
export class ApiError extends Error {
  code: string
  status: number
  /** 后端 error.details:409 冲突字段、422 的 errors 数组等。 */
  details: Record<string, unknown>
  constructor(message: string, code: string, status: number, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

/** 网络抖动临时重试的等待(≤1s)。 */
const RETRY_DELAY = 300

/** 请求配置中用于标注是否允许网络重试的私有字段。 */
interface RetryOptions {
  /** 网络错误(status 0)时是否重试一次。仅幂等请求(GET、登录、刷新 token)允许。 */
  retry?: boolean
}

type ConsoleRequestInit = RequestInit & RetryOptions

const BASE_METHOD = 'GET'

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/** fetch 原生网络失败通常是 TypeError，不能等外层包装成 ApiError 后才判断重试。 */
function isRetryableNetworkError(error: unknown): boolean {
  if (isAbortError(error)) return false
  return (error instanceof ApiError && error.status === 0) || error instanceof TypeError
}

/**
 * 网络抖动临时重试:仅对 `when` 判定的错误重试一次(默认 status 0 网络错误)。
 * 401/403 等服务端响应不会进入 `when`(其 status 非 0),故自动不重试。
 * 只用于无副作用的请求(读取、登录、刷新 token),避免重复提交。
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    retries?: number
    when?: (error: unknown) => boolean
    delay?: number
  } = {},
): Promise<T> {
  const retries = opts.retries ?? 1
  const when = opts.when ?? isRetryableNetworkError
  const delay = opts.delay ?? RETRY_DELAY
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt >= retries || !when(error)) throw error
      if (delay > 0 && attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }
  throw lastError
}

/** 网络请求错误对应的可行动文案映射(登录/注册等认证失败用)。 */
export function authErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  switch (error.status) {
    case 401:
      return '邮箱或密码错误'
    case 429:
      return '请求过于频繁，请稍后再试'
    case 0:
      return '网络连接失败，请检查网络'
    case 403:
      return '没有权限执行此操作'
    default:
      return error.message || fallback
  }
}

/** 发起请求并解包 ApiResponse 信封:
 * - HTTP 非 2xx → 抛 ApiError
 * - 信封 error 非空 → 抛 ApiError
 * - 否则返回 data(T)
 *
 * 网络错误(status 0)时对无副作用的 GET 请求重试一次。
 */
export async function request<T>(path: string, init?: ConsoleRequestInit): Promise<T> {
  // FormData(文件上传)不能手动设 Content-Type:需让浏览器自动带 multipart boundary。
  // 其余请求默认 JSON。调用方显式传入的 headers 始终优先。
  const isForm = init?.body instanceof FormData
  const baseHeaders: Record<string, string> = isForm ? {} : { 'Content-Type': 'application/json' }

  // 从 localStorage 获取 Token 并自动添加到请求头
  const token = localStorage.getItem('auth_token')
  if (token) {
    baseHeaders['Authorization'] = `Bearer ${token}`
  }

  // 仅幂等的 GET(未显式指定 method)允许网络重试;POST/PATCH/DELETE 不套用,避免重复提交。
  const method = init?.method ?? BASE_METHOD
  const allowRetry = init?.retry === true || (method === BASE_METHOD && init?.retry !== false)

  const fetchFn = () => fetch(BASE + path, {
    ...init,
    headers: { ...baseHeaders, ...(init?.headers ?? {}) },
  })

  let resp: Response
  try {
    resp = allowRetry
      ? await withRetry(() => fetchFn(), {
          retries: 1,
          when: isRetryableNetworkError,
        })
      : await fetchFn()
  } catch (e) {
    throw new ApiError(`网络请求失败: ${(e as Error).message}`, 'NETWORK_ERROR', 0)
  }

  let body: ApiResponse<T>
  try {
    body = (await resp.json()) as ApiResponse<T>
  } catch {
    // 非 JSON 响应:不能解析异常覆盖原始状态码。
    if (!resp.ok) throw new ApiError(`HTTP ${resp.status}`, 'HTTP_ERROR', resp.status)
    throw new ApiError('响应不是合法 JSON', 'PARSE_ERROR', resp.status)
  }

  if (!resp.ok || body.error) throw errorFromBody(body, resp.status)

  return body.data as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** 统一解析后端 {data,error,request_id}，并兼容认证接口旧的顶层 message/detail/code。 */
export function errorFromBody(body: unknown, status: number): ApiError {
  if (isRecord(body) && isRecord(body.error)) return envelopeError(body, status)

  const message = isRecord(body) ? body.message ?? body.detail : undefined
  const code = isRecord(body) ? body.code : undefined
  const details = isRecord(body) && isRecord(body.details) ? body.details : {}
  return new ApiError(
    typeof message === 'string' && message.trim() ? message : `HTTP ${status}`,
    typeof code === 'string' && code ? code : 'HTTP_ERROR',
    status,
    details,
  )
}

/** 把统一外壳的 error 转成 ApiError;后端运行时不返回 code,缺省记为 HTTP_ERROR。 */
function envelopeError(body: Record<string, unknown>, status: number): ApiError {
  const error = isRecord(body.error) ? body.error : {}
  const code = typeof error.code === 'string' && error.code ? error.code : 'HTTP_ERROR'
  const msg = typeof error.message === 'string' && error.message ? error.message : `HTTP ${status}`
  const details = isRecord(error.details) ? error.details : {}
  return new ApiError(msg, code, status, details)
}

/**
 * 下载二进制文件(如 skill 导出 zip):成功返回 Blob,不解包外壳。
 * 失败时响应是统一外壳的 JSON,解析后抛 ApiError;只走 Authorization 头,不在 query 里带 token。
 */
export async function requestBlob(path: string, init?: ConsoleRequestInit): Promise<Blob> {
  const headers: Record<string, string> = {}
  const token = localStorage.getItem('auth_token')
  if (token) headers['Authorization'] = `Bearer ${token}`

  const method = init?.method ?? BASE_METHOD
  const allowRetry = init?.retry === true || (method === BASE_METHOD && init?.retry !== false)
  const fetchFn = () => fetch(BASE + path, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
  })

  let resp: Response
  try {
    resp = allowRetry
      ? await withRetry(() => fetchFn(), {
          retries: 1,
          when: isRetryableNetworkError,
        })
      : await fetchFn()
  } catch (e) {
    throw new ApiError(`网络请求失败: ${(e as Error).message}`, 'NETWORK_ERROR', 0)
  }

  if (resp.ok) return resp.blob()

  let body: Partial<ApiResponse<unknown>> | null = null
  try {
    body = (await resp.json()) as ApiResponse<unknown>
  } catch {
    // 非 JSON 错误体:保留原始状态码。
  }
  throw errorFromBody(body, resp.status)
}

/**
 * 认证专用请求函数:直接返回响应体,不解包 ApiResponse 信封。
 * 用于 /auth/* 接口,这些接口直接返回数据而不包裹在信封中。
 *
 * 非 2xx 时优先解析 body 的 message/detail/code 建立 ApiError;
 * body 非 JSON(如 HTML 错误页)时回落到 `HTTP ${status}`,不让解析异常覆盖原始状态码。
 */
export async function authRequest<T>(path: string, init?: ConsoleRequestInit): Promise<T> {
  const baseHeaders: Record<string, string> = { 'Content-Type': 'application/json' }

  // 从 localStorage 获取 Token 并自动添加到请求头
  const token = localStorage.getItem('auth_token')
  if (token) {
    baseHeaders['Authorization'] = `Bearer ${token}`
  }

  const method = init?.method ?? BASE_METHOD
  const allowRetry = init?.retry === true || (method === BASE_METHOD && init?.retry !== false)

  const fetchFn = () => fetch(BASE + path, {
    ...init,
    headers: { ...baseHeaders, ...(init?.headers ?? {}) },
  })

  let resp: Response
  try {
    resp = allowRetry
      ? await withRetry(() => fetchFn(), {
          retries: 1,
          when: isRetryableNetworkError,
        })
      : await fetchFn()
  } catch (e) {
    throw new ApiError(`网络请求失败: ${(e as Error).message}`, 'NETWORK_ERROR', 0)
  }

  let body: T
  let parsed = true
  try {
    body = (await resp.json()) as T
  } catch {
    parsed = false
    body = {} as T
  }

  if (!resp.ok) {
    throw errorFromBody(parsed ? body : null, resp.status)
  }

  return body
}
