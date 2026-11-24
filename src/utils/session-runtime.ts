import type { RunStatus, SubAgent } from '../interfaces/console/model'
import type { SubAgentRunResponse } from '../interfaces/console/runtime'

/**
 * 把 REST 的子运行记录还原成右栏面板：
 * - id 直接用 sub_run_id（不要自己拼 run-${id}），标题用 agent_name；
 * - parentId / turnId 原样带上，按 (turn_id, parent_id) 挂回父卡；
 *   parent_id 为 null 的历史记录只按会话列出，不猜父卡。
 */
export function mapSubAgentRuns(runs: SubAgentRunResponse[], sessionId: number): SubAgent[] {
  // interrupted：执行被打断，续跑时同一次 Agent 调用会另起一条新记录接着跑。
  const statuses: Record<string, RunStatus> = { running: 'run', succeeded: 'done', failed: 'error', interrupted: 'interrupted' }
  return runs.filter((run) => run.session_id === sessionId).map((run) => {
    const status = statuses[run.status] ?? 'queued'
    const agent: SubAgent = {
      id: run.sub_run_id,
      pid: run.sub_run_id,
      name: run.agent_name,
      icon: 'bot',
      status,
      progress: status === 'done' ? 100 : 0,
      stream: [],
      agentId: run.agent_id ?? null,
      parentId: run.parent_id,
      turnId: run.turn_id,
      // 过程不落库，刷新后卡片描述用 prompt，正文用 report。
      task: run.prompt || null,
    }
    if (run.report) agent.stream.push({ kind: 'answer', text: run.report, streaming: false })
    if (run.error_message) {
      agent.stream.push({ kind: 'tool', fn: 'ERROR', body: run.error_message, done: true, is_error: true })
    }
    return agent
  })
}

/** REST 只补缺失运行；已收到的实时推理、工具调用与回答不能被报告摘要覆盖。 */
export function mergeSubAgentRuns(current: SubAgent[], restored: SubAgent[]): SubAgent[] {
  const ids = new Set(current.map((agent) => agent.id))
  return [...current, ...restored.filter((agent) => !ids.has(agent.id))]
}

/**
 * 按 (turn_id, parent_id) 把子运行挂回父卡：
 * Agent 工具挂主线那次 tool_use（parent_id 即 tool.id），Workflow 成员挂成员卡（parent_id 即 member:{agent_id}）。
 * tool_use ID 只在一个回合内唯一，不能只按 parent_id 匹配；parent_id 为 null 的历史记录挂不回卡片。
 * 同一父卡下可能有多条（续跑重跑），按出现顺序全部返回，最后一条是当前的。
 */
export function subRunsForCard(
  agents: SubAgent[],
  turnId: string | null | undefined,
  parentId: string | null | undefined,
): SubAgent[] {
  if (!turnId || !parentId) return []
  return agents.filter((agent) => agent.turnId === turnId && agent.parentId === parentId)
}
