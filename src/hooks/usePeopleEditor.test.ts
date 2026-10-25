import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '@/http'
import type { UserResponse } from '@/interfaces/user/model'
import type { WorkspaceResponse } from '@/interfaces/workspace/model'
import { useAuthStore } from '@/stores/auth'
import {
  emptyPersonForm,
  personFormToPayload,
  personToForm,
  usePeopleEditor,
  validatePerson,
} from './usePeopleEditor'

// 编辑器已不依赖路由；保留 router mock 只为断言「保存后不跳转」。
const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
}))

const toastAdd = vi.fn()
vi.mock('@nuxt/ui/composables', () => ({
  useToast: () => ({ add: toastAdd }),
}))

const createUser = vi.fn()
const getUserDetail = vi.fn()
const updateUser = vi.fn()
vi.mock('@/http/user', () => ({
  createUser: (...args: unknown[]) => createUser(...args),
  getUserDetail: (...args: unknown[]) => getUserDetail(...args),
  updateUser: (...args: unknown[]) => updateUser(...args),
}))

const inviteWorkspaceMember = vi.fn()
vi.mock('@/http/workspace', () => ({
  inviteWorkspaceMember: (...args: unknown[]) => inviteWorkspaceMember(...args),
}))

function user(): UserResponse {
  return {
    id: 7,
    username: 'zhangsan',
    email: 'zhangsan@example.com',
    full_name: '张三',
    avatar_url: 'https://img.example.com/a.png',
    phone: '13800000000',
    auth_provider: 'local',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  }
}

function workspace(): WorkspaceResponse {
  return {
    id: 3,
    name: 'demo',
    slug: 'demo',
    display_name: '演示工作区',
    workspace_type: 'team',
    suspended: false,
    plan: 'free',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  }
}

/** 填满新建表单的必填项。 */
function fillCreate(editor: ReturnType<typeof usePeopleEditor>) {
  editor.draft.value.fullName = '李四'
  editor.draft.value.username = 'lisi'
  editor.draft.value.email = 'lisi@example.com'
  editor.draft.value.password = 'secret123'
}

