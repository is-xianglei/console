import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { ApiError } from '../http'
import {
  createSkill,
  deleteSkill,
  exportSkill,
  getSkillDetail,
  getSkillList,
  replaceSkillBundle,
  setSkillEnabled,
  updateSkill,
  uploadSkillBundle,
  validateSkill,
} from '../http/skill'
import type { SkillCreateRequest, SkillUpdateRequest, SkillValidateResult } from '../interfaces/skill/api'
import type { SkillDetailResponse, SkillResponse } from '../interfaces/skill/model'

interface SkillsState {
  skills: SkillResponse[]
  skillsLoading: boolean
  skillDetail: SkillDetailResponse | null
  skillDetailLoading: boolean
  selectedSkillId: number | null
  skillUploading: boolean
  /** 正在切换启用状态的 skill id，对应开关禁用。 */
  togglingIds: number[]
}

/** 详情加载失败：带状态码，页面据此区分 404（不存在）与 400（旧数据缺 frontmatter）。 */
export interface SkillLoadError {
  message: string
  status: number
}

/** 写操作结果：成功带记录，失败带 ApiError（422 的 details 供表单映射字段）。 */
export interface SkillMutationResult {
  skill: SkillResponse | null
  error: ApiError | null
}

/** 删除结果：deleted 为 false 表示服务端已不存在该记录。 */
export interface SkillRemoveResult {
  deleted: boolean
  error: string | null
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

function toApiError(error: unknown, fallback: string): ApiError {
  return error instanceof ApiError ? error : new ApiError(fallback, 'UNKNOWN', 0)
}

export const useSkillsStore = defineStore('skills', () => {
  let dataGeneration = 0

  const state = reactive<SkillsState>({
    skills: [],
    skillsLoading: false,
    skillDetail: null,
    skillDetailLoading: false,
    selectedSkillId: null,
    skillUploading: false,
    togglingIds: [],
  })

  /** 清空工作区绑定数据，并让旧工作区的异步响应失效。 */
  function resetSkills() {
    dataGeneration += 1
    state.skills = []
    state.skillsLoading = false
    state.skillDetail = null
    state.skillDetailLoading = false
    state.selectedSkillId = null
    state.skillUploading = false
    state.togglingIds = []
  }

  /** 列表里有同 id 的项就替换，保持原位置。 */
  function replaceListItem(skill: SkillResponse) {
    state.skills = state.skills.map((item) => (item.id === skill.id ? skill : item))
  }

  /** 详情里的元数据跟着写操作结果同步；正文 / frontmatter 变化需重新拉详情。 */
  function patchDetail(skill: SkillResponse) {
    if (state.skillDetail?.id === skill.id) state.skillDetail = { ...state.skillDetail, ...skill }
  }

  /** 拉取 skill 列表；失败置空并返回可直接展示的错误信息。 */
  async function loadSkills(): Promise<string | null> {
    const generation = dataGeneration
    state.skillsLoading = true
    try {
      const skills = await getSkillList()
      if (generation === dataGeneration) state.skills = skills
      return null
    } catch (error) {
      if (generation === dataGeneration) state.skills = []
      return errorMessage(error, '技能列表加载失败')
    } finally {
      if (generation === dataGeneration) state.skillsLoading = false
    }
  }

  /** 选中并加载某个 skill 的详情；失败清空详情并返回错误信息与状态码。 */
  async function selectSkill(id: number): Promise<SkillLoadError | null> {
    const generation = dataGeneration
    const isCurrent = () => generation === dataGeneration && state.selectedSkillId === id
    state.selectedSkillId = id
    state.skillDetail = null
    state.skillDetailLoading = true
    try {
      const detail = await getSkillDetail(id)
      if (isCurrent()) state.skillDetail = detail
      return null
    } catch (error) {
      if (isCurrent()) state.skillDetail = null
      return {
        message: errorMessage(error, '技能详情加载失败'),
        status: error instanceof ApiError ? error.status : 0,
      }
    } finally {
      if (isCurrent()) state.skillDetailLoading = false
    }
  }

  /** 预检 zip。400（超 8 MiB 等）返回 error，其余以 result.ok 为准。 */
  async function validateBundleAction(file: File): Promise<{ result: SkillValidateResult | null; error: string | null }> {
    try {
      return { result: await validateSkill(file), error: null }
    } catch (error) {
      return { result: null, error: errorMessage(error, '预检失败') }
    }
  }

  /** 上传 zip 新建；成功后重拉列表（同名复活会沿用旧 id，列表顺序以服务端为准）。 */
  async function uploadBundleAction(file: File): Promise<SkillMutationResult> {
    const generation = dataGeneration
    state.skillUploading = true
    try {
      const created = await uploadSkillBundle(file)
      if (generation === dataGeneration) await loadSkills()
      return { skill: created, error: null }
    } catch (error) {
      return { skill: null, error: toApiError(error, '上传失败') }
    } finally {
      if (generation === dataGeneration) state.skillUploading = false
    }
  }

  /** 用 zip 覆盖指定 skill；只同步列表项，详情内容整体变化由页面重新拉取。 */
  async function replaceBundleAction(id: number, file: File): Promise<SkillMutationResult> {
    const generation = dataGeneration
    state.skillUploading = true
    try {
      const updated = await replaceSkillBundle(id, file)
      if (generation === dataGeneration) replaceListItem(updated)
      return { skill: updated, error: null }
    } catch (error) {
      return { skill: null, error: toApiError(error, '覆盖失败') }
    } finally {
      if (generation === dataGeneration) state.skillUploading = false
    }
  }

  /** JSON 新建。 */
  async function createSkillAction(payload: SkillCreateRequest): Promise<SkillMutationResult> {
    const generation = dataGeneration
    try {
      const created = await createSkill(payload)
      if (generation === dataGeneration) {
        // 列表按创建时间倒序：新建放最前；同名复活沿用旧 id，先去重。
        state.skills = [created, ...state.skills.filter((item) => item.id !== created.id)]
      }
      return { skill: created, error: null }
    } catch (error) {
      return { skill: null, error: toApiError(error, '技能创建失败') }
    }
  }

  /** JSON 更新；成功后同步列表项，详情的正文 / frontmatter 需重新拉取。 */
  async function updateSkillAction(id: number, payload: SkillUpdateRequest): Promise<SkillMutationResult> {
    const generation = dataGeneration
    try {
      const updated = await updateSkill(id, payload)
      if (generation === dataGeneration) {
        replaceListItem(updated)
        if (state.skillDetail?.id === id) state.skillDetail = null
      }
      return { skill: updated, error: null }
    } catch (error) {
      return { skill: null, error: toApiError(error, '技能保存失败') }
    }
  }

  function setEnabledLocally(id: number, enabled: boolean) {
    state.skills = state.skills.map((item) => (item.id === id ? { ...item, is_enabled: enabled } : item))
    if (state.skillDetail?.id === id) state.skillDetail = { ...state.skillDetail, is_enabled: enabled }
  }

  /** 启用 / 停用：先改界面，失败回滚并返回错误信息；请求中的 id 记在 togglingIds。 */
  async function toggleEnabledAction(id: number, enabled: boolean): Promise<string | null> {
    if (state.togglingIds.includes(id)) return null
    const generation = dataGeneration
    const previous = state.skills.find((item) => item.id === id)?.is_enabled
      ?? (state.skillDetail?.id === id ? state.skillDetail.is_enabled : !enabled)
    state.togglingIds = [...state.togglingIds, id]
    setEnabledLocally(id, enabled)
    try {
      const updated = await setSkillEnabled(id, { enabled })
      if (generation !== dataGeneration) return null
      replaceListItem(updated)
      patchDetail(updated)
      return null
    } catch (error) {
      if (generation !== dataGeneration) return null
      setEnabledLocally(id, previous)
      return errorMessage(error, enabled ? '启用失败' : '停用失败')
    } finally {
      if (generation === dataGeneration) state.togglingIds = state.togglingIds.filter((item) => item !== id)
    }
  }

  /** 导出 zip；返回 Blob 由页面触发下载。 */
  async function exportSkillAction(id: number): Promise<{ blob: Blob | null; error: string | null }> {
    try {
      return { blob: await exportSkill(id), error: null }
    } catch (error) {
      return { blob: null, error: errorMessage(error, '导出失败') }
    }
  }

  /**
   * 软删除。deleted:false 表示服务端已不存在：同样从本地移除并重拉列表。
   * 失败保留列表，避免前后端状态不一致。
   */
  async function removeSkillAction(id: number): Promise<SkillRemoveResult> {
    const generation = dataGeneration
    try {
      const { deleted } = await deleteSkill(id)
      if (generation !== dataGeneration) return { deleted, error: null }
      state.skills = state.skills.filter((skill) => skill.id !== id)
      if (state.selectedSkillId === id) {
        state.selectedSkillId = null
        state.skillDetail = null
      }
      if (!deleted) void loadSkills()
      return { deleted, error: null }
    } catch (error) {
      return { deleted: false, error: errorMessage(error, '技能删除失败') }
    }
  }

  return {
    state,
    resetSkills,
    loadSkills,
    selectSkill,
    validateBundle: validateBundleAction,
    uploadBundle: uploadBundleAction,
    replaceBundle: replaceBundleAction,
    createSkill: createSkillAction,
    updateSkill: updateSkillAction,
    toggleEnabled: toggleEnabledAction,
    exportSkill: exportSkillAction,
    removeSkill: removeSkillAction,
  }
})
