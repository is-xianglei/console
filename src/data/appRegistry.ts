export type AppRuntimeStatus = 'nominal' | 'warning'

export interface RuntimeAsset {
  name: string
  score: number
  reading: string
  status: AppRuntimeStatus
}

export interface RuntimeMeasure {
  label: string
  value: string
}

export interface WorkbenchApp {
  id: string
  name: string
  icon: string
  status: AppRuntimeStatus
  team: string
  subject: string
  unit: string
  location: string
  score: number
  tabs: string[]
  readingLabel: string
  detail: string
  reviewLabel: string
  assets: RuntimeAsset[]
  measures: RuntimeMeasure[]
  events: string[]
}

export const WORKBENCH_APPS: WorkbenchApp[] = [
  {
    id: 'health', name: '设备健康中心', icon: 'activity', status: 'nominal',
    team: '设备可靠性 Team', subject: 'P-204 实时数据', unit: '泵组运行单元',
    location: '华东一厂 · 公用工程区', score: 91,
    tabs: ['循环泵', '冷却塔', '空压站'], readingLabel: '振动',
    detail: 'P-204 · 驱动端轴承', reviewLabel: '需复测',
    assets: [
      { name: 'P-201 循环泵', score: 96, reading: '2.1 mm/s', status: 'nominal' },
      { name: 'P-202 循环泵', score: 89, reading: '3.4 mm/s', status: 'nominal' },
      { name: 'P-204 循环泵', score: 68, reading: '6.8 mm/s', status: 'warning' },
      { name: 'P-205 循环泵', score: 93, reading: '2.7 mm/s', status: 'nominal' },
    ],
    measures: [
      { label: 'RMS', value: '6.8 mm/s' },
      { label: '温度', value: '78.4 °C' },
      { label: '负载', value: '72.1 %' },
    ],
    events: ['轴向振动超过预警阈值', '2× 转频分量持续上升', '负载由 61% 升至 72%'],
  },
  {
    id: 'quality', name: '质量缺陷分析', icon: 'scan-line', status: 'warning',
    team: '质量管控 Team', subject: 'QC-0722 检测批次', unit: '视觉质检工作台',
    location: '电池二厂 · 模组线', score: 94,
    tabs: ['焊点', '外观', '装配'], readingLabel: '缺陷率',
    detail: 'S03 · 回流焊工位', reviewLabel: '待复核',
    assets: [
      { name: 'QC-0719 样本', score: 98, reading: '0.08%', status: 'nominal' },
      { name: 'QC-0720 样本', score: 96, reading: '0.11%', status: 'nominal' },
      { name: 'QC-0722 样本', score: 71, reading: '1.84%', status: 'warning' },
      { name: 'QC-0723 样本', score: 95, reading: '0.13%', status: 'nominal' },
    ],
    measures: [
      { label: '缺陷率', value: '1.84 %' },
      { label: '异常样本', value: '47 pcs' },
      { label: '置信度', value: '88.0 %' },
    ],
    events: ['焊点孔洞率超过控制线', '峰值温度低于工艺窗口', '来料批次差异不显著'],
  },
  {
    id: 'schedule', name: '生产排程助手', icon: 'calendar-range', status: 'nominal',
    team: '智能排程 Team', subject: '订单与产能约束', unit: '生产排程控制台',
    location: '总装一厂 · 混线区域', score: 89,
    tabs: ['订单', '产线', '物料'], readingLabel: '达成率',
    detail: '方案 B · 明日混线排产', reviewLabel: '待发布',
    assets: [
      { name: 'L1 总装线', score: 96, reading: '96.4%', status: 'nominal' },
      { name: 'L2 混装线', score: 74, reading: '87.1%', status: 'warning' },
      { name: 'L3 包装线', score: 92, reading: '94.8%', status: 'nominal' },
      { name: 'L4 测试线', score: 90, reading: '92.6%', status: 'nominal' },
    ],
    measures: [
      { label: '订单数', value: '184' },
      { label: '换型损失', value: '18 min' },
      { label: '延期风险', value: '2 jobs' },
    ],
    events: ['SO-2847 标记为紧急订单', 'L2 物料齐套率更新为 98%', '方案 B 完成约束校验'],
  },
  {
    id: 'energy', name: '能源优化调度', icon: 'gauge', status: 'nominal',
    team: '能源优化 Team', subject: '实时能耗与负载', unit: '能碳调度中心',
    location: '华东一厂 · 能源站', score: 93,
    tabs: ['空压站', '冷站', '配电'], readingLabel: '负载',
    detail: '空压站 · 夜间优化策略', reviewLabel: '待确认',
    assets: [
      { name: '空压机 AC-01', score: 94, reading: '71.2%', status: 'nominal' },
      { name: '空压机 AC-02', score: 76, reading: '88.5%', status: 'warning' },
      { name: '冷却塔 CT-01', score: 91, reading: '64.1%', status: 'nominal' },
      { name: '储气罐 TK-03', score: 89, reading: '78.0%', status: 'nominal' },
    ],
    measures: [
      { label: '预计节能', value: '1,860 kWh' },
      { label: '成本降低', value: '7.4 %' },
      { label: '谷价窗口', value: '6.0 h' },
    ],
    events: ['生产计划同步完成', '谷价窗口 23:00 开始', '设备联控策略等待确认'],
  },
]

export function getWorkbenchApp(id: string | null | undefined): WorkbenchApp | undefined {
  return WORKBENCH_APPS.find((app) => app.id === id)
}
