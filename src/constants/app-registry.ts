import type { WorkbenchApp } from '../interfaces/app/model'

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
  {
    id: 'forecast', name: '时序预测', icon: 'trending-up', status: 'nominal',
    team: '数据智能 Team', subject: 'P-201 负荷时序', unit: '负荷预测工作台',
    location: '华东一厂 · 配电中心', score: 87,
    tabs: ['负荷', '温度', '流量'], readingLabel: '预测偏差',
    detail: '未来 24h 负荷曲线', reviewLabel: '待验证',
    assets: [
      { name: '日负荷预测', score: 92, reading: '±2.1%', status: 'nominal' },
      { name: '峰段负荷', score: 78, reading: '±4.6%', status: 'warning' },
      { name: '谷段负荷', score: 90, reading: '±1.7%', status: 'nominal' },
    ],
    measures: [
      { label: 'MAPE', value: '2.4 %' },
      { label: '预测窗口', value: '24 h' },
      { label: '置信度', value: '93.0 %' },
    ],
    events: ['负荷预测模型已更新', '峰段偏差超过阈值', '未来 2 天气温回升'],
  },
  {
    id: 'anomaly', name: '异常侦探', icon: 'search-code', status: 'warning',
    team: '根因分析 Team', subject: 'pump-01 振动告警', unit: '故障诊断工作台',
    location: '华东一厂 · 公用工程区', score: 82,
    tabs: ['振动', '温度', '电流'], readingLabel: '异常度',
    detail: 'P-201 循环泵 · 驱动端', reviewLabel: '需复核',
    assets: [
      { name: 'P-201 循环泵', score: 63, reading: '6.8 mm/s', status: 'warning' },
      { name: 'P-202 循环泵', score: 88, reading: '3.1 mm/s', status: 'nominal' },
      { name: 'P-205 循环泵', score: 91, reading: '2.2 mm/s', status: 'nominal' },
    ],
    measures: [
      { label: '异常分', value: '68' },
      { label: '疑似根因', value: '轴承外圈' },
      { label: '置信度', value: '91.0 %' },
    ],
    events: ['振动频谱出现 BPFO 峰值', '历史工单 WO-2291 相似', '建议 36h 内停机检查'],
  },
  {
    id: 'twin', name: '孪生仿真', icon: 'box', status: 'nominal',
    team: '数字孪生 Team', subject: 'L1 总装线实况', unit: '孪生仿真平台',
    location: '总装一厂 · 混线区域', score: 90,
    tabs: ['对象', '工况', '推演'], readingLabel: '拟合度',
    detail: '设备一级减速箱孪生体', reviewLabel: '已校准',
    assets: [
      { name: 'L1 线体孪生', score: 95, reading: '98.2%', status: 'nominal' },
      { name: 'KUKA 机械臂', score: 92, reading: '97.1%', status: 'nominal' },
      { name: 'AGV 编组', score: 86, reading: '95.4%', status: 'nominal' },
    ],
    measures: [
      { label: '拟合度', value: '97.4 %' },
      { label: '推演步长', value: '60 s' },
      { label: '场景数', value: '12' },
    ],
    events: ['孪生体与现场同步完成', '完成多工位推演校验', '物流动线匹配度更新'],
  },
  {
    id: 'workorder', name: '工单助手', icon: 'clipboard-list', status: 'nominal',
    team: '维修支援 Team', subject: 'WO-2291 处置', unit: '工单协同台',
    location: '华东一厂 · 维修中心', score: 85,
    tabs: ['待办', '派工', '跟踪'], readingLabel: '按时率',
    detail: 'P-201 轴承更换工单草稿', reviewLabel: '待审批',
    assets: [
      { name: 'WO-2291 更换', score: 88, reading: '36h' , status: 'nominal' },
      { name: 'WO-2290 润滑', score: 94, reading: '已派', status: 'nominal' },
      { name: 'WO-2292 巡检', score: 72, reading: '逾期 2h' , status: 'warning' },
    ],
    measures: [
      { label: '待办', value: '4 单' },
      { label: '按时率', value: '94.2 %' },
      { label: '平均时长', value: '6.8 h' },
    ],
    events: ['WO-2291 审批流已发起', '备件库存满足', '派工方案等待确认'],
  },
  {
    id: 'graph', name: '知识图谱', icon: 'share-2', status: 'nominal',
    team: '知识工程 Team', subject: '设备-故障图谱', unit: '知识检索台',
    location: '知识中心 · 图谱库', score: 89,
    tabs: ['实体', '关系', '检索'], readingLabel: '命中率',
    detail: '轴承外圈点蚀子图', reviewLabel: '已更新',
    assets: [
      { name: '故障模式图谱', score: 93, reading: '98.1%', status: 'nominal' },
      { name: '维修案例图谱', score: 90, reading: '96.8%', status: 'nominal' },
      { name: '备件关联图谱', score: 84, reading: '93.5%', status: 'warning' },
    ],
    measures: [
      { label: '实体数', value: '12.4k' },
      { label: '关系数', value: '38.1k' },
      { label: '命中率', value: '96.2 %' },
    ],
    events: ['新增 3 条故障-对策边', '相似案例 WO-2291 关联', '图谱版本回滚到 v2.1'],
  },
  {
    id: 'report', name: '报表生成', icon: 'file-text', status: 'nominal',
    team: '运营分析 Team', subject: '月度 KPI 汇总', unit: '报表工厂',
    location: '运营中心 · 报表室', score: 88,
    tabs: ['日报', '周报', '月报'], readingLabel: '完成度',
    detail: '本月运行指标日报', reviewLabel: '待发布',
    assets: [
      { name: '月度日报', score: 92, reading: '96.5%', status: 'nominal' },
      { name: '能耗周报', score: 88, reading: '94.1%', status: 'nominal' },
      { name: '质量月报', score: 79, reading: '90.8%', status: 'warning' },
    ],
    measures: [
      { label: '指标项', value: '42' },
      { label: '完成度', value: '95.0 %' },
      { label: '校验状态', value: '通过' },
    ],
    events: ['日报模板 v3 已应用', '能耗指标完成汇总', '质检数据源待补齐'],
  },
]

export function getWorkbenchApp(id: string | null | undefined): WorkbenchApp | undefined {
  return WORKBENCH_APPS.find((app) => app.id === id)
}
