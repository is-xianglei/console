import type { ApiResponse } from '../interfaces/common/api'

/** 后端基址前缀。开发期由 vite.config.ts 的 /api 代理转发到 :8000;
 *  生产期同源部署也走 /api。需要改基址时只动这里。 */
const BASE = '/api'

/** API 调用异常:携带后端 ErrorBody 的 code/message */
export class ApiError extends Error {
  code: string
  status: number
  constructor(message: string, code: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

/**
 * 发起请求并解包 ApiResponse 信封:
 * - HTTP 非 2xx → 抛 ApiError
 * - 信封 error 非空 → 抛 ApiError
 * - 否则返回 data(T)
 */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // FormData(文件上传)不能手动设 Content-Type:需让浏览器自动带 multipart boundary。
  // 其余请求默认 JSON。调用方显式传入的 headers 始终优先。
  const isForm = init?.body instanceof FormData
  const baseHeaders: Record<string, string> = isForm ? {} : { 'Content-Type': 'application/json' }

  // 从 localStorage 获取 Token 并自动添加到请求头
  const token = localStorage.getItem('auth_token')
  if (token) {
    baseHeaders['Authorization'] = `Bearer ${token}`
  }

  let resp: Response
  try {
    resp = await fetch(BASE + path, {
      ...init,
      headers: { ...baseHeaders, ...(init?.headers ?? {}) },
    })
  } catch (e) {
    throw new ApiError(`网络请求失败: ${(e as Error).message}`, 'NETWORK_ERROR', 0)
  }

  let body: ApiResponse<T>
  try {
    body = (await resp.json()) as ApiResponse<T>
  } catch {
    // 非 JSON 响应
    if (!resp.ok) throw new ApiError(`HTTP ${resp.status}`, 'HTTP_ERROR', resp.status)
    throw new ApiError('响应不是合法 JSON', 'PARSE_ERROR', resp.status)
  }

  if (!resp.ok || body.error) {
    const code = body.error?.code ?? 'HTTP_ERROR'
    const msg = body.error?.message ?? `HTTP ${resp.status}`
    throw new ApiError(msg, code, resp.status)
  }

  return body.data as T
}

/**
 * 认证专用请求函数:直接返回响应体,不解包 ApiResponse 信封
 * 用于 /auth/* 接口,这些接口直接返回数据而不包裹在信封中
 */
export async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const baseHeaders: Record<string, string> = { 'Content-Type': 'application/json' }

  // 从 localStorage 获取 Token 并自动添加到请求头
  const token = localStorage.getItem('auth_token')
  if (token) {
    baseHeaders['Authorization'] = `Bearer ${token}`
  }

  let resp: Response
  try {
    resp = await fetch(BASE + path, {
      ...init,
      headers: { ...baseHeaders, ...(init?.headers ?? {}) },
    })
  } catch (e) {
    throw new ApiError(`网络请求失败: ${(e as Error).message}`, 'NETWORK_ERROR', 0)
  }

  let body: T
  try {
    body = (await resp.json()) as T
  } catch {
    if (!resp.ok) throw new ApiError(`HTTP ${resp.status}`, 'HTTP_ERROR', resp.status)
    throw new ApiError('响应不是合法 JSON', 'PARSE_ERROR', resp.status)
  }

  if (!resp.ok) {
    throw new ApiError(`HTTP ${resp.status}`, 'HTTP_ERROR', resp.status)
  }

  return body
}
