import type {
  PlatformModule,
  PlatformModuleKey,
  ResourcePage,
  ResourceRow,
} from '../interfaces/platform/model'

const buildRows: Record<string, ResourceRow[]> = {
  agents: [
    { id: 'AGT-0014', name: '设备诊断 Agent', status: 'nominal', values: ['Qwen3-32B', '可靠性 Team', '99.1%', '2 min ago'], description: '分析设备信号与工单，输出可审核的维修建议。', tags: ['5 Skills', '3 MCP', 'v2.4.1'], owner: '设备工程部' },
    { id: 'AGT-0021', name: '质量根因 Agent', status: 'nominal', values: ['GPT-5 Enterprise', '质量管控 Team', '97.8%', '8 min ago'], description: '关联视觉、工艺与来料数据定位缺陷根因。', tags: ['7 Skills', '4 MCP', 'v1.8.0'], owner: '质量工程部' },
    { id: 'AGT-0032', name: '排程约束 Agent', status: 'warning', values: ['Qwen3-32B', '智能排程 Team', '94.2%', '36 min ago'], description: '计算订单、物料和设备约束并生成排产方案。', tags: ['4 Skills', '2 MCP', 'DRAFT'], owner: '计划运营部' },
  ],
  teams: [
    { id: 'TEAM-0003', name: '设备可靠性 Team', status: 'nominal', values: ['主管式', '诊断协调 Agent', '5 Agents', '98.8%'], description: '负责诊断、工单检索、风险判断和维修建议。', tags: ['共享上下文', '双人审批', 'v2.2'], owner: '设备工程部' },
    { id: 'TEAM-0007', name: '质量管控 Team', status: 'nominal', values: ['流水线', '质量受理 Agent', '4 Agents', '97.1%'], description: '完成缺陷识别、工艺关联、根因验证和处置建议。', tags: ['顺序交接', '6 Skills', 'v1.9'], owner: '质量工程部' },
    { id: 'TEAM-0011', name: '生产排程 Team', status: 'warning', values: ['并行协作', '排程协调 Agent', '6 Agents', '93.5%'], description: '并行评估设备、物料、人员和订单优先级约束。', tags: ['并发 4', '超时 90s', 'DRAFT'], owner: '计划运营部' },
  ],
  models: [
    { id: 'MODEL-Q3F', name: 'Qwen3-32B-Factory', status: 'nominal', values: ['私有集群', '128K', '612 ms', 'PRIMARY'], description: '制造业中文任务主模型，数据保留在华东私有集群。', tags: ['CN-EAST', '¥0.018/1K', 'Priority 1'], owner: 'AI 平台组' },
    { id: 'MODEL-GPT5', name: 'GPT-5 Enterprise', status: 'nominal', values: ['OpenAI', '256K', '1.2 s', 'FALLBACK'], description: '复杂规划与治理审查回退模型。', tags: ['AP-SG', '¥0.092/1K', 'Priority 2'], owner: 'AI 平台组' },
    { id: 'MODEL-DSR1', name: 'DeepSeek-R1-70B', status: 'warning', values: ['GPU Pool B', '64K', '2.8 s', 'DEGRADED'], description: '复杂推理备用模型，当前 GPU 队列拥塞。', tags: ['CN-EAST', '¥0.031/1K', 'Priority 3'], owner: '基础设施组' },
  ],
  skills: [
    { id: 'SKILL-0034', name: 'visual-inspection', status: 'nominal', values: ['v3.1.2', '内部仓库', '7 Agents', 'PASSED'], description: '处理视觉质检图像与检测批次上下文。', tags: ['2 Dependencies', 'READ IMAGE', 'SIGNED'], owner: '质量工程部' },
    { id: 'SKILL-0012', name: 'work-order-query', status: 'nominal', values: ['v2.6.0', '组织共享', '11 Agents', 'PASSED'], description: '查询维修工单、故障记录和备件消耗。', tags: ['MES READ', 'CMMS READ', 'SIGNED'], owner: '设备工程部' },
    { id: 'SKILL-0041', name: 'schedule-optimizer', status: 'warning', values: ['v0.8.4', '开发分支', '2 Agents', 'PENDING'], description: '运行多约束排产优化并返回可解释方案。', tags: ['4 Dependencies', 'EXECUTE', 'REVIEW'], owner: '计划运营部' },
  ],
  mcp: [
    { id: 'MCP-0001', name: 'factory-data-hub', status: 'nominal', values: ['SSE', '18 Tools', '42 ms', 'OAuth 2.0'], description: '连接 MES、IoT 与设备主数据的统一入口。', tags: ['12 Resources', '8 Agents', 'HEALTHY'], owner: '数据平台组' },
    { id: 'MCP-0005', name: 'maintenance-cmms', status: 'nominal', values: ['HTTP', '9 Tools', '71 ms', 'API Key'], description: '维修工单、故障编码与备件资源服务。', tags: ['6 Resources', '5 Agents', 'HEALTHY'], owner: '设备工程部' },
    { id: 'MCP-0009', name: 'vision-gateway', status: 'warning', values: ['STDIO', '7 Tools', '1.8 s', 'mTLS'], description: '视觉样本与检测推理网关，最近握手延迟升高。', tags: ['3 Resources', '4 Agents', 'DEGRADED'], owner: '质量工程部' },
  ],
}

