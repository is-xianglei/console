import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// 注入一个 auth store，暴露可控制的 state.user。
const mockAuth = { state: { user: null as { id: number } | null } }
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => mockAuth,
}))

import { usePermissions, resolveCanModifiers } from './usePermissions'
beforeEach(() => {
  setActivePinia(createPinia())
  mockAuth.state.user = { id: 42 }
})

describe('usePermissions.can', () => {
  it('无规则组合默认允许', () => {
    const { can } = usePermissions()
    expect(can('edit', 'group', { id: 7 })).toEqual({ allowed: true })
  })

  it('不能删除当前登录用户；停用自己同样禁止', () => {
    const { can } = usePermissions()
    const result = can('delete', 'person', { id: 42 })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('当前登录用户')
    const toggle = can('toggle', 'person', { id: 42 })
    expect(toggle.allowed).toBe(false)
    expect(toggle.reason).toContain('当前登录用户')
  })

  it('删除他人允许', () => {
    const { can } = usePermissions()
    expect(can('delete', 'person', { id: 7 }).allowed).toBe(true)
  })

  it('非管理员不能操作管理员；管理员可操作管理员', () => {
    const { can } = usePermissions()
    expect(can('delete', 'person', { id: 7, role: 'admin', operatorRole: 'member' }).allowed).toBe(false)
    expect(can('toggle', 'person', { id: 7, role: 'admin', operatorRole: 'member' }).allowed).toBe(false)
    expect(can('delete', 'person', { id: 7, role: 'admin', operatorRole: 'admin' }).allowed).toBe(true)
  })

  it('workspace owner 不可移除', () => {
    const { can } = usePermissions()
    expect(can('remove', 'workspaceMember', { role: 'owner' }).allowed).toBe(false)
    expect(can('remove', 'workspaceMember', { role: 'admin' }).allowed).toBe(true)
  })

  it('未登录时（currentUserId 为空）不误判', () => {
    mockAuth.state.user = null
    const { can } = usePermissions()
    expect(can('delete', 'person', { id: 1 }).allowed).toBe(true)
  })
})

describe('vCan', () => {
  it('缺省隐藏、.disable 改 disabled + title', () => {
    // 直接测 resolveCanModifiers（DOM 行为在浏览器环境验证）。
    expect(resolveCanModifiers({ modifiers: {} }).mode).toBe('hide')
    expect(resolveCanModifiers({ modifiers: { disable: true } }).mode).toBe('disable')
  })
})
