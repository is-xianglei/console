import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '../http'
import { createSkill, deleteSkill, getSkillList, setSkillEnabled, updateSkill } from '../http/skill'
import type { SkillResponse } from '../interfaces/skill/model'
import { useSkillsStore } from './skills'

vi.mock('../http/skill', () => ({
  createSkill: vi.fn(),
  deleteSkill: vi.fn(),
  exportSkill: vi.fn(),
  getSkillDetail: vi.fn(),
  getSkillList: vi.fn(),
  replaceSkillBundle: vi.fn(),
  setSkillEnabled: vi.fn(),
  updateSkill: vi.fn(),
  uploadSkillBundle: vi.fn(),
  validateSkill: vi.fn(),
}))

function skill(id: number, name: string, overrides: Partial<SkillResponse> = {}): SkillResponse {
  return {
    id,
    workspace_id: 1,
    name,
    description: `${name} description`,
    version: '1.0.0',
    scope: 'workspace',
    is_enabled: true,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

/** 手动控制 resolve / reject 时机，用来断言请求中的乐观状态。 */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
})

describe('skills store 列表', () => {
  it('loadSkills 成功写入列表', async () => {
    const list = [skill(2, 'b'), skill(1, 'a', { is_enabled: false })]
    vi.mocked(getSkillList).mockResolvedValueOnce(list)
    const store = useSkillsStore()

    const error = await store.loadSkills()

    expect(error).toBeNull()
    expect(store.state.skills).toEqual(list)
    expect(store.state.skillsLoading).toBe(false)
  })

  it('loadSkills 失败返回错误信息', async () => {
    vi.mocked(getSkillList).mockRejectedValueOnce(new ApiError('网络错误', 'NETWORK', 500))
    const store = useSkillsStore()

    const error = await store.loadSkills()

    expect(error).toBe('网络错误')
    expect(store.state.skills).toEqual([])
    expect(store.state.skillsLoading).toBe(false)
  })

  it('resetSkills 后旧工作区的响应被丢弃', async () => {
    const pending = deferred<SkillResponse[]>()
    vi.mocked(getSkillList).mockReturnValueOnce(pending.promise)
    const store = useSkillsStore()

    const loading = store.loadSkills()
    store.resetSkills()
    pending.resolve([skill(1, 'a')])
    await loading

    expect(store.state.skills).toEqual([])
  })
})

describe('skills store 启用开关', () => {
  it('toggleEnabled 先乐观更新，请求中禁用，成功后采用服务端记录', async () => {
    const pending = deferred<SkillResponse>()
    vi.mocked(setSkillEnabled).mockReturnValueOnce(pending.promise)
    const store = useSkillsStore()
    store.state.skills = [skill(1, 'a')]

    const toggling = store.toggleEnabled(1, false)

    expect(setSkillEnabled).toHaveBeenCalledWith(1, { enabled: false })
    expect(store.state.skills[0].is_enabled).toBe(false)
    expect(store.state.togglingIds).toEqual([1])

    pending.resolve(skill(1, 'a', { is_enabled: false, updated_at: '2026-08-02T00:00:00Z' }))
    expect(await toggling).toBeNull()
    expect(store.state.skills[0].updated_at).toBe('2026-08-02T00:00:00Z')
    expect(store.state.togglingIds).toEqual([])
  })

  it('toggleEnabled 失败回滚并返回后端 message', async () => {
    vi.mocked(setSkillEnabled).mockRejectedValueOnce(new ApiError('无权执行该工作区操作', 'HTTP_ERROR', 403))
    const store = useSkillsStore()
    store.state.skills = [skill(1, 'a', { is_enabled: false })]

    const error = await store.toggleEnabled(1, true)

    expect(error).toBe('无权执行该工作区操作')
    expect(store.state.skills[0].is_enabled).toBe(false)
    expect(store.state.togglingIds).toEqual([])
  })

  it('同一 skill 请求中重复切换被忽略', async () => {
    const pending = deferred<SkillResponse>()
    vi.mocked(setSkillEnabled).mockReturnValueOnce(pending.promise)
    const store = useSkillsStore()
    store.state.skills = [skill(1, 'a')]

    const first = store.toggleEnabled(1, false)
    await store.toggleEnabled(1, true)

    expect(setSkillEnabled).toHaveBeenCalledOnce()
    pending.resolve(skill(1, 'a', { is_enabled: false }))
    await first
  })
})

