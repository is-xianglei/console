import type {
  EvolutionCandidateStatus,
  EvolutionContributions,
  EvolutionMechanism,
  EvolutionOperation,
  EvolutionPrefs,
  EvolutionTargetKind,
  MemorySettings,
  MyEvolutionCandidate,
} from '@/interfaces/settings/evolution/model'

type BadgeColor = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'

export const EVOLUTION_MECHANISMS: Array<{ key: EvolutionMechanism; label: string }> = [
  { key: 'memory', label: '记忆生长' },
  { key: 'skill', label: '技能沉淀' },
  { key: 'workflow', label: '编排修正' },
]

export const MIN_SUPPORT_RANGE = { min: 2, max: 20 } as const

export const EVOLUTION_KIND_META: Record<EvolutionTargetKind, { label: string; icon: string }> = {
  memory: { label: '记忆生长', icon: 'i-lucide-database' },
  skill: { label: '技能沉淀', icon: 'i-lucide-zap' },
  workflow: { label: '编排修正', icon: 'i-lucide-git-branch' },
  prompt: { label: '提示词', icon: 'i-lucide-message-square-text' },
}

/** 状态文案与颜色，颜色按参考项目 antd Tag 色映射到 Nuxt UI color。 */
export const EVOLUTION_STATUS_META: Record<EvolutionCandidateStatus, { label: string; color: BadgeColor }> = {
  draft: { label: '候选待审', color: 'info' },
  replay_passed: { label: '回放通过', color: 'primary' },
  shadow: { label: '影子运行', color: 'secondary' },
  canary: { label: '灰度中', color: 'warning' },
  active: { label: '已上架', color: 'success' },
  retired: { label: '已退役', color: 'neutral' },
  rejected: { label: '已拒绝', color: 'error' },
  rolled_back: { label: '已回滚', color: 'error' },
}

export const EVOLUTION_OPERATION_LABEL: Record<EvolutionOperation, string> = {
  new: '新增',
  create: '新增',
  patch: '优化',
  update: '改写',
  reweight: '调权',
  deprecate: '停用',
  merge: '合并',
}

export const EVOLUTION_KIND_LABEL: Record<MyEvolutionCandidate['target_kind'], string> = {
  skill: '技能',
  memory: '记忆',
}

// ===== 模拟数据：后端就绪后由 src/http/settings/evolution.ts 改为真实请求，这里随之删除 =====

export const MOCK_DELAY_MS = 300

export const MOCK_MEMORY_SETTINGS: MemorySettings = {
  memory_enabled: true,
  memory_write_enabled: true,
  memory_count: 128,
}

export const MOCK_EVOLUTION_PREFS: EvolutionPrefs = {
  enabled: true,
  mechanisms: ['memory', 'skill', 'workflow'],
  min_support: 3,
  auto_approve_low_risk: false,
}

const PDF_TABLE_SKILL = `# PDF 表格整理

把 PDF 里的表格抽取出来，整理成可以直接使用的表格文件。

## 步骤

1. 用 \`read_file\` 读取用户给出的 PDF。
2. 用 \`extract_table\` 按页抽取表格，合并跨页的同一张表。
3. 统一表头、去掉空行和页脚，再用 \`write_file\` 输出为 \`.xlsx\`。

## 注意

- 扫描件先提示用户，抽取结果可能不完整。
- 输出文件与原 PDF 同名，放在同一目录。`

