import { computed, nextTick, shallowReactive, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { focusFirstError } from './useFormHelpers'

/**
 * 步骤状态（优先级从高到低）：
 * - issue：点过保存后该步仍有问题，显示「!」（warning 色）；
 * - complete：满足完成条件，且来自已有数据（编辑 / 预填）或已访问过，显示对勾；
 * - pending：其余，显示序号。
 */
export type BuilderStepStatus = 'issue' | 'complete' | 'pending'

/** 步骤定义。id 必须是字符串（UStepper 把数字 v-model 当下标处理）。 */
export interface BuilderStepDef<Id extends string = string> {
  id: Id
  label: string
}

/** 交给 <BuilderSteps> 的步骤项，由 useBuilderSteps 计算得出。 */
export interface BuilderStepItem<Id extends string = string> {
  id: Id
  label: string
  status: BuilderStepStatus
  /** 该步的问题文字；status 为 issue 时由 BuilderSteps 列在该步表单顶部。 */
  issues: readonly string[]
}

/** 每步的问题文字；未出现的步骤视为没有问题。 */
export type BuilderStepIssues<Id extends string> = Partial<Record<Id, readonly string[]>>

export interface UseBuilderStepsOptions<Id extends string> {
  /** 步骤列表，可随业务动态变化（如 Plans 的 4 / 5 步）。 */
  steps: MaybeRefOrGetter<readonly BuilderStepDef<Id>[]>
  /** 每步的问题文字，由各 Builder 把自己的 issue 映射到步骤后传入（可用 groupIssuesByStep）。 */
  issues: MaybeRefOrGetter<BuilderStepIssues<Id>>
  /** 是否点过保存 / 发布；为 true 后有问题的步骤才标成 issue。 */
  attempted: MaybeRefOrGetter<boolean>
  /** 数据是否来自已有记录（编辑页、复制预填）；为 true 时未访问的步骤也可直接标成 complete。 */
  fromExisting?: MaybeRefOrGetter<boolean>
  /** 自定义完成条件；缺省为「该步没有问题」。 */
  isComplete?: (id: Id) => boolean
  /** 初始步骤；缺省或不在列表里时取第一步。 */
  initial?: Id
}

/** 把 issue 按步骤分组成 BuilderStepIssues；toStep 返回 null / undefined 的 issue 不归入任何步骤。 */
export function groupIssuesByStep<Id extends string, Issue extends { message: string }>(
  issues: readonly Issue[],
  toStep: (issue: Issue) => Id | null | undefined,
): BuilderStepIssues<Id> {
  const result: Partial<Record<Id, string[]>> = {}
  for (const issue of issues) {
    const step = toStep(issue)
    if (step == null) continue
    const messages = result[step] ?? []
    messages.push(issue.message)
    result[step] = messages
  }
  return result
}

/** BuilderSteps 给当前步骤顶部问题提示加的标记属性；该步没有可聚焦的错误字段时焦点落到这里。 */
export const BUILDER_STEP_ISSUES_ATTR = 'data-builder-step-issues'

/**
 * 在 root 内聚焦第一个错误字段（aria-invalid / data-error）；
 * 找不到时回退到该步顶部的问题提示（带 BUILDER_STEP_ISSUES_ATTR、tabindex=-1）。返回是否落了焦点。
 */
export function focusStepIssue(root: HTMLElement): boolean {
  if (focusFirstError(root)) return true
  const summary = root.querySelector<HTMLElement>(`[${BUILDER_STEP_ISSUES_ATTR}]`)
  if (!summary) return false
  // 切步后滚动区已回到顶部，问题提示就在可视区内，直接 focus 即可。
  summary.focus()
  return true
}

/** 当前步骤从列表中消失时，在旧列表里以它为中心向两侧找最近一个仍存在的步骤（距离相同时取前一步）。 */
function nearestRemainingStep<Id extends string>(ids: readonly Id[], previousIds: readonly Id[], from: number): Id {
  if (from >= 0) {
    for (let distance = 1; distance < previousIds.length; distance += 1) {
      for (const index of [from - distance, from + distance]) {
        const candidate = previousIds[index]
        if (candidate !== undefined && ids.includes(candidate)) return candidate
      }
    }
  }
  return ids[Math.min(Math.max(from, 0), ids.length - 1)]!
}

/**
 * 分步 Builder 的步骤状态：当前步骤、访问记录与每步状态。
 * 业务无关：issue 如何对应到步骤由调用方算好传入。
 */
export function useBuilderSteps<Id extends string>(options: UseBuilderStepsOptions<Id>) {
  const stepIds = computed(() => toValue(options.steps).map((step) => step.id))

  const startIds = stepIds.value
  const active = shallowRef<Id>(
    options.initial !== undefined && startIds.includes(options.initial) ? options.initial : startIds[0]!,
  )

  /** 访问过的步骤（含打开时的第一步），空白新建时未看过的步骤不直接标成 complete。 */
  const visited = shallowReactive(new Set<Id>())
  watch(active, (id) => { visited.add(id) }, { immediate: true })

  // 步骤列表变化后当前步骤不在了：回退到最近的那一步。
  watch(stepIds, (ids, previousIds) => {
    if (!ids.length || ids.includes(active.value)) return
    const previous = previousIds ?? []
    active.value = nearestRemainingStep(ids, previous, previous.indexOf(active.value))
  })

  const statuses = computed(() => {
    const issues = toValue(options.issues)
    const attempted = toValue(options.attempted)
    const fromExisting = toValue(options.fromExisting) ?? false
    const result: Partial<Record<Id, BuilderStepStatus>> = {}
    for (const id of stepIds.value) {
      const issueCount = issues[id]?.length ?? 0
      const complete = options.isComplete ? options.isComplete(id) : issueCount === 0
      if (attempted && issueCount) result[id] = 'issue'
      else result[id] = (fromExisting || visited.has(id)) && complete ? 'complete' : 'pending'
    }
    return result
  })

  const items = computed<BuilderStepItem<Id>[]>(() => {
    const issues = toValue(options.issues)
    return toValue(options.steps).map((step) => ({
      id: step.id,
      label: step.label,
      status: statuses.value[step.id] ?? 'pending',
      issues: issues[step.id] ?? [],
    }))
  })

  /** 按步骤顺序第一个有问题的步骤。 */
  const firstIssueStep = computed(() => {
    const issues = toValue(options.issues)
    return stepIds.value.find((id) => Boolean(issues[id]?.length))
  })

  /** 切到指定步骤；不在当前列表里的 id 忽略。 */
  function goTo(id: Id) {
    if (stepIds.value.includes(id)) active.value = id
  }

  /**
   * 跳到第一个有问题的步骤，表单渲染后在 root 内聚焦第一个错误字段；
   * 该步没有标 aria-invalid 的字段（如成员数量、空表单下未标红的字段）时聚焦该步顶部的问题提示。
   * 返回是否找到了有问题的步骤（没有则不切换）。
   */
  function focusFirstIssue(root?: MaybeRefOrGetter<HTMLElement | null | undefined>) {
    const target = firstIssueStep.value
    if (target === undefined) return false
    active.value = target
    void nextTick().then(() => {
      const element = toValue(root)
      if (element) focusStepIssue(element)
    })
    return true
  }

  return { active, visited: visited as ReadonlySet<Id>, statuses, items, firstIssueStep, goTo, focusFirstIssue }
}