const governanceRows: Record<string, ResourceRow[]> = {
  policies: [
    { id: 'POL-0014', name: '停机指令双人审批', status: 'nominal', values: ['全生产空间', 'BLOCK + APPROVE', '31 hits', 'v3.2'], description: '阻断设备停机与关键参数写入，要求业务与安全双人审批。', tags: ['Priority 10', '12 Agents', 'ENFORCED'], owner: '安全治理组' },
    { id: 'POL-0021', name: '质量数据跨域限制', status: 'nominal', values: ['质量域', 'DENY', '8 hits', 'v1.7'], description: '禁止未经授权的 Agent 将视觉样本传出质量数据域。', tags: ['Priority 20', '5 Apps', 'ENFORCED'], owner: '质量治理组' },
    { id: 'POL-0030', name: '模型成本熔断', status: 'warning', values: ['当前工作区', 'WARN + LIMIT', '208 hits', 'DRAFT'], description: 'Token 成本达到日预算 90% 后切换到低成本模型。', tags: ['Priority 40', '8 Models', 'REVIEW'], owner: 'FinOps' },
  ],
  evaluations: [
    { id: 'EVAL-0008', name: '设备诊断基准集', status: 'nominal', values: ['420', '诊断 Agent v2.4', '99.2%', '12 min ago'], description: '覆盖泵、风机、压缩机典型异常与安全边界。', tags: ['8 Metrics', 'GOLDEN SET', 'v4'], owner: '设备工程部' },
    { id: 'EVAL-0011', name: '质检根因评测集', status: 'nominal', values: ['386', '质量 Team v1.9', '97.6%', '2 h ago'], description: '视觉缺陷到工艺根因的多模态评测集。', tags: ['6 Metrics', '14 FAILED', 'v3'], owner: '质量工程部' },
    { id: 'EVAL-0015', name: '排程约束挑战集', status: 'warning', values: ['208', '排程 Team DRAFT', '36%', 'RUNNING'], description: '高混线、多插单与物料短缺压力评测。', tags: ['5 Metrics', 'RUNNING', 'v1'], owner: '计划运营部' },
  ],
  risks: [
    { id: 'RISK-0722', name: '未授权质量数据导出', status: 'error', values: ['HIGH', '质量根因 Agent', '王琳', '待处理'], description: 'Agent 尝试将 12 张视觉样本发送至未授权外部端点。', tags: ['TRACE-A91F', 'POL-0021', '14:08'], owner: '质量平台治理组' },
    { id: 'RISK-0719', name: 'MCP 连续握手超时', status: 'warning', values: ['MEDIUM', 'vision-gateway', '陈浩', '调查中'], description: '视觉 MCP 在 10 分钟内出现 5 次握手超时。', tags: ['TRACE-88CD', 'MCP-0009', '13:42'], owner: '平台治理组' },
    { id: 'RISK-0708', name: '高成本模型异常路由', status: 'nominal', values: ['LOW', '模型路由器', '系统', '已关闭'], description: '低成本模型可用时错误切换到高成本回退模型。', tags: ['TRACE-77A2', 'POL-0030', 'YESTERDAY'], owner: 'FinOps' },
  ],
  traces: [
    { id: 'TRACE-A91F', name: '泵组 A 异常排查', status: 'warning', values: ['3.82 s', '18.4K', '¥0.84', 'PARTIAL'], description: '设备诊断 Team 端到端运行，视觉网关节点发生重试。', tags: ['7 Spans', '1 RETRY', '14:29:08'], owner: '设备可靠性 Team' },
    { id: 'TRACE-88CD', name: '批次 QC-0722 复核', status: 'nominal', values: ['2.14 s', '12.7K', '¥0.61', 'SUCCESS'], description: '质量根因 Team 完成视觉与工艺数据关联。', tags: ['9 Spans', '0 ERROR', '14:21:44'], owner: '质量管控 Team' },
    { id: 'TRACE-81BB', name: '明日混线排产', status: 'nominal', values: ['6.92 s', '31.2K', '¥1.48', 'SUCCESS'], description: '排程 Team 并行评估四类约束并汇总方案。', tags: ['12 Spans', '4 PARALLEL', '14:18:03'], owner: '生产排程 Team' },
  ],
  audits: [
    { id: 'AUD-92841', name: '发布 Agent v2.4.1', status: 'nominal', values: ['张工程师', 'PUBLISH', 'AGT-0014', '14:31:07'], description: '设备诊断 Agent 从 v2.4.0 发布到 v2.4.1。', tags: ['IP 10.2.4.18', 'SIGNED', 'WORKSPACE'], owner: '平台审计' },
    { id: 'AUD-92832', name: '批准访问申请', status: 'nominal', values: ['王琳', 'GRANT', 'REQ-2041', '14:18:22'], description: '授予李明 30 天质量应用发布权限。', tags: ['IP 10.2.8.41', 'SIGNED', 'EXPIRES'], owner: '平台审计' },
    { id: 'AUD-92798', name: '修改成本熔断阈值', status: 'warning', values: ['治理机器人', 'UPDATE', 'POL-0030', '13:52:10'], description: '日预算告警阈值由 85% 调整为 90%。', tags: ['SERVICE', 'SIGNED', 'PENDING'], owner: '平台审计' },
  ],
  quotas: [
    { id: 'BUDGET-0004', name: '华东制造中心月度预算', status: 'warning', values: ['¥12,600', '68%', '¥10,900', '80% / 95%'], description: '覆盖当前生产工作区全部模型与 Agent 调用。', tags: ['MONTHLY', 'HARD LIMIT', 'OWNER: FINOPS'], owner: 'FinOps' },
    { id: 'BUDGET-0012', name: '质量工程部配额', status: 'nominal', values: ['¥3,200', '54%', '¥2,760', '75% / 90%'], description: '视觉分析与质量根因 Team 专项预算。', tags: ['DEPARTMENT', 'SOFT LIMIT', 'OWNER: QA'], owner: '质量工程部' },
    { id: 'BUDGET-0018', name: 'GPT-5 回退模型限额', status: 'nominal', values: ['¥1,500', '41%', '¥1,080', '70% / 90%'], description: '控制高成本回退模型的月度支出。', tags: ['MODEL', 'RATE LIMIT', 'OWNER: AI'], owner: 'AI 平台组' },
  ],
}

