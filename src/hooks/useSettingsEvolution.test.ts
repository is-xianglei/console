import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { ApiError } from '@/http'
import type { EvolutionPrefs, MemorySettings } from '@/interfaces/settings/evolution/model'
import { MECHANISM_REQUIRED_MESSAGE, useSettingsEvolution } from './useSettingsEvolution'

const toastAdd = vi.fn()
const api = vi.hoisted(() => ({
  getMemorySettings: vi.fn(),
  updateMemorySettings: vi.fn(),
  getEvolutionPrefs: vi.fn(),
  updateEvolutionPrefs: vi.fn(),
  getMyEvolutionCandidates: vi.fn(),
  approveMyEvolutionCandidate: vi.fn(),
  getEvolutionContributions: vi.fn(),
}))

vi.mock('@nuxt/ui/composables', () => ({
  useToast: () => ({ add: toastAdd }),
}))

vi.mock('@/http/settings/evolution', () => api)

function prefs(overrides: Partial<EvolutionPrefs> = {}): EvolutionPrefs {
  return { enabled: true, mechanisms: ['memory', 'skill', 'workflow'], min_support: 3, auto_approve_low_risk: false, ...overrides }
}

const memory: MemorySettings = { memory_enabled: true, memory_write_enabled: true, memory_count: 128 }

async function setup(initialPrefs = prefs()) {
  api.getMemorySettings.mockResolvedValue({ ...memory })
  api.getEvolutionPrefs.mockResolvedValue({ prefs: initialPrefs })
  api.getMyEvolutionCandidates.mockResolvedValue({ candidates: [], own_evidence_threshold: 0.6 })
  const scope = effectScope()
  const hook = scope.run(() => useSettingsEvolution())!
  await hook.load()
  return { hook, scope }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useSettingsEvolution', () => {
  it('取消最后一项进化机制时提示并且不发请求', async () => {
    const { hook, scope } = await setup(prefs({ mechanisms: ['skill'] }))
    await hook.setMechanisms([])
    expect(api.updateEvolutionPrefs).not.toHaveBeenCalled()
    expect(hook.prefs.value?.mechanisms).toEqual(['skill'])
    expect(toastAdd).toHaveBeenCalledWith({ title: MECHANISM_REQUIRED_MESSAGE, color: 'warning' })
    scope.stop()
  })

  it('取消其中一项机制时只提交 mechanisms 字段', async () => {
    const { hook, scope } = await setup()
    api.updateEvolutionPrefs.mockResolvedValue(prefs({ mechanisms: ['memory', 'workflow'] }))
    await hook.setMechanisms(['memory', 'workflow'])
    expect(api.updateEvolutionPrefs).toHaveBeenCalledWith({ mechanisms: ['memory', 'workflow'] })
    expect(hook.prefs.value?.mechanisms).toEqual(['memory', 'workflow'])
    scope.stop()
  })

  it('勾选结果与当前一致（仅顺序不同）时不发请求', async () => {
    const { hook, scope } = await setup()
    await hook.setMechanisms(['workflow', 'memory', 'skill'])
    expect(api.updateEvolutionPrefs).not.toHaveBeenCalled()
    scope.stop()
  })

  it('进化偏好保存失败时回滚并提示错误', async () => {
    const { hook, scope } = await setup()
    let rejectSave!: (error: unknown) => void
    api.updateEvolutionPrefs.mockReturnValue(new Promise((_, reject) => { rejectSave = reject }))
    const pending = hook.setMinSupport(8)
    // 乐观更新：请求返回前就显示新值，且控件处于保存中。
    expect(hook.prefs.value?.min_support).toBe(8)
    expect(hook.savingPrefs.min_support).toBe(true)
    rejectSave(new ApiError('沉淀门槛需在 2-20 之间', 'validation_error', 422))
    await pending
    expect(hook.prefs.value?.min_support).toBe(3)
    expect(hook.savingPrefs.min_support).toBe(false)
    expect(toastAdd).toHaveBeenCalledWith({ title: '沉淀门槛需在 2-20 之间', color: 'error' })
    scope.stop()
  })

  it('记忆开关保存失败时回滚', async () => {
    const { hook, scope } = await setup()
    api.updateMemorySettings.mockRejectedValue(new Error('network'))
    await hook.setMemoryToggle('memory_enabled', false)
    expect(api.updateMemorySettings).toHaveBeenCalledWith({ memory_enabled: false })
    expect(hook.memory.value?.memory_enabled).toBe(true)
    expect(toastAdd).toHaveBeenCalledWith({ title: '记忆设置更新失败', color: 'error' })
    scope.stop()
  })
})
