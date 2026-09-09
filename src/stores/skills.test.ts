import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '../http'
import { deleteSkill, getSkillList } from '../http/skill'
import type { SkillResponse } from '../interfaces/skill/model'
import { useSkillsStore } from './skills'

vi.mock('../http/skill', () => ({
  createSkill: vi.fn(),
  deleteSkill: vi.fn(),
  getSkillDetail: vi.fn(),
  getSkillList: vi.fn(),
  validateSkill: vi.fn(),
}))

function skill(name: string): SkillResponse {
  return {
    id: 1,
    workspace_id: 1,
    name,
    description: `${name} description`,
    version: '1.0.0',
    scope: 'team',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  }
}

describe('skills store 删除逻辑', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('removeSkill 失败返回后端 message', async () => {
    vi.mocked(deleteSkill).mockRejectedValueOnce(new ApiError('不支持删除该技能', 'SKILL_LOCKED', 409))
    const store = useSkillsStore()
    store.state.skills = [skill('a')]

    const error = await store.removeSkill('a')

    expect(error).toBe('不支持删除该技能')
    // 失败时保留列表，避免前后端状态不一致。
    expect(store.state.skills).toHaveLength(1)
  })

  it('removeSkill 成功清空选中项并返回 null', async () => {
    vi.mocked(deleteSkill).mockResolvedValueOnce({ deleted: true })
    const store = useSkillsStore()
    store.state.skills = [skill('a'), skill('b')]
    store.state.selectedSkillName = 'a'

    const error = await store.removeSkill('a')

    expect(error).toBeNull()
    expect(store.state.skills.map((item) => item.name)).toEqual(['b'])
    expect(store.state.selectedSkillName).toBe('')
  })

  it('loadSkills 失败返回错误信息', async () => {
    vi.mocked(getSkillList).mockRejectedValueOnce(new ApiError('网络错误', 'NETWORK', 500))
    const store = useSkillsStore()

    const error = await store.loadSkills()

    expect(error).toBe('网络错误')
    expect(store.state.skills).toEqual([])
    expect(store.state.skillsLoading).toBe(false)
  })
})
