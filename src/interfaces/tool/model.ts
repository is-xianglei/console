/** 内置工具目录中的工具摘要。 */
export interface ToolResponse {
  id: number
  tool_key: string
  name: string
  description: string
  tool_type: string
  runtime_name: string
  is_system: boolean
  is_enabled: boolean
  created_at: string
  updated_at: string
}

/** 内置工具详情。 */
export interface ToolDetailResponse extends ToolResponse {
  input_schema: Record<string, unknown>
  implementation_config: Record<string, unknown>
}
