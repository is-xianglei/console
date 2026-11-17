import type { SubAgentRunResponse } from '../interfaces/console/runtime'
import { request } from './index'

/** 运行记录属于会话，与构建区的静态 Team 配置不同。 */
export function getSessionSubAgentRuns(sessionId: number | string): Promise<SubAgentRunResponse[]> {
  const query = new URLSearchParams({ session_id: String(sessionId) })
  return request<SubAgentRunResponse[]>('/teams/subagent-runs?' + query)
}