describe('skills store 新建与更新', () => {
  it('createSkill 成功插到列表最前', async () => {
    const created = skill(3, 'c')
    vi.mocked(createSkill).mockResolvedValueOnce(created)
    const store = useSkillsStore()
    store.state.skills = [skill(1, 'a')]
    const payload = { name: 'c', description: 'c description', body: '# c' }

    const result = await store.createSkill(payload)

    expect(createSkill).toHaveBeenCalledWith(payload)
    expect(result).toEqual({ skill: created, error: null })
    expect(store.state.skills.map((item) => item.id)).toEqual([3, 1])
  })

  it('createSkill 409 返回 ApiError，列表不变', async () => {
    const conflict = new ApiError('skill 名称已存在: a', 'HTTP_ERROR', 409, { name: 'a' })
    vi.mocked(createSkill).mockRejectedValueOnce(conflict)
    const store = useSkillsStore()
    store.state.skills = [skill(1, 'a')]

    const result = await store.createSkill({ name: 'a', description: 'x', body: 'y' })

    expect(result.skill).toBeNull()
    expect(result.error?.status).toBe(409)
    expect(result.error?.details).toEqual({ name: 'a' })
    expect(store.state.skills).toHaveLength(1)
  })

  it('updateSkill 成功替换列表项并清掉过期详情', async () => {
    const updated = skill(1, 'a', { description: '新描述' })
    vi.mocked(updateSkill).mockResolvedValueOnce(updated)
    const store = useSkillsStore()
    store.state.skills = [skill(2, 'b'), skill(1, 'a')]
    store.state.skillDetail = { ...skill(1, 'a'), frontmatter: {}, resources: [], body: '# old' }
    const payload = { description: '新描述', body: '# new' }

    const result = await store.updateSkill(1, payload)

    expect(updateSkill).toHaveBeenCalledWith(1, payload)
    expect(result.skill).toEqual(updated)
    expect(store.state.skills.map((item) => item.description)).toEqual(['b description', '新描述'])
    expect(store.state.skillDetail).toBeNull()
  })

  it('updateSkill 422 透传 details.errors', async () => {
    const errors = [{ type: 'string_too_long', loc: ['body', 'description'], msg: 'too long', ctx: { max_length: 1024 } }]
    vi.mocked(updateSkill).mockRejectedValueOnce(new ApiError('参数校验失败', 'HTTP_ERROR', 422, { errors }))
    const store = useSkillsStore()

    const result = await store.updateSkill(1, { description: 'x', body: 'y' })

    expect(result.error?.status).toBe(422)
    expect(result.error?.details.errors).toEqual(errors)
  })
})

describe('skills store 删除', () => {
  it('removeSkill 成功移除并清空选中项', async () => {
    vi.mocked(deleteSkill).mockResolvedValueOnce({ deleted: true })
    const store = useSkillsStore()
    store.state.skills = [skill(1, 'a'), skill(2, 'b')]
    store.state.selectedSkillId = 1

    const result = await store.removeSkill(1)

    expect(deleteSkill).toHaveBeenCalledWith(1)
    expect(result).toEqual({ deleted: true, error: null })
    expect(store.state.skills.map((item) => item.id)).toEqual([2])
    expect(store.state.selectedSkillId).toBeNull()
    expect(getSkillList).not.toHaveBeenCalled()
  })

  it('removeSkill 返回 deleted:false 时本地移除并重拉列表', async () => {
    vi.mocked(deleteSkill).mockResolvedValueOnce({ deleted: false })
    vi.mocked(getSkillList).mockResolvedValueOnce([skill(2, 'b')])
    const store = useSkillsStore()
    store.state.skills = [skill(1, 'a'), skill(2, 'b')]

    const result = await store.removeSkill(1)

    expect(result).toEqual({ deleted: false, error: null })
    expect(store.state.skills.map((item) => item.id)).toEqual([2])
    expect(getSkillList).toHaveBeenCalledOnce()
  })

  it('removeSkill 失败返回后端 message 并保留列表', async () => {
    vi.mocked(deleteSkill).mockRejectedValueOnce(new ApiError('无权执行该工作区操作', 'HTTP_ERROR', 403))
    const store = useSkillsStore()
    store.state.skills = [skill(1, 'a')]

    const result = await store.removeSkill(1)

    expect(result).toEqual({ deleted: false, error: '无权执行该工作区操作' })
    expect(store.state.skills).toHaveLength(1)
  })
})
