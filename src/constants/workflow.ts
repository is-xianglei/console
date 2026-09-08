import type { WorkflowMode } from '@/interfaces/workflow/api'

/** 编排模式选项；文案与后端 GET /workflows/modes 的静态元数据保持一致。 */
export const WORKFLOW_MODE_OPTIONS: Array<{
  value: WorkflowMode
  label: string
  hint: string
  icon: string
}> = [
  { value: 'sequential', label: '顺序执行', hint: '成员按排列顺序依次接力，前一个的输出作为后一个的输入。', icon: 'list-ordered' },
  { value: 'parallel', label: '并行执行', hint: '全部成员同时处理同一任务，最后由编排者汇总各自结果。', icon: 'columns-2' },
  { value: 'llm_routing', label: '智能路由', hint: '由模型根据成员描述选出最合适的一个成员来处理。', icon: 'split' },
]

/** 模式中文标签映射，供列表、详情与聊天页展示。 */
export const WORKFLOW_MODE_LABEL: Record<WorkflowMode, string> = {
  sequential: '顺序执行',
  parallel: '并行执行',
  llm_routing: '智能路由',
}

/** 并行与智能路由至少需要 2 个成员，顺序执行允许 1 个；与后端校验规则一致。 */
export function minWorkflowMembers(mode: WorkflowMode): number {
  return mode === 'sequential' ? 1 : 2
}
