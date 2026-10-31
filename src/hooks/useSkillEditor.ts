import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ApiError } from '@/http'
import type { SkillCreateRequest, SkillUpdateRequest } from '@/interfaces/skill/api'
import type { SkillDetailResponse, SkillResponse } from '@/interfaces/skill/model'
import { useSkillsStore } from '@/stores/skills'

/** 表单草稿；metadata 是 JSON 文本，提交时解析为对象。 */
export interface SkillFormModel {
  name: string
  description: string
  version: string
  compatibility: string
  metadata: string
  body: string
}

export type SkillFormField = keyof SkillFormModel

export interface SkillFormIssue {
  field: SkillFormField
  message: string
}

export const SKILL_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const SKILL_LIMITS = { name: 64, description: 1024, version: 32, compatibility: 500 } as const

const FORM_FIELDS: SkillFormField[] = ['name', 'description', 'version', 'compatibility', 'metadata', 'body']

/** 长度按 Unicode 码点计算，与后端一致（一个 emoji 算 1）。 */
export function charCount(value: string): number {
  return [...value].length
}

function emptyDraft(): SkillFormModel {
  return { name: '', description: '', version: '', compatibility: '', metadata: '', body: '' }
}

/** metadata 文本 → 对象；空文本为 undefined，非法时为 null。 */
function parseMetadata(text: string): Record<string, unknown> | undefined | null {
  if (!text.trim()) return undefined
  try {
    const value: unknown = JSON.parse(text)
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

/** 前端校验，规则与后端 SkillCreateRequest / SKILL.md frontmatter 一致。 */
export function validateSkillForm(model: SkillFormModel, creating: boolean): SkillFormIssue[] {
  const issues: SkillFormIssue[] = []
  if (creating) {
    if (!model.name) issues.push({ field: 'name', message: '请输入名称' })
    else if (charCount(model.name) > SKILL_LIMITS.name) issues.push({ field: 'name', message: `不能超过 ${SKILL_LIMITS.name} 个字符` })
    else if (!SKILL_NAME_PATTERN.test(model.name)) {
      issues.push({ field: 'name', message: '只能包含小写字母、数字和单个连字符，且不能以连字符开头或结尾' })
    }
  }
  if (!model.description.trim()) issues.push({ field: 'description', message: '请输入描述' })
  else if (charCount(model.description) > SKILL_LIMITS.description) {
    issues.push({ field: 'description', message: `不能超过 ${SKILL_LIMITS.description} 个字符` })
  }
  if (charCount(model.version) > SKILL_LIMITS.version) issues.push({ field: 'version', message: `不能超过 ${SKILL_LIMITS.version} 个字符` })
  if (charCount(model.compatibility) > SKILL_LIMITS.compatibility) {
    issues.push({ field: 'compatibility', message: `不能超过 ${SKILL_LIMITS.compatibility} 个字符` })
  }
  if (parseMetadata(model.metadata) === null) issues.push({ field: 'metadata', message: '必须是合法的 JSON 对象' })
  if (!model.body.trim()) issues.push({ field: 'body', message: '请输入正文' })
  return issues
}

/** 详情 → 草稿：description/body/version 取顶层，compatibility/metadata 取 frontmatter 同名键。 */
export function draftFromDetail(detail: SkillDetailResponse): SkillFormModel {
  const { compatibility, metadata } = detail.frontmatter
  return {
    name: detail.name,
    description: detail.description,
    version: detail.version ?? '',
    compatibility: typeof compatibility === 'string' ? compatibility : '',
    metadata: metadata && typeof metadata === 'object' ? JSON.stringify(metadata, null, 2) : '',
    body: detail.body,
  }
}

/** 可选字段留空就不传：新建时不写入 frontmatter，更新时保留原值（JSON 更新无法清除）。 */
function optionalFields(model: SkillFormModel) {
  return {
    version: model.version || undefined,
    compatibility: model.compatibility || undefined,
    metadata: parseMetadata(model.metadata) ?? undefined,
  }
}

export function buildCreatePayload(model: SkillFormModel): SkillCreateRequest {
  return { name: model.name, description: model.description, body: model.body, ...optionalFields(model) }
}

export function buildUpdatePayload(model: SkillFormModel): SkillUpdateRequest {
  return { description: model.description, body: model.body, ...optionalFields(model) }
}

interface ValidationErrorItem {
  type?: string
  loc?: unknown[]
  msg?: string
  ctx?: Record<string, unknown>
}

/** Pydantic 错误项 → 中文提示；未知类型保留原文。 */
function validationMessage(item: ValidationErrorItem): string {
  switch (item.type) {
    case 'string_too_long':
      return `不能超过 ${String(item.ctx?.max_length ?? '')} 个字符`
    case 'string_too_short':
    case 'missing':
      return '不能为空'
    case 'string_type':
      return '必须是字符串'
    case 'dict_type':
      return '必须是 JSON 对象'
    default:
      return (item.msg ?? '参数校验失败').replace(/^Value error, /, '')
  }
}

/**
 * 服务端错误 → 字段错误 + 表单顶部错误。
 * 422：details.errors[].loc 最后一段是字段名；409：名称冲突；400：name 不合规落到名称，其余放顶部。
 */
export function mapServerError(error: ApiError): { issues: SkillFormIssue[]; formError: string } {
  const isField = (value: unknown): value is SkillFormField => FORM_FIELDS.includes(value as SkillFormField)
  if (error.status === 422 && Array.isArray(error.details.errors)) {
    const issues: SkillFormIssue[] = []
    const rest: string[] = []
    for (const item of error.details.errors as ValidationErrorItem[]) {
      const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : undefined
      if (isField(field)) issues.push({ field, message: validationMessage(item) })
      else rest.push(item.msg ?? '')
    }
    return { issues, formError: rest.length || !issues.length ? error.message : '' }
  }
  if (error.status === 409 || (error.status === 400 && /^(name |skill 名称)/.test(error.message))) {
    return { issues: [{ field: 'name', message: error.message }], formError: '' }
  }
  return { issues: [], formError: error.message }
}

/** skills 新建 / 编辑页 hook：路由为 skill-edit 时是编辑模式，否则新建。 */
export function useSkillEditor() {
  const route = useRoute()
  const skillsStore = useSkillsStore()

  const skillId = computed<number | null>(() => {
    if (route.name !== 'skill-edit') return null
    const value = route.params.id
    return Number(Array.isArray(value) ? value[0] : value)
  })
  const creating = computed(() => skillId.value === null)

  const draft = ref<SkillFormModel>(emptyDraft())
  const loading = ref(false)
  const saving = ref(false)
  /** 编辑时详情加载失败的信息；404 另外标记 notFound。 */
  const loadError = ref('')
  const notFound = ref(false)
  /** 不能对应到字段的保存错误，显示在表单顶部。 */
  const formError = ref('')
  /** 服务端字段错误：记下出错时的值，用户改了该字段就不再显示。 */
  const serverIssues = ref<Array<SkillFormIssue & { value: string }>>([])

  const issues = computed<SkillFormIssue[]>(() => [
    ...validateSkillForm(draft.value, creating.value),
    ...serverIssues.value
      .filter((issue) => draft.value[issue.field] === issue.value)
      .map(({ field, message }) => ({ field, message })),
  ])

  function openCreate() {
    draft.value = emptyDraft()
    loadError.value = ''
    notFound.value = false
    formError.value = ''
    serverIssues.value = []
  }

  async function openEdit(): Promise<boolean> {
    openCreate()
    const id = skillId.value
    if (id === null || !Number.isInteger(id)) {
      notFound.value = true
      return false
    }
    loading.value = true
    const error = await skillsStore.selectSkill(id)
    loading.value = false
    const detail = skillsStore.state.skillDetail
    if (error || !detail) {
      loadError.value = error?.message ?? '技能详情加载失败'
      notFound.value = error?.status === 404
      return false
    }
    draft.value = draftFromDetail(detail)
    return true
  }

  /** 保存；成功返回记录，失败把错误分配到字段或表单顶部。 */
  async function save(): Promise<SkillResponse | null> {
    if (saving.value) return null
    formError.value = ''
    serverIssues.value = []
    if (validateSkillForm(draft.value, creating.value).length) return null
    saving.value = true
    const id = skillId.value
    const result = id === null
      ? await skillsStore.createSkill(buildCreatePayload(draft.value))
      : await skillsStore.updateSkill(id, buildUpdatePayload(draft.value))
    saving.value = false
    if (result.skill) return result.skill
    const mapped = mapServerError(result.error ?? new ApiError('保存失败', 'UNKNOWN', 0))
    formError.value = mapped.formError
    serverIssues.value = mapped.issues.map((issue) => ({ ...issue, value: draft.value[issue.field] }))
    return null
  }

  return {
    skillId,
    creating,
    draft,
    issues,
    loading,
    saving,
    loadError,
    notFound,
    formError,
    openCreate,
    openEdit,
    save,
  }
}
