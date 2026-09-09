import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { MemoryDetail, MemoryType } from '@/interfaces/memory/model'
import type { CreateMemoryRequest, UpdateMemoryRequest } from '@/interfaces/memory/api'
import { useSaveFeedback } from '@/hooks/useSaveFeedback'
import { useMemoriesStore } from '@/stores/memories'

/** 新建/编辑/复制/删除/保存的独立表单模型，与列表逻辑(store)分离。 */
export interface MemoryFormModel {
  id: number | null
  memoryKey: string
  memoryType: MemoryType
  name: string
  description: string
  body: string
  /** 乐观锁版本，仅编辑态有值；新建置 0。 */
  version: number
}

export interface MemoryValidationIssue {
  field: keyof MemoryFormModel
  message: string
}

export function emptyMemoryForm(): MemoryFormModel {
  return {
    id: null,
    memoryKey: '',
    memoryType: 'user',
    name: '',
    description: '',
    body: '',
    version: 0,
  }
}

/** 详情响应转表单模型；memoryKey 在编辑时只读，仍保留随表单提交原值。 */
export function memoryDetailToForm(detail: MemoryDetail): MemoryFormModel {
  return {
    id: detail.id,
    memoryKey: detail.memory_key,
    memoryType: detail.memory_type,
    name: detail.name,
    description: detail.description,
    body: detail.body,
    version: detail.version,
  }
}

/** 与后端校验对齐：稳定标识、标题、摘要、正文均必填；标识仅允许小写字母、数字、连字符与下划线。 */
export function validateMemory(form: MemoryFormModel): MemoryValidationIssue[] {
  const issues: MemoryValidationIssue[] = []
  const key = form.memoryKey.trim()
  if (!key) {
    issues.push({ field: 'memoryKey', message: '请输入稳定标识' })
  } else if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(key)) {
    issues.push({ field: 'memoryKey', message: '仅支持小写字母、数字、连字符与下划线' })
  }
  if (!form.name.trim()) issues.push({ field: 'name', message: '请输入标题' })
  if (!form.description.trim()) issues.push({ field: 'description', message: '请输入摘要' })
  if (!form.body.trim()) issues.push({ field: 'body', message: '请输入正文' })
  return issues
}

function buildCreatePayload(form: MemoryFormModel): CreateMemoryRequest {
  return {
    memory_key: form.memoryKey.trim(),
    memory_type: form.memoryType,
    name: form.name.trim(),
    description: form.description.trim(),
    body: form.body.trim(),
  }
}

function buildUpdatePayload(form: MemoryFormModel): UpdateMemoryRequest {
  return {
    version: form.version,
    memory_type: form.memoryType,
    name: form.name.trim(),
    description: form.description.trim(),
    body: form.body.trim(),
  }
}

/**
 * 详情/编辑/保存/删除：与列表逻辑(store)分离，由详情/create/edit 三个路由页各自实例化。
 * 导航由本 hook 统一负责。store 的 detail/saving 保留用于详情页展示与表单提交 loading。
 */
export function useMemoryEditor() {
  const router = useRouter()
  const route = useRoute()
  const memoriesStore = useMemoriesStore()
  const draft = ref<MemoryFormModel>(emptyMemoryForm())
  const loadingDetail = ref(false)
  const saving = ref(false)
  const error = ref('')

  /** 保存/删除后的反馈闭环：toast + 回列表并高亮 / 详情页删除后回列表。 */
  const feedback = useSaveFeedback({
    listRoute: { name: 'memories' },
    detailRoute: { name: 'memory-detail' },
  })
  /** 是否从详情页进入编辑（route.query.from === 'detail'），保存后留在详情。 */
  const fromDetail = computed(() => route.query.from === 'detail')

  const detail = computed<MemoryDetail | null>(() => memoriesStore.state.detail)
  const issues = computed<MemoryValidationIssue[]>(() => validateMemory(draft.value))

  function goToList() {
    void router.push({ name: 'memories' })
  }

  function goToDetail(id: number) {
    void router.push({ name: 'memory-detail', params: { id: String(id) } })
  }

  /** 请求详情前先把编辑态置空，避免上一个草稿残留。 */
  function startEdit(id: number) {
    draft.value = emptyMemoryForm()
    loadingDetail.value = true
    error.value = ''
    return id
  }

  /** 打开编辑页：拉详情并转表单模型；失败把错误留到页面，不进入编辑。 */
  async function openEdit(id: number): Promise<boolean> {
    startEdit(id)
    const detail = await memoriesStore.selectMemory(id)
    loadingDetail.value = false
    if (detail) {
      error.value = 'Memory 详情加载失败，未进入编辑模式。请刷新后重试。'
      return false
    }
    const loaded = memoriesStore.state.detail
    if (!loaded) {
      error.value = 'Memory 详情加载失败，未进入编辑模式。请刷新后重试。'
      return false
    }
    draft.value = memoryDetailToForm(loaded)
    return true
  }

  /**
   * 打开新增/复制页。sourceId 非空时拉源 Memory 作为复制模板(URL ?duplicate=<id>)，
   * 为空则建空草稿。
   */
  async function openCreate(sourceId?: number): Promise<void> {
    error.value = ''
    if (sourceId == null) {
      draft.value = emptyMemoryForm()
      return
    }
    loadingDetail.value = true
    const loadError = await memoriesStore.selectMemory(sourceId)
    loadingDetail.value = false
    if (loadError || !memoriesStore.state.detail) {
      error.value = '复制源 Memory 加载失败，已返回新建模式。请刷新后重试。'
      draft.value = emptyMemoryForm()
      return
    }
    const form = memoryDetailToForm(memoriesStore.state.detail)
    form.id = null
    form.version = 0
    form.name = `${memoriesStore.state.detail.name} 副本`
    draft.value = form
  }

  /** 校验通过后提交草稿；成功走反馈闭环（toast + 回列表高亮 / from 详情则留详情），失败把错误留在页面顶部。 */
  async function saveDraft(): Promise<boolean> {
    if (validateMemory(draft.value).length) return false
    if (saving.value) return false
    saving.value = true
    try {
      const message = draft.value.id == null
        ? await memoriesStore.createMemory(buildCreatePayload(draft.value))
        : await memoriesStore.updateMemory(draft.value.id, buildUpdatePayload(draft.value))
      if (message) {
        error.value = message
        return false
      }
      error.value = ''
      const id = memoriesStore.state.detail?.id ?? draft.value.id
      if (id == null) return false
      if (fromDetail.value) {
        await feedback.afterSaveToDetail({ id, message: draft.value.id == null ? 'Memory 已创建' : 'Memory 已保存' })
      } else {
        await feedback.afterSave({ id, message: draft.value.id == null ? 'Memory 已创建' : 'Memory 已保存' })
      }
      return true
    } finally {
      saving.value = false
    }
  }

  /** 详情页删除：调 store 的软删除，成功后回列表。 */
  async function removeDetail(id: number, version: number): Promise<boolean> {
    const message = await memoriesStore.deleteMemory(id, version)
    if (message) {
      error.value = message
      return false
    }
    error.value = ''
    await feedback.afterDelete({ message: 'Memory 已删除' })
    return true
  }

  return {
    draft,
    detail,
    issues,
    loadingDetail,
    saving,
    error,
    openEdit,
    openCreate,
    saveDraft,
    removeDetail,
    goToList,
    goToDetail,
  }
}