export const MOCK_MY_CANDIDATES: MyEvolutionCandidate[] = [
  {
    candidate_id: 'cand-skill-pdf-table',
    target_kind: 'skill',
    operation: 'new',
    summary: '近 5 次对话都先读 PDF 再导出表格',
    status: 'replay_passed',
    risk_tier: 'low',
    your_episodes: 5,
    total_evidence: 12,
    tool_sequence: ['read_file', 'extract_table', 'write_file'],
    action: 'install_skill',
    action_label: '为我启用',
    action_effect: '作为你的私有技能安装，只对你生效',
    change: {
      type: 'skill_document',
      display_name: 'PDF 表格整理',
      description: '遇到「把 PDF 里的表格导出来」这类任务时，直接按固定步骤抽取并整理表格，不再每次重新规划。',
      allowed_tools: ['read_file', 'extract_table', 'write_file'],
      content: PDF_TABLE_SKILL,
    },
    created_at: '2026-10-21T09:12:00Z',
  },
  {
    candidate_id: 'cand-skill-weekly-report',
    target_kind: 'skill',
    operation: 'patch',
    summary: '周报生成前总会先查询本周工单，再按设备汇总',
    status: 'shadow',
    risk_tier: 'low',
    your_episodes: 4,
    total_evidence: 4,
    tool_sequence: ['workorder.query', 'timeseries.aggregate', 'report.render'],
    action: 'install_skill',
    action_label: '为我启用',
    action_effect: '作为你的私有技能安装，只对你生效',
    change: {
      type: 'skill_sequence',
      display_name: '周报生成',
      description: '生成周报时先汇总本周工单与设备指标，再套用报表模板输出。',
      allowed_tools: ['workorder.query', 'timeseries.aggregate', 'report.render'],
      steps: ['workorder.query', 'timeseries.aggregate', 'report.render'],
    },
    created_at: '2026-10-22T03:40:00Z',
  },
  {
    candidate_id: 'cand-memory-units',
    target_kind: 'memory',
    operation: 'update',
    summary: '你多次纠正温度单位与报告语言',
    status: 'draft',
    risk_tier: 'low',
    your_episodes: 3,
    total_evidence: 3,
    tool_sequence: [],
    action: 'apply_memory',
    action_label: '应用调整',
    action_effect: '只调整你自己的记忆',
    change: {
      type: 'memory_ops',
      operations: [
        { operation: 'update', text: '温度统一使用摄氏度（°C）', reason: '3 次对话中把 °F 改回了 °C' },
        { operation: 'create', text: '诊断报告默认用简体中文输出', reason: '每次都补充要求中文' },
        { operation: 'deprecate', text: '偏好英文输出报告', reason: '与最近的纠正冲突' },
      ],
    },
    created_at: '2026-10-22T08:05:00Z',
  },
]

export const MOCK_CONTRIBUTIONS: EvolutionContributions = {
  episodes: 64,
  contributed_episodes: 42,
  private_episodes: 22,
  memory_written: 128,
  candidates: [
    { candidate_id: 'contrib-pdf-table', target_kind: 'skill', summary: '先读 PDF 再抽取表格并导出为 Excel', status: 'replay_passed', risk_tier: 'low', your_episodes: 5, total_evidence: 12 },
    { candidate_id: 'contrib-pump-diagnosis', target_kind: 'skill', summary: '泵站振动告警：拉取时序 → 频谱分析 → 生成诊断报告', status: 'active', risk_tier: 'medium', your_episodes: 8, total_evidence: 31 },
    { candidate_id: 'contrib-units', target_kind: 'memory', summary: '温度统一使用摄氏度，报告默认简体中文', status: 'draft', risk_tier: 'low', your_episodes: 3, total_evidence: 3 },
    { candidate_id: 'contrib-parallel-fetch', target_kind: 'workflow', summary: '多设备数据采集改为并行派发子代理', status: 'canary', risk_tier: 'medium', your_episodes: 6, total_evidence: 19 },
    { candidate_id: 'contrib-weekly-report', target_kind: 'skill', summary: '周报生成前先查询本周工单并按设备汇总', status: 'shadow', risk_tier: 'low', your_episodes: 4, total_evidence: 4 },
    { candidate_id: 'contrib-skip-confirm', target_kind: 'workflow', summary: '导出前跳过二次确认', status: 'rolled_back', risk_tier: 'high', your_episodes: 2, total_evidence: 9 },
  ],
}
