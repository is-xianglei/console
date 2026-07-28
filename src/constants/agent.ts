import type { AgentConfig, McpServerOption, ModelOption, SkillOption, ToolOption } from '@/interfaces/agent/model'

export const AGENT_OWNERS = ['AI 平台组', '设备工程部', '质量工程部', '计划运营部']
export const APPROVAL_GROUPS = ['安全治理组', '设备值班长', '质量平台主管', '生产经理']

export const MODEL_OPTIONS: ModelOption[] = [
  { id: 'MODEL-Q3F', name: 'Qwen3-32B-Factory', provider: '私有集群', context: '128K', location: '华东数据域', latency: '612 ms', cost: '¥0.018 / 1K', healthy: true },
  { id: 'MODEL-GPT5', name: 'GPT-5 Enterprise', provider: 'OpenAI', context: '256K', location: '新加坡区域', latency: '1.2 s', cost: '¥0.092 / 1K', healthy: true },
  { id: 'MODEL-DSR1', name: 'DeepSeek-R1-70B', provider: 'GPU Pool B', context: '64K', location: '华东数据域', latency: '2.8 s', cost: '¥0.031 / 1K', healthy: false },
]

export const BUILTIN_TOOLS: ToolOption[] = [
  { id: 'builtin.task-plan', name: '任务规划器', description: '拆分目标、维护步骤和执行状态。', risk: 'low', source: 'builtin' },
  { id: 'builtin.file-read', name: '文件读取', description: '读取当前工作区内授权文件。', risk: 'medium', source: 'builtin' },
  { id: 'builtin.code-sandbox', name: 'Python 沙箱', description: '在隔离环境中运行分析代码。', risk: 'high', source: 'builtin' },
]

export const MCP_SERVER_OPTIONS: McpServerOption[] = [
  {
    id: 'MCP-0001', name: 'factory-data-hub', description: 'MES、IoT 与设备主数据统一入口。', transport: 'SSE', auth: 'OAuth 2.0', healthy: true,
    tools: [
      { id: 'mcp.factory.asset-read', name: '读取设备主数据', description: '查询设备、产线和工位的只读信息。', risk: 'low', source: 'mcp' },
      { id: 'mcp.factory.timeseries-read', name: '读取时序数据', description: '按资产和时间窗口查询传感器数据。', risk: 'low', source: 'mcp' },
      { id: 'mcp.factory.parameter-write', name: '下发设备参数', description: '向受控设备写入运行参数。', risk: 'high', source: 'mcp' },
    ],
  },
  {
    id: 'MCP-0005', name: 'maintenance-cmms', description: '维修工单、故障编码与备件服务。', transport: 'HTTP', auth: 'API Key', healthy: true,
    tools: [
      { id: 'mcp.cmms.workorder-search', name: '检索维修工单', description: '查询历史工单和处置记录。', risk: 'low', source: 'mcp' },
      { id: 'mcp.cmms.workorder-create', name: '创建维修工单', description: '创建待审批的维修工单草稿。', risk: 'medium', source: 'mcp' },
      { id: 'mcp.cmms.workorder-close', name: '关闭维修工单', description: '更新工单状态并写入处置结果。', risk: 'high', source: 'mcp' },
    ],
  },
  {
    id: 'MCP-0009', name: 'vision-gateway', description: '视觉样本与检测推理网关。', transport: 'STDIO', auth: 'mTLS', healthy: false,
    tools: [
      { id: 'mcp.vision.sample-search', name: '检索视觉样本', description: '按批次和缺陷类型查询样本。', risk: 'low', source: 'mcp' },
      { id: 'mcp.vision.batch-compare', name: '对比检测批次', description: '运行样本差异与根因分析。', risk: 'medium', source: 'mcp' },
      { id: 'mcp.vision.sample-export', name: '导出视觉样本', description: '将视觉样本导出到授权目标。', risk: 'high', source: 'mcp' },
    ],
  },
]

export const SKILL_OPTIONS: SkillOption[] = [
  { id: 'SKILL-0034', name: 'visual-inspection', version: '3.1.2', description: '处理视觉质检图像与检测批次上下文。', requiredToolIds: ['mcp.vision.sample-search', 'mcp.vision.batch-compare'], verified: true },
  { id: 'SKILL-0012', name: 'work-order-query', version: '2.6.0', description: '查询维修工单、故障记录和备件消耗。', requiredToolIds: ['mcp.cmms.workorder-search'], verified: true },
  { id: 'SKILL-0041', name: 'schedule-optimizer', version: '0.8.4', description: '运行多约束排产优化并返回可解释方案。', requiredToolIds: ['mcp.factory.asset-read'], verified: false },
]

