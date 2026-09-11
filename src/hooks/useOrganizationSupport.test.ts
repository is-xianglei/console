import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDepartmentsStore } from '@/stores/departments'
import { SELECT_NONE_VALUE, useOrganizationSupport } from './useOrganizationSupport'

describe('useOrganizationSupport select options', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('uses a non-empty sentinel for empty department selections', () => {
    const departments = useDepartmentsStore()
    departments.state.items = [
      {
        id: 1,
        workspace_id: 3,
        name: '研发部',
        sort_order: 0,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]
    const support = useOrganizationSupport()
    expect(SELECT_NONE_VALUE).not.toBe('')
    expect(support.departmentOptions.value[0]).toEqual({ value: SELECT_NONE_VALUE, label: '未分配部门' })
    expect(support.parentDepartmentOptions(null)[0]).toEqual({ value: SELECT_NONE_VALUE, label: '无上级部门' })
    expect([...support.departmentOptions.value, ...support.parentDepartmentOptions(null)]).not.toContainEqual(expect.objectContaining({ value: '' }))
  })
})
