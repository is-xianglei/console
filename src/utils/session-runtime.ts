import type { RunStatus, SubAgent } from '../interfaces/console/model'
import type { SubAgentRunResponse } from '../interfaces/console/runtime'

/** 与后端 subagent_actor 的 run_id 契约保持一致，同名多次运行仍分别展示。 */
export function mapSubAgentRuns(runs: SubAgentRunResponse[], sessionId: number): SubAgent[] {
  const statuses: Record<string, RunStatus> = { running: 'run', succeeded: 'done', failed: 'error' }
  return runs.filter((run) => run.session_id === sessionId).map((run) => {
    const status = statuses[run.status] ?? 'queued'
    const agent: SubAgent = {
      id: `run-${run.id}`,
      pid: `run-${run.id}`,
      name: run.member_name,
      icon: 'bot',
      status,
      progress: status === 'done' ? 100 : 0,
      stream: [],
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