export const AGENT_SEED: AgentConfig[] = [
  {
    id: 'AGT-0014', name: '设备诊断 Agent', slug: 'equipment-diagnosis', description: '分析设备信号与历史工单，输出可审核的维修建议。', owner: '设备工程部', visibility: 'workspace', tags: ['设备可靠性', '生产'], lifecycle: 'published', health: 'nominal', publishedVersion: '2.4.1', draftVersion: '2.5.0-draft',
    systemPrompt: '你是一名设备可靠性工程师。结合设备时序、工单和同型号基线判断故障根因。所有建议必须给出证据、置信度和风险等级；涉及停机或参数写入时必须请求人工审批。', welcomeMessage: '请选择设备或输入资产编号，我会检查近期信号和维修记录。',
    model: { primaryModelId: 'MODEL-Q3F', fallbackModelId: 'MODEL-GPT5', preset: 'precise', temperature: 0.2, maxOutputTokens: 4096 },
    skills: [{ skillId: 'SKILL-0012', version: '2.6.0' }], mcpServers: [{ serverId: 'MCP-0001', toolIds: ['mcp.factory.asset-read', 'mcp.factory.timeseries-read'] }, { serverId: 'MCP-0005', toolIds: ['mcp.cmms.workorder-search', 'mcp.cmms.workorder-create'] }],
    tools: [{ toolId: 'builtin.task-plan', permission: 'allow' }, { toolId: 'mcp.factory.asset-read', permission: 'allow' }, { toolId: 'mcp.factory.timeseries-read', permission: 'allow' }, { toolId: 'mcp.cmms.workorder-search', permission: 'allow' }, { toolId: 'mcp.cmms.workorder-create', permission: 'ask' }],
    highRiskApproval: true, approvalGroup: '设备值班长', timeoutSeconds: 90, maxSteps: 12, maxToolCalls: 18, dailyTokenBudget: 800000, successRate: 99.1, lastRun: '2 分钟前', updatedAt: '今天 14:31',
  },
  {
    id: 'AGT-0021', name: '质量根因 Agent', slug: 'quality-root-cause', description: '关联视觉、工艺与来料数据，定位缺陷根因。', owner: '质量工程部', visibility: 'team', tags: ['质量', '视觉'], lifecycle: 'published', health: 'warning', publishedVersion: '1.8.0', draftVersion: '1.9.0-draft',
    systemPrompt: '你是质量根因分析专家。按人员、设备、物料、方法、环境五个维度验证假设，引用检测批次和工艺数据。禁止导出未脱敏视觉样本。', welcomeMessage: '输入检测批次，我会关联视觉样本和工艺窗口。',
    model: { primaryModelId: 'MODEL-GPT5', fallbackModelId: 'MODEL-Q3F', preset: 'balanced', temperature: 0.35, maxOutputTokens: 6144 },
    skills: [{ skillId: 'SKILL-0034', version: '3.1.2' }], mcpServers: [{ serverId: 'MCP-0009', toolIds: ['mcp.vision.sample-search', 'mcp.vision.batch-compare'] }],
    tools: [{ toolId: 'builtin.task-plan', permission: 'allow' }, { toolId: 'mcp.vision.sample-search', permission: 'allow' }, { toolId: 'mcp.vision.batch-compare', permission: 'ask' }, { toolId: 'mcp.vision.sample-export', permission: 'deny' }],
    highRiskApproval: true, approvalGroup: '质量平台主管', timeoutSeconds: 120, maxSteps: 16, maxToolCalls: 24, dailyTokenBudget: 1200000, successRate: 97.8, lastRun: '8 分钟前', updatedAt: '今天 13:52',
  },
  {
    id: 'AGT-0032', name: '排程约束 Agent', slug: 'schedule-constraints', description: '计算订单、物料和设备约束并生成排产方案。', owner: '计划运营部', visibility: 'private', tags: ['排程', '草稿'], lifecycle: 'draft', health: 'idle', publishedVersion: null, draftVersion: '0.4.0-draft',
    systemPrompt: '你是生产排程助手。计算订单、设备、物料与换型约束，输出至少两个可行方案及影响范围。未经生产经理批准不得发布排程。', welcomeMessage: '输入订单编号或排程窗口开始评估。',
    model: { primaryModelId: 'MODEL-Q3F', fallbackModelId: '', preset: 'precise', temperature: 0.15, maxOutputTokens: 4096 },
    skills: [{ skillId: 'SKILL-0041', version: '0.8.4' }], mcpServers: [{ serverId: 'MCP-0001', toolIds: ['mcp.factory.asset-read'] }],
    tools: [{ toolId: 'builtin.task-plan', permission: 'allow' }, { toolId: 'builtin.code-sandbox', permission: 'ask' }, { toolId: 'mcp.factory.asset-read', permission: 'allow' }],
    highRiskApproval: true, approvalGroup: '生产经理', timeoutSeconds: 180, maxSteps: 20, maxToolCalls: 30, dailyTokenBudget: 500000, successRate: null, lastRun: '尚未运行', updatedAt: '昨天 17:10',
  },
]

export function createEmptyAgent(): AgentConfig {
  return {
    id: '', name: '', slug: '', description: '', owner: 'AI 平台组', visibility: 'workspace', tags: [], lifecycle: 'draft', health: 'idle', publishedVersion: null, draftVersion: '0.1.0-draft', systemPrompt: '', welcomeMessage: '',
    model: { primaryModelId: 'MODEL-Q3F', fallbackModelId: '', preset: 'balanced', temperature: 0.3, maxOutputTokens: 4096 },
    skills: [], mcpServers: [], tools: [{ toolId: 'builtin.task-plan', permission: 'allow' }], highRiskApproval: true, approvalGroup: '安全治理组', timeoutSeconds: 90, maxSteps: 12, maxToolCalls: 20, dailyTokenBudget: 300000, successRate: null, lastRun: '尚未运行', updatedAt: '刚刚',
  }
}
