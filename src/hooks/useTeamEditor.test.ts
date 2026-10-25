import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTeamsStore } from '@/stores/teams'
import { useTeamEditor } from './useTeamEditor'

const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
}))
const toastAdd = vi.fn()
vi.mock('@nuxt/ui/composables', () => ({
  useToast: () => ({ add: toastAdd }),
}))

/** 把空白草稿补到可以通过校验：名称 + 两个成员 + 入口。 */
function fillValid(editor: ReturnType<typeof useTeamEditor>) {
  editor.draft.value.name = '回归测试 Team'
  editor.draft.value.members.push(
    { agentId: '1', agentName: '甲 Agent', duty: '', isEntry: false },
    { agentId: '2', agentName: '乙 Agent', duty: '', isEntry: false },
  )
  editor.draft.value.entryIndex = 0
}

describe('useTeamEditor', () => {
  beforeEach(() => {
    // routerPush / toastAdd 是模块级 mock，逐例清空调用记录，避免断言串到上一个用例。
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('issues 随草稿实时计算，改好后立即清空', () => {
    const editor = useTeamEditor()
    editor.openCreate()
    expect(editor.issues.value.map((issue) => issue.section)).toEqual(expect.arrayContaining(['basic', 'members']))
    fillValid(editor)
    expect(editor.issues.value).toEqual([])
  })

  it('Bug 1 回归：校验失败一次后修好问题，可以再次保存', async () => {
    const store = useTeamsStore()
    const editor = useTeamEditor()
    editor.openCreate()
    const onSaved = vi.fn()

    expect(await editor.saveDraft({ onSaved })).toBe(false)
    expect(onSaved).not.toHaveBeenCalled()
    expect(routerPush).not.toHaveBeenCalled()
    expect(store.findTeam(editor.draft.value.id)).toBeNull()

    fillValid(editor)
    expect(await editor.saveDraft({ onSaved })).toBe(true)
    expect(onSaved).toHaveBeenCalledOnce()
    expect(store.findTeam(editor.draft.value.id)?.name).toBe('回归测试 Team')
    expect(editor.error.value).toBe('')
  })

  it('Bug 2 回归：保存草稿保留当前状态，publish 提交启用状态（nominal）', async () => {
    const store = useTeamsStore()
    const draftEditor = useTeamEditor()
    draftEditor.openCreate()
    fillValid(draftEditor)
    expect(await draftEditor.saveDraft()).toBe(true)
    expect(store.findTeam(draftEditor.draft.value.id)?.status).toBe('idle')

    const publishEditor = useTeamEditor()
    publishEditor.openCreate()
    fillValid(publishEditor)
    expect(await publishEditor.publish()).toBe(true)
    expect(store.findTeam(publishEditor.draft.value.id)?.status).toBe('nominal')
    expect(publishEditor.draft.value.status).toBe('nominal')
    expect(toastAdd).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Team「回归测试 Team」已保存并启用' }))
  })

  it('publish 校验不通过时不改状态、不写入 store', async () => {
    const store = useTeamsStore()
    const editor = useTeamEditor()
    editor.openCreate()
    expect(await editor.publish()).toBe(false)
    expect(editor.draft.value.status).toBe('idle')
    expect(store.findTeam(editor.draft.value.id)).toBeNull()
  })

  it('新建：onSaved 在跳转之前调用，保存后回列表并高亮', async () => {
    const calls: string[] = []
    routerPush.mockImplementation(() => { calls.push('push') })
    const editor = useTeamEditor()
    editor.openCreate()
    fillValid(editor)
    // onSaved 被调用时已经是启用状态：页面在此重置的快照与随后跳转时的草稿一致。
    await editor.publish({ onSaved: () => { calls.push(`onSaved:${editor.draft.value.status}`) } })
    expect(calls).toEqual(['onSaved:nominal', 'push'])
    expect(routerPush).toHaveBeenCalledWith(expect.objectContaining({
      name: 'platform-resource',
      params: { module: 'build', resource: 'teams' },
      query: { highlight: editor.draft.value.id },
    }))
  })

  it('编辑：onSaved 在跳转之前调用，保存后去详情页', async () => {
    const store = useTeamsStore()
    store.ensureLoaded()
    const target = store.state.items[0]!
    const calls: string[] = []
    routerPush.mockImplementation(() => { calls.push('push') })
    const editor = useTeamEditor()
    await editor.openEdit(target.id)
    // 目录播种的成员行没有 Agent 名，先补齐才能通过校验。
    editor.draft.value.members.forEach((member, index) => { member.agentName = `Agent ${index + 1}` })
    expect(editor.issues.value).toEqual([])

    expect(await editor.saveDraft({ onSaved: () => { calls.push('onSaved') } })).toBe(true)
    expect(calls).toEqual(['onSaved', 'push'])
    expect(routerPush).toHaveBeenCalledWith({ name: 'team-detail', params: { id: target.id } })
  })

  it('openCreate 返回是否从已有 Team 复制', () => {
    const store = useTeamsStore()
    store.ensureLoaded()
    const editor = useTeamEditor()
    expect(editor.openCreate(store.state.items[0]!.id)).toBe(true)
    expect(editor.openCreate('TEAM-不存在')).toBe(false)
    expect(editor.openCreate()).toBe(false)
  })
})
