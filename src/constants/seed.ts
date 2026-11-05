import type { Session, SubAgentTemplate } from '../interfaces/console/model'

export const SESSIONS: Session[] = [
  { id: 'sess-a93f', title: '设备异常根因分析', time: '14:22', count: 18, badge: '2', appId: 'health' },
  { id: 'sess-7c10', title: '泵站能耗优化方案', time: '昨天', count: 9, appId: 'energy' },
  { id: 'sess-3b88', title: '传感器漂移校准复盘', time: '周一', count: 24, appId: 'quality' },
  { id: 'sess-general', title: '制造平台能力规划', time: '周一', count: 12 },
]

/** 一次任务派发的子代理编排模板(设备根因分析诊断流) */
export const SUBAGENT_TEMPLATES: SubAgentTemplate[] = [
  {
    name: '数据采集代理',
    icon: 'database',
    think: '检查 pump-01 近 24h 振动与温度时序的完整性,定位缺口窗口。',
    fn: 'timeseries.fetch(asset="pump-01", window="24h")',
    body: 'rows: 8640   gaps: 2   ✓ 完整度 99.4%',
    answer: '已拉取 8640 个采样点,发现两处短缺口,已用线性插值补齐。',
    task: '采集 pump-01 时序数据',
  },
  {
    name: '特征诊断代理',
    icon: 'activity',
    think: '对振动频谱做 FFT,比对基线包络,判断是否存在轴承特征频率。',
    fn: 'spectral.fft(signal="vib_x", fs=2048)',
    body: 'peak: 162.4Hz   BPFO: 161.8Hz   ⚠ 匹配外圈故障',
    answer: '频谱在 162Hz 出现显著峰值,与外圈通过频率 BPFO 吻合,疑似轴承外圈损伤。',
    task: '振动频谱特征诊断',
  },
  {
    name: '知识检索代理',
    icon: 'book-open',
    think: '检索同型号泵的历史工单与维修记录,寻找相似故障模式。',
    fn: 'kb.search(q="BPFO bearing pump", top_k=5)',
    body: 'hits: 5   最相关: WO-2291 (相似度 0.91)',
    answer: '历史工单 WO-2291 记录了相同特征,根因确认为外圈点蚀,更换轴承后恢复。',
    task: '检索历史工单知识库',
  },
  {
    name: '方案生成代理',
    icon: 'wrench',
    think: '综合诊断与知识结论,生成分级处置建议与停机窗口评估。',
    fn: 'planner.compose(severity="high")',
    body: 'action: 计划停机更换   ETA: 36h   ✓ 已生成工单草稿',
    answer: '建议 36 小时内安排计划停机更换轴承,已生成工单草稿待审批。',
    task: '生成处置方案工单',
  },
]

/** 主 Agent 汇总回答(Markdown,由 utils/markdown 渲染) */
export const SYNTHESIS_MARKDOWN = `综合 4 个子代理的结论:**pump-01 的根因为轴承外圈点蚀**。

- 振动频谱在 \`162Hz\` 处与外圈通过频率 **BPFO** 吻合
- 历史工单 \`WO-2291\` 佐证了相同故障模式
- 温度与振动时序完整度 99.4%,数据可信

> 建议在 **36 小时**内安排计划停机更换轴承,工单草稿已生成,等待你的审批。`
