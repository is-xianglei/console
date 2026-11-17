import { describe, expect, it } from 'vitest'
import type { ToolResponse } from '@/interfaces/tool/model'
import { getAgentToolItems } from './agent-tools'

const tool: ToolResponse = {
  id: 1,
  tool_key: 'read',
  name: '读取',
  description: '',
  tool_type: 'builtin',
  runtime_name: 'Read',
  bindable_profiles: ['lead', 'user_agent'],
  is_system: true,
  is_enabled: true,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
}

describe('用户 Agent 工具选择', () => {
  it('只允许启用且服务端允许 user_agent 绑定的工具新增绑定', () => {
    expect(getAgentToolItems([tool], [])[0]).toMatchObject({ disabled: false, restricted: false })
    expect(getAgentToolItems([{ ...tool, bindable_profiles: ['lead'] }], [])[0])
      .toMatchObject({ disabled: true, restricted: true })
    expect(getAgentToolItems([{ ...tool, is_enabled: false }], [])[0])
      .toMatchObject({ disabled: true, inactive: true })
  })

  it('已有的停用或受限工具仍可取消，取消后不可重新加入', () => {
    const legacy = { ...tool, is_enabled: false, bindable_profiles: ['lead'] }
    expect(getAgentToolItems([legacy], [tool.id])[0])
      .toMatchObject({ disabled: false, restricted: true, inactive: true })
    expect(getAgentToolItems([legacy], [])[0]?.disabled).toBe(true)
  })

  it('权限由服务端元数据决定，不维护运行时工具名称白名单', () => {
    const custom = { ...tool, runtime_name: 'custom_read' }
    expect(getAgentToolItems([custom], [])[0]?.disabled).toBe(false)
    expect(getAgentToolItems([{ ...tool, bindable_profiles: [] }], [])[0]?.disabled).toBe(true)
  })

  it('权限元数据缺失时默认不允许新增绑定', () => {
    const missingMetadata = { ...tool, bindable_profiles: undefined } as unknown as ToolResponse
    expect(getAgentToolItems([missingMetadata], [])[0]?.disabled).toBe(true)
  })
})
