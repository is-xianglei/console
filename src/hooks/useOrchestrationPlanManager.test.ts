import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import type { PlanResponse } from '@/interfaces/orchestration-plan/api'
import type { PlanFormModel } from '@/interfaces/orchestration-plan/model'
import { useOrchestrationPlansStore } from '@/stores/orchestrationPlans'
import {
  PLAN_MODE_LABEL,
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