const organizationRows: Record<string, ResourceRow[]> = {
  departments: [
    { id: 'DEPT-001', name: '华东制造中心', status: 'nominal', values: ['一级部门', '142 人', '8 群组', '张建国'], description: '负责华东区域生产、设备、质量与计划运营。', tags: ['3 工作区', 'PRODUCTION', 'ACTIVE'], owner: '集团制造部' },
    { id: 'DEPT-014', name: '质量工程部', status: 'nominal', values: ['二级部门', '38 人', '5 群组', '王琳'], description: '管理质量标准、视觉质检和根因分析能力。', tags: ['6 Apps', '12 Agents', 'ACTIVE'], owner: '华东制造中心' },
    { id: 'DEPT-019', name: '设备工程部', status: 'warning', values: ['二级部门', '26 人', '4 群组', '陈浩'], description: '负责设备可靠性、检维修与备件策略。', tags: ['4 Apps', '9 Agents', 'SYNCING'], owner: '华东制造中心' },
  ],
  groups: [
    { id: 'GROUP-008', name: '质量平台治理组', status: 'nominal', values: ['动态群组', '12 人', '7 角色', 'SCIM'], description: '承担质量应用审核、风险事件认领和策略维护。', tags: ['AUTO SYNC', '2 Owners', 'ACTIVE'], owner: '质量工程部' },
    { id: 'GROUP-012', name: '设备可靠性专家组', status: 'nominal', values: ['静态群组', '8 人', '5 角色', '手动'], description: '审查设备诊断结论和高风险维修建议。', tags: ['2 Approvers', 'ON CALL', 'ACTIVE'], owner: '设备工程部' },
    { id: 'GROUP-021', name: '外协开发者', status: 'warning', values: ['规则群组', '17 人', '2 角色', 'HRIS'], description: '限定时间访问应用开发沙箱与测试数据。', tags: ['EXPIRES', 'SANDBOX', 'REVIEW'], owner: '数字化平台部' },
  ],
  people: [
    { id: 'USR-0286', name: '王琳', status: 'nominal', values: ['质量平台主管', '质量工程部', '5 角色', '刚刚'], description: '质量平台业务负责人和高风险审批人。', tags: ['MFA', 'SSO', 'OWNER'], owner: '质量工程部' },
    { id: 'USR-0198', name: '陈浩', status: 'nominal', values: ['设备可靠性工程师', '设备工程部', '3 角色', '12 min ago'], description: '设备诊断 Agent 与 CMMS 连接负责人。', tags: ['MFA', 'SSO', 'ON CALL'], owner: '设备工程部' },
    { id: 'USR-0312', name: '李明', status: 'warning', values: ['应用开发者', '数字化平台部', '2 角色', '2 h ago'], description: '正在申请质量应用发布权限。', tags: ['MFA PENDING', 'CONTRACTOR', 'REVIEW'], owner: '数字化平台部' },
  ],
  roles: [
    { id: 'ROLE-0003', name: 'Agent 配置管理员', status: 'nominal', values: ['工作区角色', '24 人', '18 权限', '2 h ago'], description: '管理 Agent、Team、Model、Skill 与 MCP 配置。', tags: ['CUSTOM', 'SCOPED', 'v5'], owner: 'AI 平台组' },
    { id: 'ROLE-0007', name: '治理审批人', status: 'nominal', values: ['组织角色', '8 人', '11 权限', '昨天'], description: '审批高风险操作、应用发布和跨域访问。', tags: ['SYSTEM', 'MFA REQUIRED', 'v3'], owner: '安全治理组' },
    { id: 'ROLE-0009', name: '应用开发者', status: 'warning', values: ['工作区角色', '46 人', '9 权限', '3 d ago'], description: '开发、测试并提交自研制造业应用。', tags: ['CUSTOM', 'SANDBOX', 'DRAFT'], owner: '数字化平台部' },
  ],
  permissions: [
    { id: 'ACL-0017', name: '质量域应用发布策略', status: 'nominal', values: ['质量工作区', '角色 + 属性', '17 grants', 'ENFORCED'], description: '仅质量平台主管可批准生产环境应用发布。', tags: ['ABAC', 'RBAC', 'Priority 10'], owner: '质量治理组' },
    { id: 'ACL-0023', name: '设备数据写入限制', status: 'nominal', values: ['生产工作区', '双人审批', '9 grants', 'ENFORCED'], description: '设备参数写入要求值班工程师和安全负责人共同批准。', tags: ['MFA', '2 APPROVERS', 'Priority 5'], owner: '安全治理组' },
    { id: 'ACL-0031', name: '外协沙箱访问', status: 'warning', values: ['开发沙箱', '到期回收', '12 grants', 'REVIEW'], description: '外协人员仅可访问脱敏数据，最长授权 30 天。', tags: ['EXPIRING', 'MASKED', 'Priority 30'], owner: '数字化平台部' },
  ],
  requests: [
    { id: 'REQ-2041', name: '李明申请质量应用发布权限', status: 'warning', values: ['应用开发者', '质量工作区', '30 天', '待审批'], description: '为质量缺陷分析应用发布 1.3 版本，需要临时生产权限。', tags: ['2 APPROVERS', 'MFA READY', '14:18'], owner: '质量平台治理组' },
    { id: 'REQ-2038', name: '陈浩申请设备写入权限', status: 'warning', values: ['设备工程师', '产线 A', '8 小时', '待二审'], description: '执行泵组参数校准，需要受控写入窗口。', tags: ['1/2 APPROVED', 'CHANGE-881', '13:42'], owner: '安全治理组' },
    { id: 'REQ-2021', name: '外协开发者沙箱续期', status: 'nominal', values: ['外协群组', '开发沙箱', '14 天', '已批准'], description: '续期脱敏数据与应用测试环境访问。', tags: ['APPROVED', 'EXPIRES', 'YESTERDAY'], owner: '数字化平台部' },
  ],
}

