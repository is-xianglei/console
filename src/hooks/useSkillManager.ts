import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useSkillsStore } from '@/stores/skills'
import { useListUrlState } from './useListUrlState'

export type SkillEnabledFilter = 'all' | 'enabled' | 'disabled'

/** 卡片网格每页条数：3 列的整数倍。 */
export const SKILL_PAGE_SIZES = [12, 24, 48]

/**
 * skills 列表页：筛选/分页状态写入 URL（useListUrlState）。
 * GET /api/skills 没有分页和筛选参数，返回全量，这里前端过滤 + 内存分页。
 */
export function useSkillManager() {
  const skillsStore = useSkillsStore()
  const authStore = useAuthStore()

  const { state, apply, reset, isDefault } = useListUrlState({
    defaults: {
      keyword: '',
      enabled: 'all' as SkillEnabledFilter,
      page: 1,
      pageSize: SKILL_PAGE_SIZES[0],
    },
    resetPageOn: ['keyword', 'enabled', 'pageSize'],
  })

  const loadError = ref('')
  let loadRequest = 0

  const skills = computed(() => skillsStore.state.skills)
  const loading = computed(() => skillsStore.state.skillsLoading)
  const hasActiveFilter = computed(
    () => state.keyword.trim() !== '' || state.enabled !== 'all',
  )

  /** 前端过滤：关键字匹配名称/描述，状态按 is_enabled。 */
  const filteredSkills = computed(() => {
    const query = state.keyword.trim().toLowerCase()
    return skills.value.filter((skill) => {
      const keywordMatches = !query
        || [skill.name, skill.description].some((value) => value?.toLowerCase().includes(query))
      const enabledMatches = state.enabled === 'all'
        || (state.enabled === 'enabled' ? skill.is_enabled : !skill.is_enabled)
      return keywordMatches && enabledMatches
    })
  })

  const total = computed(() => filteredSkills.value.length)
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / Math.max(1, state.pageSize))))
  const clampedPage = computed(() => Math.min(Math.max(1, state.page), pageCount.value))
  /** 当前页切片（前端分页）。 */
  const pagedItems = computed(() => {
    const start = (clampedPage.value - 1) * state.pageSize
    return filteredSkills.value.slice(start, start + state.pageSize)
  })

  async function load() {
    const request = ++loadRequest
    loadError.value = ''
    const error = await skillsStore.loadSkills()
    if (request === loadRequest) loadError.value = error ?? ''
  }

  // 首次进入与切换工作区都重拉（与 agents 列表一致）。
  watch(
    () => authStore.currentWorkspaceId,
    (workspaceId) => {
      if (workspaceId) void load()
    },
    { immediate: true },
  )

  function resetFilters() {
    reset()
  }

  function onRetry() {
    void load()
  }

  onBeforeUnmount(() => {
    loadRequest += 1
  })

  return {
    state,
    apply,
    reset,
    isDefault,
    skills,
    total,
    pageCount,
    clampedPage,
    pagedItems,
    loading,
    loadError,
    hasActiveFilter,
    load,
    resetFilters,
    onRetry,
  }
}
