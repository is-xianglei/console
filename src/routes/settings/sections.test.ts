import { describe, expect, it } from 'vitest'
import {
  getVisibleSettingsSections,
  legacyProfileSection,
  resolveSettingsSection,
} from './sections'

describe('设置模块注册表', () => {
  it('普通成员看不到工具权限、模型服务与服务配置', () => {
    expect(getVisibleSettingsSections('member').map((section) => section.key)).toEqual([
      'profile', 'password', 'workspaces', 'evolution', 'channels',
    ])
    expect(getVisibleSettingsSections(undefined).some((section) => section.key === 'models')).toBe(false)
  })

  it('owner / admin 可见全部模块，顺序与注册一致', () => {
    for (const role of ['owner', 'admin'] as const) {
      expect(getVisibleSettingsSections(role).map((section) => section.key)).toEqual([
        'profile', 'password', 'workspaces', 'tools', 'evolution', 'channels', 'models', 'services',
      ])
    }
  })

  it('缺省、未知或无权访问的模块回落到个人信息', () => {
    expect(resolveSettingsSection(undefined, 'member').key).toBe('profile')
    expect(resolveSettingsSection('unknown', 'owner').key).toBe('profile')
    expect(resolveSettingsSection('models', 'member').key).toBe('profile')
    expect(resolveSettingsSection('models', 'admin').key).toBe('models')
    expect(resolveSettingsSection('tools', null).key).toBe('profile')
    expect(resolveSettingsSection('tools', 'member').key).toBe('profile')
    expect(resolveSettingsSection('tools', 'admin').key).toBe('tools')
  })

  it('旧个人资料页 tab 映射到设置模块', () => {
    expect(legacyProfileSection('workspaces')).toBe('workspaces')
    expect(legacyProfileSection('password')).toBe('password')
    expect(legacyProfileSection('profile')).toBe('profile')
    expect(legacyProfileSection(undefined)).toBe('profile')
  })
})
