export type AgentLifecycle = 'draft' | 'review' | 'published' | 'disabled'
export type AgentHealth = 'nominal' | 'warning' | 'idle'
export type AgentVisibility = 'workspace' | 'team' | 'private'
export type ToolPermission = 'allow' | 'ask' | 'deny'
export type ModelPreset = 'precise' | 'balanced' | 'creative'

export interface AgentModelConfig {
  primaryModelId: string
  fallbackModelId: string
  preset: ModelPreset
  temperature: number
  maxOutputTokens: number
}

export interface AgentSkillBinding {
  skillId: string
  version: string
}

export interface AgentMcpBinding {
  serverId: string
  toolIds: string[]
}

export interface AgentToolBinding {
  toolId: string
  permission: ToolPermission
}

export interface AgentConfig {
  id: string
  name: string
  slug: string
  description: string
  owner: string
  visibility: AgentVisibility
  tags: string[]
  lifecycle: AgentLifecycle
  health: AgentHealth
  publishedVersion: string | null
  draftVersion: string
  systemPrompt: string
  welcomeMessage: string
  model: AgentModelConfig
  skills: AgentSkillBinding[]
  mcpServers: AgentMcpBinding[]
  tools: AgentToolBinding[]
  highRiskApproval: boolean
  approvalGroup: string
  timeoutSeconds: number
  maxSteps: number
  maxToolCalls: number
  dailyTokenBudget: number
  successRate: number | null
  lastRun: string
  updatedAt: string
}

export interface ModelOption {
  id: string
  name: string
  provider: string
  context: string
  location: string
  latency: string
  cost: string
  healthy: boolean
}

export interface SkillOption {
  id: string
  name: string
  version: string
  description: string
  requiredToolIds: string[]
  verified: boolean
}

export interface ToolOption {
  id: string
  name: string
  description: string
  risk: 'low' | 'medium' | 'high'
  source: 'builtin' | 'mcp'
}

export interface McpServerOption {
  id: string
  name: string
  description: string
  transport: string
  auth: string
  healthy: boolean
  tools: ToolOption[]
}

export interface AgentValidationIssue {
  section: 'identity' | 'prompt' | 'model' | 'capabilities' | 'policy'
  message: string
}
