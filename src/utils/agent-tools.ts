import type { ToolResponse } from '@/interfaces/tool/model'

/** 由服务端策略决定新增绑定；遗留受限项仍可展示和取消。 */
export function getAgentToolItems(tools: ToolResponse[], selectedIds: number[]) {
  const selected = new Set(selectedIds)
  return tools.map((tool) => {
    const restricted = !tool.bindable_profiles?.includes('user_agent')
    return {
      label: tool.name,
      value: tool.id,
      disabled: (!tool.is_enabled || restricted) && !selected.has(tool.id),
      inactive: !tool.is_enabled,
      restricted,
      keywords: tool.tool_key,
    }
  })
}