const page = (
  key: string,
  module: PlatformModuleKey,
  title: string,
  group: string,
  icon: string,
  action: string,
  description: string,
  stats: Array<[string, string]>,
  columns: string[],
  rows: ResourceRow[],
  mode: ResourcePage['mode'],
  featureTitle: string,
  featureHint: string,
): ResourcePage => ({ key, module, title, group, icon, action, description, stats, columns, rows, mode, featureTitle, featureHint })

export const PLATFORM_MODULES: Record<PlatformModuleKey, PlatformModule> = {
  build: { key: 'build', title: '构建资源', caption: 'BUILD RESOURCES', sections: [{ label: '智能体编排', items: [{ key: 'agents', label: 'Agents', icon: 'bot' }, { key: 'teams', label: 'Teams', icon: 'network' }, { key: 'plans', label: '编排方案', icon: 'workflow' }] }, { label: '能力与连接', items: [{ key: 'models', label: 'Models', icon: 'cpu' }, { key: 'skills', label: 'Skills', icon: 'wrench', route: '/skills' }, { key: 'mcp', label: 'MCP Servers', icon: 'server-cog' }] }] },
  governance: { key: 'governance', title: '治理控制台', caption: 'GOVERNANCE', sections: [{ label: '策略', items: [{ key: 'policies', label: '策略与护栏', icon: 'shield', count: '18' }, { key: 'evaluations', label: '评测集', icon: 'flask-conical', count: '9' }, { key: 'risks', label: '风险事件', icon: 'triangle-alert', count: '2' }] }, { label: '可观测', items: [{ key: 'traces', label: '运行追踪', icon: 'route' }, { key: 'audits', label: '审计日志', icon: 'scroll-text' }, { key: 'quotas', label: '成本与配额', icon: 'chart-no-axes-column', count: '68%' }] }] },
  organization: { key: 'organization', title: '组织与权限', caption: 'ORGANIZATION', sections: [{ label: '组织目录', items: [{ key: 'departments', label: '部门', icon: 'building-2', count: '14' }, { key: 'groups', label: '群组', icon: 'users-round', count: '21' }, { key: 'people', label: '人员', icon: 'user-round', count: '286' }] }, { label: '访问控制', items: [{ key: 'roles', label: '角色', icon: 'badge-check', count: '9' }, { key: 'permissions', label: '权限策略', icon: 'key-round', count: '17' }, { key: 'requests', label: '访问申请', icon: 'inbox', count: '6' }] }] },
}

