import { describe, expect, it } from 'vitest'
import { DEFAULT_MARKET_SECTION, getVisibleMarketSections, resolveMarketSection } from './sections'

const MEMBER = { role: 'member', isPlatformAdmin: false }
const WORKSPACE_ADMIN = { role: 'admin', isPlatformAdmin: false }
const PLATFORM_ADMIN = { role: 'member', isPlatformAdmin: true }

function visibleKeys(access: { role: string; isPlatformAdmin: boolean }) {
  return getVisibleMarketSections(access).map((section) => section.key)
}

describe('市场模块可见性', () => {
  it('普通成员只能浏览，看不到我的上架和审核队列', () => {
    expect(visibleKeys(MEMBER)).toEqual(['discover', 'installed', 'updates'])
  })

  it('工作区所有者或管理员能看到我的上架', () => {
    expect(visibleKeys(WORKSPACE_ADMIN)).toEqual(['discover', 'installed', 'updates', 'mine'])
    expect(visibleKeys({ role: 'owner', isPlatformAdmin: false })).toContain('mine')
  })

  it('审核队列只看平台管理员标记，不看工作区角色', () => {
    expect(visibleKeys(PLATFORM_ADMIN)).toEqual(['discover', 'installed', 'updates', 'review'])
    expect(visibleKeys({ role: 'owner', isPlatformAdmin: true })).toContain('review')
  })
})

describe('resolveMarketSection', () => {
  it('缺省或未知模块回落到发现', () => {
    expect(resolveMarketSection(undefined, MEMBER).key).toBe(DEFAULT_MARKET_SECTION)
    expect(resolveMarketSection('unknown', MEMBER).key).toBe('discover')
  })

  it('非平台管理员直接访问审核队列时回落到发现', () => {
    expect(resolveMarketSection('review', WORKSPACE_ADMIN).key).toBe('discover')
    expect(resolveMarketSection('review', PLATFORM_ADMIN).key).toBe('review')
  })

  it('普通成员访问我的上架时回落到发现', () => {
    expect(resolveMarketSection('mine', MEMBER).key).toBe('discover')
    expect(resolveMarketSection('mine', WORKSPACE_ADMIN).key).toBe('mine')
  })

  it('已安装与版本更新共用同一个组件', () => {
    const installed = resolveMarketSection('installed', MEMBER)
    const updates = resolveMarketSection('updates', MEMBER)
    expect(installed.component).toBe(updates.component)
  })
})
