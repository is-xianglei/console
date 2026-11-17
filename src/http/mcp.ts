import type {
  McpOAuthAuthorizeResponse,
  McpOAuthCompleteRequest,
  McpOAuthRevokeResponse,
  McpProbeResponse,
  McpServerCreateRequest,
  McpServerCreateResponse,
  McpServerDeleteResult,
  McpServerResponse,
  McpServerUpdateRequest,
  McpToolResponse,
} from '@/interfaces/mcp/api'
import { request } from './index'

const serverPath = (serverId: number) => `/mcp/servers/${serverId}`

/** 本工作区的共享 server 和本人的私有 server；普通成员只看到已启用的共享 server。 */
export function getMcpServerList(): Promise<McpServerResponse[]> {
  return request<McpServerResponse[]>('/mcp/servers')
}

export function getMcpServerDetail(serverId: number): Promise<McpServerResponse> {
  return request<McpServerResponse>(serverPath(serverId))
}

/** 新建时后端先探测再落库，探测失败直接报错。 */
export function createMcpServer(payload: McpServerCreateRequest): Promise<McpServerCreateResponse> {
  return request<McpServerCreateResponse>('/mcp/servers', { method: 'POST', body: JSON.stringify(payload) })
}

/** 地址或认证变化时后端重新探测。 */
export function updateMcpServer(serverId: number, payload: McpServerUpdateRequest): Promise<McpServerResponse> {
  return request<McpServerResponse>(serverPath(serverId), { method: 'PUT', body: JSON.stringify(payload) })
}

/** 软删，同时解除 Agent 绑定。 */
export function deleteMcpServer(serverId: number): Promise<McpServerDeleteResult> {
  return request<McpServerDeleteResult>(serverPath(serverId), { method: 'DELETE' })
}

export function probeMcpServer(serverId: number): Promise<McpProbeResponse> {
  return request<McpProbeResponse>(`${serverPath(serverId)}/probe`, { method: 'POST' })
}

/** 读最近一次探测的工具快照。 */
export function getMcpServerToolList(serverId: number): Promise<McpToolResponse[]> {
  return request<McpToolResponse[]>(`${serverPath(serverId)}/tools`)
}

/** 授权前半程：拿到授权地址后由前端跳转。 */
export function authorizeMcpServer(serverId: number): Promise<McpOAuthAuthorizeResponse> {
  return request<McpOAuthAuthorizeResponse>(`${serverPath(serverId)}/oauth/authorize`, { method: 'POST' })
}

/** 授权后半程：state 只能用一次，且必须是当前登录用户发起的。 */
export function completeMcpOAuth(payload: McpOAuthCompleteRequest): Promise<McpServerResponse> {
  return request<McpServerResponse>('/mcp/oauth/complete', { method: 'POST', body: JSON.stringify(payload) })
}

export function revokeMcpOAuth(serverId: number): Promise<McpOAuthRevokeResponse> {
  return request<McpOAuthRevokeResponse>(`${serverPath(serverId)}/oauth`, { method: 'DELETE' })
}
