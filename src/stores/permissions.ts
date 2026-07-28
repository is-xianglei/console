import { defineStore } from 'pinia'
import { reactive } from 'vue'
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

  /** 新增或更新权限规则，成功后刷新列表。 */
  async function savePermissionRule(payload: PermissionRuleCreate): Promise<boolean> {
    const generation = dataGeneration
    try {
      await updatePermissionRule(payload)
      if (generation !== dataGeneration) return false
      await loadPermissionRules()
      return true
    } catch {
      return false
    }
  }

  /** 删除权限规则，成功后从当前列表移除。 */
  async function removePermissionRule(ruleId: number) {
    const generation = dataGeneration
    try {
      await deletePermissionRule(ruleId)
      if (generation === dataGeneration) {
        state.permissionRules = state.permissionRules.filter((rule) => rule.id !== ruleId)
      }
    } catch {
      // 删除失败时保留列表，避免前后端状态不一致。
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
