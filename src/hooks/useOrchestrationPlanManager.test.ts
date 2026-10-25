import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import type { PlanResponse } from '@/interfaces/orchestration-plan/api'
import type { PlanFormModel } from '@/interfaces/orchestration-plan/model'
import { useOrchestrationPlansStore } from '@/stores/orchestrationPlans'
import {
  PLAN_MODE_LABEL,
  planIssueFieldName,
  planIssueStep,
  useOrchestrationPlanManager,
  validatePlan,
} from './useOrchestrationPlanManager'

const routeState = reactive({
  name: 'platform-resource',
  params: { module: 'build', resource: 'plans' },
  query: {} as Record<string, unknown>,
})
const router = {
  push: vi.fn(async (to: { query: Record<string, unknown> }) => { routeState.query = { ...to.query } }),
  replace: vi.fn(async (to: { query: Record<string, unknown> }) => { routeState.query = { ...to.query } }),
}

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => router,
}))

function plan(overrides: Partial<PlanResponse> = {}): PlanResponse {
  return {
    id: 5,
    workspace_id: 3,
    name: '故障诊断',
    description: null,
    mode: 'sequential',
    config: {},
    is_enabled: true,
    created_by_user_id: 2,
    members: [
      { id: 11, agent_id: 7, agent_name: '设备诊断', position: 0, role_config: {}, is_available: true },
      { id: 12, agent_id: 8, agent_name: '日志分析', position: 1, role_config: {}, is_available: true },
    ],
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-02T00:00:00Z',
    ...overrides,
  }
}

describe('useOrchestrationPlanManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.query = {}
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
    setActivePinia(createPinia())
  })

  it('关键字与模式筛选只保留匹配项', () => {
    const plansStore = useOrchestrationPlansStore()
    plansStore.state.items = [
      plan(),
      plan({ id: 6, name: '排程优化', mode: 'parallel' }),
    ]
    plansStore.state.total = 2

    const manager = useOrchestrationPlanManager()
    manager.search.value = '故障'
    expect(manager.filteredPlans.value.map((item) => item.id)).toEqual([5])

    manager.search.value = ''
    manager.modeFilter.value = 'parallel'
    expect(manager.filteredPlans.value.map((item) => item.id)).toEqual([6])
  })

  it('toggleEnabled 先翻转本地 is_enabled，成功时复用完整成员载荷提交', async () => {
    const plansStore = useOrchestrationPlansStore()
    const source = plan()
    plansStore.state.items = [source]
    plansStore.state.total = 1
    // 注入替身：savePlan 直接返回翻转后的对象，避免真实请求。
    plansStore.savePlan = vi.fn().mockImplementation(async (input) => ({
      item: { ...source, is_enabled: input.isEnabled },
      error: null,
    }))

    const manager = useOrchestrationPlanManager()
    // 乐观：未等接口返回即已翻转本地 is_enabled。
    const pending = manager.toggleEnabled(source)
    expect(source.is_enabled).toBe(false)
    expect(await pending).toBe(true)
    expect(plansStore.savePlan).toHaveBeenCalledWith(expect.objectContaining({ id: 5, isEnabled: false }))
  })

  it('toggleEnabled 失败时回滚本地 is_enabled（store 重拉收敛），不再出现与服务端不一致', async () => {
    const plansStore = useOrchestrationPlansStore()
    const source = plan()
    plansStore.state.items = [source]
    plansStore.state.total = 1
    // 注入替身：savePlan 失败并在 catch 里调 loadPlans 重拉；loadPlans 用服务端原始数据覆盖 items。
    plansStore.savePlan = vi.fn().mockImplementation(async () => {
      await plansStore.loadPlans()
      return { item: null, error: '编排方案保存失败' }
    })
    plansStore.loadPlans = vi.fn().mockImplementation(async () => {
      plansStore.state.items = [plan()]
      return null
    })

    const manager = useOrchestrationPlanManager()
    expect(await manager.toggleEnabled(source)).toBe(false)
    // 失败后该行回滚到服务端真实状态（重新启用）。
    expect(plansStore.state.items[0]!.is_enabled).toBe(true)
    expect(plansStore.state.items[0]!.id).toBe(5)
  })

  it('批量停用只翻转选中项，未选中项保持原状', async () => {
    const plansStore = useOrchestrationPlansStore()
    const first = plan()
    const second = plan({ id: 6, name: '排程优化', mode: 'parallel' })
    plansStore.state.items = [first, second]
    plansStore.state.total = 2
    plansStore.savePlan = vi.fn().mockImplementation(async (input) => ({
      item: { ...(input.id === 5 ? first : second), is_enabled: input.isEnabled },
      error: null,
    }))

    const manager = useOrchestrationPlanManager()
    manager.selectedIds.value = ['5', '6']
    await manager.batchDisable()
    expect(plansStore.state.items[0]!.is_enabled).toBe(false)
    expect(plansStore.state.items[1]!.is_enabled).toBe(false)
    expect(manager.selectedIds.value).toEqual([])
  })

  it('PLAN_MODE_LABEL 与 validatePlan 对合法表单不产生问题', () => {
    expect(PLAN_MODE_LABEL.sequential).toBe('顺序执行')
    expect(PLAN_MODE_LABEL.parallel).toBe('并行执行')
    expect(PLAN_MODE_LABEL.routing).toBe('智能路由')
    expect(PLAN_MODE_LABEL.loop).toBe('循环迭代')
    const form: PlanFormModel = {
      id: null,
      workspaceId: null,
      createdByUserId: null,
      name: '故障诊断',
      description: '',
      mode: 'sequential',
      maxIterations: 3,
      fallback: '',
      isEnabled: true,
      members: [
        { agentId: 7, agentName: '设备诊断', routeKey: '', when: '', isAvailable: true },
        { agentId: 8, agentName: '日志分析', routeKey: '', when: '', isAvailable: true },
      ],
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    }
    expect(validatePlan(form)).toEqual([])
  })
})

