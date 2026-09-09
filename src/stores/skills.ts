import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { ApiError } from '../http'
import { createSkill, deleteSkill, getSkillDetail, getSkillList, validateSkill } from '../http/skill'
import type { SkillDetailResponse, SkillResponse } from '../interfaces/skill/model'

interface SkillsState {
  skills: SkillResponse[]
  skillsLoading: boolean
  skillDetail: SkillDetailResponse | null
  skillDetailLoading: boolean
  selectedSkillName: string
  skillUploading: boolean
}

/** 上传结果：成功携带新 name 供列表高亮；失败携带可直接展示的错误信息。 */
export interface SkillUploadResult {
  highlight?: string
  error?: string
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

export const useSkillsStore = defineStore('skills', () => {
  let dataGeneration = 0

  const state = reactive<SkillsState>({
    skills: [],
    skillsLoading: false,
    skillDetail: null,
    skillDetailLoading: false,
    selectedSkillName: '',
    skillUploading: false,
  })

  /** 清空工作区绑定数据，并让旧工作区的异步响应失效。 */
  function resetSkills() {
    dataGeneration += 1
    state.skills = []
    state.skillsLoading = false
    state.skillDetail = null
    state.skillDetailLoading = false
    state.selectedSkillName = ''
    state.skillUploading = false
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

  /** 选中并加载某个 skill 的详情；失败清空详情并返回错误信息。 */
  async function selectSkill(name: string): Promise<string | null> {
    const generation = dataGeneration
    state.selectedSkillName = name
    state.skillDetail = null
    state.skillDetailLoading = true
    try {
      const detail = await getSkillDetail(name)
      if (generation === dataGeneration && state.selectedSkillName === name) {
        state.skillDetail = detail
      }
      return null
    } catch (error) {
      if (generation === dataGeneration && state.selectedSkillName === name) {
        state.skillDetail = null
      }
      return errorMessage(error, '技能详情加载失败')
    } finally {
      if (generation === dataGeneration && state.selectedSkillName === name) {
        state.skillDetailLoading = false
      }
    }
  }

  /** 上传 skill 包。成功返回 { highlight: createdName }，失败返回 { error }。 */
  async function uploadSkillAction(file: File): Promise<SkillUploadResult | null> {
    if (state.skillUploading) return null
    const generation = dataGeneration
    state.skillUploading = true
    try {
      const validation = await validateSkill(file)
      if (generation !== dataGeneration) return null
      if (!validation.ok) {
        const errors = validation.errors ?? []
        return {
          error: errors.length
            ? `校验失败：${errors.join('；')}`
            : '校验失败：Skill 包不符合要求',
        }
      }
      const created = await createSkill(file)
      if (generation !== dataGeneration) return null
      await loadSkills()
      // 上传成功后由列表页按 created.name 高亮；选中态由路由 /skills/:name 表达，不再写 store。
      return { highlight: created.name }
    } catch (error) {
      return { error: errorMessage(error, '上传失败:未知错误') }
    } finally {
      if (generation === dataGeneration) state.skillUploading = false
    }
  }

  /** 软删除 skill；若删除当前项，同时清空详情。失败返回错误信息（对齐 workspaces.ts 的 errorMessage 模式）。 */
  async function removeSkillAction(name: string): Promise<string | null> {
    const generation = dataGeneration
    try {
      await deleteSkill(name)
      if (generation !== dataGeneration) return null
      state.skills = state.skills.filter((skill) => skill.name !== name)
      if (state.selectedSkillName === name) {
        state.selectedSkillName = ''
        state.skillDetail = null
      }
      return null
    } catch (error) {
      if (generation !== dataGeneration) return null
      // 删除失败时保留列表，避免前后端状态不一致。
      return errorMessage(error, '技能删除失败')
    }
  }

  return {
    state,
    resetSkills,
    loadSkills,
    selectSkill,
    uploadSkill: uploadSkillAction,
    removeSkill: removeSkillAction,
  }
})
