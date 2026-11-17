/** AgentOS 持久化的会话子代理运行记录。列表不包含完整推理或工具历史。 */
export interface SubAgentRunResponse {
  id: number
  session_id: number
  member_name: string
  status: string
  prompt: string
  report: string | null
  error_message: string | null
  started_at: string
  finished_at: string | null
}