describe('validatePlan 的 issue → Builder 步骤 / 字段', () => {
  function form(overrides: Partial<PlanFormModel> = {}): PlanFormModel {
    return {
      id: null,
      workspaceId: null,
      createdByUserId: null,
      name: '故障诊断',
      description: '',
      mode: 'sequential',
      maxIterations: 3,
      fallback: '',
      isEnabled: true,
      members: [
        { agentId: 7, agentName: '设备诊断', routeKey: 'device', when: '设备问题', isAvailable: true },
        { agentId: 8, agentName: '日志分析', routeKey: 'logs', when: '日志问题', isAvailable: true },
      ],
      createdAt: '',
      updatedAt: '',
      ...overrides,
    }
  }

  /** [步骤, UFormField name, 消息] 三元组，便于整体断言。 */
  function mapped(plan: PlanFormModel) {
    return validatePlan(plan).map((issue) => [planIssueStep(issue), planIssueFieldName(issue), issue.message])
  }

  it('名称 → basic；成员数量 → members', () => {
    expect(mapped(form({ name: '  ', members: [] }))).toEqual([
      ['basic', 'name', '名称不能为空。'],
      ['members', 'members', '成员数量需在 2-5 个之间，当前 0 个。'],
    ])
  })

  it('成员重复、成员已停用 → members', () => {
    const plan = form()
    plan.members.push({ ...plan.members[0]! })
    plan.members[1]!.isAvailable = false
    expect(mapped(plan)).toEqual([
      ['members', 'members', '设备诊断 重复加入，同一 Agent 只能加入一次。'],
      ['members', 'members', '日志分析 已停用，方案将无法运行。'],
    ])
  })

  it('loop：循环轮数 → config', () => {
    expect(mapped(form({ mode: 'loop', maxIterations: 0 }))).toEqual([
      ['config', 'maxIterations', '循环轮数必须是 1-10 的整数。'],
    ])
  })

  it('routing：路由标识 / 触发条件 → order（落到对应行），兜底路由 → config', () => {
    const plan = form({ mode: 'routing', fallback: 'ghost' })
    plan.members = [
      { agentId: 7, agentName: '设备诊断', routeKey: '', when: '', isAvailable: true },
      { agentId: 8, agentName: '日志分析', routeKey: 'billing', when: '账单问题', isAvailable: true },
      { agentId: 9, agentName: '工单', routeKey: ' billing ', when: '工单问题', isAvailable: true },
    ]
    expect(mapped(plan)).toEqual([
      ['order', 'routeKey-0', '成员 设备诊断 缺少路由标识。'],
      ['order', 'when-0', '成员 设备诊断 缺少触发条件描述。'],
      // 重复的路由标识标在第二次出现的那一行。
      ['order', 'routeKey-2', '路由标识 billing 重复，方案内必须唯一。'],
      // 回归：旧实现按消息里的「路由标识」字样匹配，兜底路由被错归到 routeKey--1。
      ['config', 'fallback', '兜底路由 ghost 未命中任何成员的路由标识。'],
    ])
  })

  it('字段定位不依赖消息文本：成员名互相包含时仍落到各自的行', () => {
    const plan = form({ mode: 'routing' })
    plan.members[0]!.agentName = '分析'
    plan.members[0]!.when = ''
    plan.members[1]!.when = ''
    expect(validatePlan(plan).map(planIssueFieldName)).toEqual(['when-0', 'when-1'])
  })

  it('sequential / parallel 不产生 config 问题：loop 切回 sequential 后没有指向已消失步骤的 issue', () => {
    const plan = form({ mode: 'loop', maxIterations: 0, fallback: 'ghost' })
    expect(validatePlan(plan).map(planIssueStep)).toEqual(['config'])
    for (const mode of ['sequential', 'parallel'] as const) {
      plan.mode = mode
      expect(validatePlan(plan)).toEqual([])
    }
  })
})