export const RESOURCE_PAGES: Record<string, ResourcePage> = {
  agents: page('agents', 'build', 'Agents', '智能体编排', 'bot', '创建 Agent', '配置模型、Team、Skills、MCP、护栏与运行配额，并管理发布版本。', [['12', '全部'], ['9', '在线'], ['2', '草稿'], ['98.7%', '成功率']], ['基础模型', '所属 Team', '成功率', '最近运行'], buildRows.agents, 'orchestration', 'Agent 运行编排', '拖动节点规划能力链，配置变更将进入草稿。'),
  teams: page('teams', 'build', 'Teams', '智能体编排', 'network', '创建 Team', '编排多个 Agent 的职责、交接关系、共享上下文、并发与审批节点。', [['5', '全部'], ['4', '运行中'], ['18', '成员 Agent'], ['96.4%', '成功率']], ['编排模式', '入口 Agent', '成员数', '成功率'], buildRows.teams, 'orchestration', 'Team 交接拓扑', '检查入口、并行分支和人工审批节点。'),
  plans: page('plans', 'build', '编排方案', '智能体编排', 'workflow', '创建方案', '勾选 2-5 个 Agent 组成方案，选择顺序、并行、路由或循环模式，会话绑定后直接运行。', [['0', '全部'], ['0', '已启用'], ['0', '已停用'], ['0', '成员失效']], ['编排模式', '成员数', '状态', '更新时间'], [], 'orchestration', '编排方案预览', '方案数据由后端接口实时管理。'),
  models: page('models', 'build', 'Models', '能力与连接', 'cpu', '添加模型', '管理模型提供方、路由顺序、健康状态、延迟、成本与数据驻留策略。', [['8', '模型'], ['7', '健康'], ['1', '降级中'], ['842 ms', 'P95 延迟']], ['提供方', '上下文', 'P95 延迟', '路由'], buildRows.models, 'connection', '模型路由测试', '输入制造任务，预览模型选择和回退路径。'),
  skills: page('skills', 'build', 'Skills', '能力与连接', 'wrench', '创建 Skill', '管理 Skill 版本、来源、依赖、权限、安全校验以及 Agent 引用关系。', [['34', 'Skills'], ['29', '启用'], ['3', '待校验'], ['0', '高危']], ['版本', '来源', '引用数', '校验'], buildRows.skills, 'connection', '依赖与权限检查', 'Skill 实际上传与详情继续由真实 Skill 页面管理。'),
  mcp: page('mcp', 'build', 'MCP Servers', '能力与连接', 'server-cog', '连接 MCP', '配置 Transport、认证、工具授权、资源目录、超时重试与健康检查。', [['11', 'Servers'], ['10', '已连接'], ['1', '异常'], ['42 ms', 'P95 延迟']], ['Transport', 'Tools', 'P95 延迟', '认证'], buildRows.mcp, 'connection', '连接健康检查', '测试握手、鉴权、工具发现与资源读取。'),
  policies: page('policies', 'governance', '策略与护栏', '策略', 'shield', '创建策略', '配置行为规则、风险阈值、审批节点、作用域与发布版本，并模拟策略命中。', [['18', '生效'], ['3', '草稿'], ['247', '24H 命中'], ['0', '绕过']], ['作用域', '处置模式', '24H 命中', '版本'], governanceRows.policies, 'policy', '策略命中模拟器', '用模拟请求验证规则优先级和最终处置。'),
  evaluations: page('evaluations', 'governance', '评测集', '策略', 'flask-conical', '创建评测集', '维护制造业基准样本，比较 Agent 或模型版本并定位失败案例。', [['9', '评测集'], ['1,842', '样本'], ['99.2%', '通过率'], ['2', '运行中']], ['样本数', '目标', '通过率', '最近运行'], governanceRows.evaluations, 'policy', '版本对比评测', '选择两个版本并运行同一组制造业基准样本。'),
  risks: page('risks', 'governance', '风险事件', '策略', 'triangle-alert', '创建处置规则', '集中认领、调查、升级和关闭风险事件，并关联 Trace 与命中策略。', [['2', '待处理'], ['1', '高风险'], ['6', '本周关闭'], ['18 min', '平均响应']], ['等级', '来源', '负责人', '状态'], governanceRows.risks, 'policy', '事件处置时间线', '认领、升级或标记误报，并记录完整处置链。'),
  traces: page('traces', 'governance', '运行追踪', '可观测', 'route', '新建追踪视图', '查看 Agent、模型、Skill 与 MCP 的端到端调用链、耗时、Token、成本和失败节点。', [['12,842', '24H Traces'], ['98.6%', '成功率'], ['2.4 s', 'P95 耗时'], ['¥286', '24H 成本']], ['耗时', 'Tokens', '成本', '状态'], governanceRows.traces, 'observe', 'Span 调用链', '选择 Trace 查看端到端调用拓扑与每个节点输入输出。'),
  audits: page('audits', 'governance', '审计日志', '可观测', 'scroll-text', '创建导出任务', '查询不可变更的人员、Agent、资源配置与审批事件，检查变更前后差异。', [['48,219', '30D 事件'], ['286', '活跃主体'], ['17', '配置变更'], ['100%', '已签名']], ['操作者', '动作', '资源', '时间'], governanceRows.audits, 'observe', '不可变更 Diff', '核对配置变更、签名摘要和来源主体。'),
  quotas: page('quotas', 'governance', '成本与配额', '可观测', 'chart-no-axes-column', '创建配额', '按工作区、部门、Agent 和模型分摊成本，配置预算、告警阈值和限流。', [['¥8,420', '本月成本'], ['68%', '预算使用'], ['¥12.6K', '月度预算'], ['3', '告警规则']], ['预算', '已使用', '预测', '告警'], governanceRows.quotas, 'observe', '预算消耗趋势', '调整维度和周期，检查预算预测与熔断阈值。'),
  departments: page('departments', 'organization', '部门', '组织目录', 'building-2', '新建部门', '维护组织层级、部门负责人、工作区归属和同步来源。', [['14', '部门'], ['286', '人员'], ['6', '工作区'], ['100%', '目录同步']], ['层级', '成员', '群组', '负责人'], organizationRows.departments, 'directory', '组织层级', '检查父子部门、负责人和工作区继承关系。'),
  groups: page('groups', 'organization', '群组', '组织目录', 'users-round', '新建群组', '管理静态、动态和规则群组，以及角色、应用和审批责任绑定。', [['21', '群组'], ['186', '成员'], ['8', '动态群组'], ['3', '待同步']], ['类型', '成员', '角色', '来源'], organizationRows.groups, 'directory', '动态成员规则', '配置部门、岗位、区域和雇佣状态条件。'),
  people: page('people', 'organization', '人员', '组织目录', 'user-round', '邀请人员', '查看人员身份、所属部门与群组、角色、MFA 和最近活动。', [['286', '人员'], ['274', '已激活'], ['12', '待邀请'], ['98%', 'MFA 覆盖']], ['岗位', '部门', '角色', '最近活动'], organizationRows.people, 'directory', '身份与归属', '检查人员组织关系、认证状态和临时授权。'),
  roles: page('roles', 'organization', '角色', '访问控制', 'badge-check', '创建角色', '配置角色权限矩阵、作用域、成员绑定和职责分离约束。', [['9', '角色'], ['6', '自定义'], ['78', '绑定'], ['0', '职责冲突']], ['作用域', '成员', '权限', '更新'], organizationRows.roles, 'access', '权限矩阵', '切换资源操作并预览继承后的有效权限。'),
  permissions: page('permissions', 'organization', '权限策略', '访问控制', 'key-round', '创建权限策略', '组合 RBAC 与属性规则，约束资源、环境、时段和审批条件。', [['17', '策略'], ['14', '生效'], ['3', '草稿'], ['128', '24H 决策']], ['作用域', '规则', '授权数', '状态'], organizationRows.permissions, 'access', '权限决策模拟器', '输入主体、资源和操作，验证最终授权决策。'),
  requests: page('requests', 'organization', '访问申请', '访问控制', 'inbox', '代提申请', '审批临时角色、资源访问和生产操作权限，自动执行到期回收。', [['6', '待审批'], ['2', '高风险'], ['14 min', '平均处理'], ['0', '逾期']], ['申请角色', '资源', '期限', '状态'], organizationRows.requests, 'access', '审批上下文', '核对业务理由、风险、职责冲突和到期时间。'),
}

export function getDefaultResource(module: PlatformModuleKey): string {
  return PLATFORM_MODULES[module].sections[0].items[0].key
}