describe('usePeopleEditor', () => {
  beforeEach(() => {
    routerPush.mockReset()
    toastAdd.mockReset()
    createUser.mockReset()
    getUserDetail.mockReset()
    updateUser.mockReset()
    inviteWorkspaceMember.mockReset()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
    setActivePinia(createPinia())
    // 无 token 时 currentWorkspaceId 为 null，编辑器回退到 currentWorkspace(workspaces[0]).id。
    useAuthStore().state.workspaces = [workspace()]
  })

  it('纯函数：personToForm / validatePerson / personFormToPayload', () => {
    const form = personToForm(user())
    expect(form.id).toBe(7)
    expect(form.username).toBe('zhangsan')
    expect(form.password).toBe('')
    expect(form.inviteToWorkspace).toBe(false)
    expect(validatePerson(form)).toEqual([])
    // 新建校验姓名/用户名/邮箱/密码，编辑只校验姓名。
    const empty = emptyPersonForm()
    expect(validatePerson(empty).map((issue) => issue.field)).toEqual(['fullName', 'username', 'email', 'password'])
    expect(validatePerson({ ...empty, fullName: '李四', username: 'lisi', email: 'lisi@example.com', password: '1234567' }).map((issue) => issue.field)).toEqual(['password'])
    expect(validatePerson({ ...form, fullName: '  ' }).map((issue) => issue.field)).toEqual(['fullName'])
    // 新建 payload 不含头像/手机；编辑 payload 不含用户名/邮箱/密码。
    expect(personFormToPayload({ ...empty, fullName: ' 李四 ', username: ' lisi ', email: ' lisi@example.com ', password: 'secret123' }))
      .toEqual({ username: 'lisi', email: 'lisi@example.com', password: 'secret123', full_name: '李四' })
    expect(personFormToPayload({ ...form, avatarUrl: '  ', phone: '' }))
      .toEqual({ full_name: '张三', avatar_url: null, phone: null })
  })

  it('openCreate 建立空草稿(默认开启邀请)', () => {
    const editor = usePeopleEditor()
    editor.openCreate()
    expect(editor.draft.value.id).toBeNull()
    expect(editor.draft.value.fullName).toBe('')
    expect(editor.draft.value.inviteToWorkspace).toBe(true)
    expect(editor.createdUserId.value).toBeNull()
    expect(editor.workspaceId.value).toBe(3)
  })

  it('openEdit 用 getUserDetail 填充 draft', async () => {
    getUserDetail.mockResolvedValue(user())
    const editor = usePeopleEditor()
    const ok = await editor.openEdit(7)
    expect(ok).toBe(true)
    expect(getUserDetail).toHaveBeenCalledWith(7)
    expect(editor.draft.value.id).toBe(7)
    expect(editor.draft.value.fullName).toBe('张三')
    expect(editor.draft.value.phone).toBe('13800000000')
    expect(editor.loadingDetail.value).toBe(false)
  })

  it('openEdit 详情失败时返回 false 并设置错误', async () => {
    getUserDetail.mockRejectedValue(new ApiError('用户不存在', 'NOT_FOUND', 404))
    const editor = usePeopleEditor()
    const ok = await editor.openEdit(7)
    expect(ok).toBe(false)
    expect(editor.error.value).toBe('用户不存在')
    expect(editor.draft.value.id).toBeNull()
  })

  it('saveDraft 校验不通过不提交', async () => {
    const editor = usePeopleEditor()
    editor.openCreate()
    editor.draft.value.fullName = '李四'
    editor.draft.value.username = 'lisi'
    editor.draft.value.email = 'lisi@example.com'
    editor.draft.value.password = 'short'
    expect(await editor.saveDraft()).toBe(false)
    expect(createUser).not.toHaveBeenCalled()
    expect(inviteWorkspaceMember).not.toHaveBeenCalled()
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('saveDraft 新建成功：createUser → inviteWorkspaceMember → toast + onSaved，不跳转', async () => {
    createUser.mockResolvedValue({ ...user(), id: 9, username: 'lisi', email: 'lisi@example.com', full_name: '李四' })
    inviteWorkspaceMember.mockResolvedValue({})
    const onSaved = vi.fn()
    const editor = usePeopleEditor()
    editor.openCreate()
    fillCreate(editor)
    const ok = await editor.saveDraft({ onSaved })
    expect(ok).toBe(true)
    expect(createUser).toHaveBeenCalledWith({ username: 'lisi', email: 'lisi@example.com', password: 'secret123', full_name: '李四' })
    expect(inviteWorkspaceMember).toHaveBeenCalledWith(3, { email: 'lisi@example.com', role: 'member' })
    expect(editor.error.value).toBe('')
    expect(editor.createdUserId.value).toBeNull()
    expect(toastAdd).toHaveBeenCalledWith({ title: '人员「李四」已创建', color: 'success' })
    expect(onSaved).toHaveBeenCalledWith(9)
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('saveDraft 关闭邀请开关时只创建用户不发邀请', async () => {
    createUser.mockResolvedValue({ ...user(), id: 9 })
    const onSaved = vi.fn()
    const editor = usePeopleEditor()
    editor.openCreate()
    fillCreate(editor)
    editor.draft.value.inviteToWorkspace = false
    expect(await editor.saveDraft({ onSaved })).toBe(true)
    expect(inviteWorkspaceMember).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalledWith(9)
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('saveDraft 创建成功但邀请失败：保留 createdUser、不回调；重试只重发邀请，成功后才回调', async () => {
    createUser.mockResolvedValue({ ...user(), id: 9, email: 'lisi@example.com' })
    inviteWorkspaceMember.mockRejectedValueOnce(new ApiError('该邮箱已在工作区中', 'CONFLICT', 409))
    const onSaved = vi.fn()
    const editor = usePeopleEditor()
    editor.openCreate()
    fillCreate(editor)
    const ok = await editor.saveDraft({ onSaved })
    expect(ok).toBe(false)
    expect(editor.error.value).toBe('用户已创建但邀请失败：该邮箱已在工作区中')
    expect(editor.createdUserId.value).toBe(9)
    expect(onSaved).not.toHaveBeenCalled()
    expect(toastAdd).not.toHaveBeenCalled()
    // 重试：不再调用 createUser，只重发邀请；成功后 toast + 回调，仍不跳转。
    inviteWorkspaceMember.mockResolvedValueOnce({})
    expect(await editor.saveDraft({ onSaved })).toBe(true)
    expect(createUser).toHaveBeenCalledTimes(1)
    expect(inviteWorkspaceMember).toHaveBeenCalledTimes(2)
    expect(editor.error.value).toBe('')
    expect(editor.createdUserId.value).toBeNull()
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onSaved).toHaveBeenCalledWith(9)
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('邀请失败后 skipInvite 清掉 createdUser 与 error 并返回已创建用户 id，不跳转', async () => {
    createUser.mockResolvedValue({ ...user(), id: 9 })
    inviteWorkspaceMember.mockRejectedValue(new Error('network'))
    const editor = usePeopleEditor()
    editor.openCreate()
    fillCreate(editor)
    expect(await editor.saveDraft()).toBe(false)
    expect(editor.error.value).toBe('用户已创建但邀请失败：工作区邀请发送失败')
    expect(editor.skipInvite()).toBe(9)
    expect(editor.createdUserId.value).toBeNull()
    expect(editor.error.value).toBe('')
    // 再次调用没有待处理的已创建用户。
    expect(editor.skipInvite()).toBeNull()
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('saveDraft 第一步 createUser 失败时不发邀请、不回调', async () => {
    createUser.mockRejectedValue(new ApiError('邮箱已被使用', 'CONFLICT', 409))
    const onSaved = vi.fn()
    const editor = usePeopleEditor()
    editor.openCreate()
    fillCreate(editor)
    expect(await editor.saveDraft({ onSaved })).toBe(false)
    expect(editor.error.value).toBe('邮箱已被使用')
    expect(inviteWorkspaceMember).not.toHaveBeenCalled()
    expect(editor.createdUserId.value).toBeNull()
    expect(onSaved).not.toHaveBeenCalled()
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('saveDraft 编辑态调用 updateUser：失败写入 error 不回调；成功 toast + onSaved，不跳转', async () => {
    getUserDetail.mockResolvedValue(user())
    updateUser.mockRejectedValueOnce(new ApiError('用户更新失败', 'ERROR', 500))
    const onSaved = vi.fn()
    const editor = usePeopleEditor()
    await editor.openEdit(7)
    editor.draft.value.fullName = '张三丰'
    editor.draft.value.phone = ''
    expect(await editor.saveDraft({ onSaved })).toBe(false)
    expect(updateUser).toHaveBeenCalledWith(7, { full_name: '张三丰', avatar_url: 'https://img.example.com/a.png', phone: null })
    expect(editor.error.value).toBe('用户更新失败')
    expect(onSaved).not.toHaveBeenCalled()
    updateUser.mockResolvedValueOnce({ ...user(), full_name: '张三丰', phone: null })
    expect(await editor.saveDraft({ onSaved })).toBe(true)
    expect(createUser).not.toHaveBeenCalled()
    expect(editor.draft.value.phone).toBe('')
    expect(toastAdd).toHaveBeenCalledWith({ title: '人员「张三丰」已保存', color: 'success' })
    expect(onSaved).toHaveBeenCalledWith(7)
    expect(routerPush).not.toHaveBeenCalled()
  })
})
