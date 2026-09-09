import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { ApiError } from '@/http'
import {
  deletePermissionRule,
  getPermissionRuleList,
  updatePermissionRule,
} from '../http/permission'
import type { PermissionRuleCreate } from '../interfaces/permission/api'
import type { PermissionRule } from '../interfaces/permission/model'

interface PermissionsState {
  permissionRules: PermissionRule[]
  permissionRulesLoading: boolean
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

export const usePermissionsStore = defineStore('permissions', () => {
  let dataGeneration = 0

  const state = reactive<PermissionsState>({
    permissionRules: [],
    permissionRulesLoading: false,
  })

  /** 清空工作区绑定数据，并让旧工作区的异步响应失效。 */
  function resetPermissions() {
    dataGeneration += 1
    state.permissionRules = []
    state.permissionRulesLoading = false
  }

  /** 拉取权限规则列表，可按作用域过滤；失败置空，不打断页面交互。 */
  async function loadPermissionRules(scope?: string) {
    const generation = dataGeneration
    state.permissionRulesLoading = true
    try {
      const rules = await getPermissionRuleList(scope ? { scope } : undefined)
      if (generation === dataGeneration) state.permissionRules = rules
    } catch {
      if (generation === dataGeneration) state.permissionRules = []
    } finally {
      if (generation === dataGeneration) state.permissionRulesLoading = false
    }
  }

  /** 新增或更新权限规则，成功后刷新列表；失败返回可展示的错误信息。 */
  async function savePermissionRule(payload: PermissionRuleCreate): Promise<string | null> {
    const generation = dataGeneration
    try {
      await updatePermissionRule(payload)
      if (generation !== dataGeneration) return null
      await loadPermissionRules()
      return null
    } catch (error) {
      return errorMessage(error, '规则保存失败')
    }
  }

  /** 删除权限规则，成功后从当前列表移除；失败返回可展示的错误信息。 */
  async function removePermissionRule(ruleId: number): Promise<string | null> {
    const generation = dataGeneration
    try {
      await deletePermissionRule(ruleId)
      if (generation === dataGeneration) {
        state.permissionRules = state.permissionRules.filter((rule) => rule.id !== ruleId)
      }
      return null
    } catch (error) {
      return errorMessage(error, '规则删除失败')
    }
  }

  return {
    state,
    resetPermissions,
    loadPermissionRules,
    savePermissionRule,
    removePermissionRule,
  }
})
