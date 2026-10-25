import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import {
  BUILDER_STEP_ISSUES_ATTR,
  focusStepIssue,
  groupIssuesByStep,
  useBuilderSteps,
  type BuilderStepDef,
  type BuilderStepIssues,
  type UseBuilderStepsOptions,
} from './useBuilderSteps'

type Id = 'a' | 'b' | 'c' | 'd'
const STEPS: BuilderStepDef<Id>[] = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
  { id: 'c', label: 'C' },
  { id: 'd', label: 'D' },
]

// watch 需要在 effect scope 里收集，测试结束统一 stop，避免跨用例残留。
let scope: EffectScope | undefined
afterEach(() => {
  scope?.stop()
  scope = undefined
})

function setup(options: Partial<UseBuilderStepsOptions<Id>> = {}) {
  scope = effectScope()
  return scope.run(() => useBuilderSteps<Id>({ steps: STEPS, issues: {}, attempted: false, ...options }))!
}

/** focusFirstIssue 在 nextTick 之后才聚焦，等一个宏任务让回调跑完。 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

// ===== node 环境没有 DOM：用最小假元素模拟 querySelector / focus =====
function fakeFocusable() {
  return { focus: vi.fn(), scrollIntoView: vi.fn(), matches: () => true, querySelector: () => null }
}

function fakeRoot({ fields = [], summary = null }: {
  fields?: ReturnType<typeof fakeFocusable>[]
  summary?: ReturnType<typeof fakeFocusable> | null
} = {}) {
  return {
    querySelectorAll: vi.fn(() => fields),
    querySelector: vi.fn((selector: string) => (selector === `[${BUILDER_STEP_ISSUES_ATTR}]` ? summary : null)),
  } as unknown as HTMLElement
}

describe('groupIssuesByStep', () => {
  it('按 toStep 分组，返回 null / undefined 的 issue 不归入任何步骤', () => {
    const issues = [
      { message: '名称必填', step: 'a' as const },
      { message: '成员不足', step: 'c' as const },
      { message: '名称过长', step: 'a' as const },
      { message: '游离问题', step: null },
    ]
    expect(groupIssuesByStep<Id, (typeof issues)[number]>(issues, (issue) => issue.step)).toEqual({
      a: ['名称必填', '名称过长'],
      c: ['成员不足'],
    })
  })
})

describe('useBuilderSteps：状态优先级', () => {
  it('点过保存后有问题的步骤标 issue，优先于 complete（含 fromExisting 与已访问）', () => {
    const attempted = ref(false)
    const steps = setup({ issues: { a: ['名称必填'] }, attempted, fromExisting: true })
    // 未点保存：有问题的步骤按完成条件（缺省 = 没有问题）落到 pending，其余因 fromExisting 为 complete。
    expect(steps.statuses.value).toEqual({ a: 'pending', b: 'complete', c: 'complete', d: 'complete' })

    attempted.value = true
    expect(steps.statuses.value.a).toBe('issue')
    expect(steps.items.value[0]).toMatchObject({ id: 'a', status: 'issue', issues: ['名称必填'] })
  })

  it('自定义 isComplete 决定 complete / pending，issue 仍优先', () => {
    const steps = setup({
      issues: { c: ['成员不足'] },
      attempted: true,
      fromExisting: true,
      isComplete: (id) => id !== 'b',
    })
    expect(steps.statuses.value).toEqual({ a: 'complete', b: 'pending', c: 'issue', d: 'complete' })
  })

  it('没点保存时，即使有问题也不显示 issue', () => {
    const steps = setup({ issues: { b: ['x'] }, attempted: false })
    expect(steps.statuses.value.b).toBe('pending')
  })
})

describe('useBuilderSteps：fromExisting', () => {
  it('空白新建只把访问过的步骤标 complete', async () => {
    const steps = setup()
    // 打开时的第一步算已访问。
    expect(steps.statuses.value).toEqual({ a: 'complete', b: 'pending', c: 'pending', d: 'pending' })

    steps.goTo('c')
    await nextTick()
    expect(steps.visited.has('c')).toBe(true)
    expect(steps.statuses.value).toEqual({ a: 'complete', b: 'pending', c: 'complete', d: 'pending' })
  })

  it('来自已有数据时未访问的步骤也直接标 complete，且随 fromExisting 响应式变化', () => {
    const prefilled = ref(false)
    const steps = setup({ fromExisting: prefilled })
    expect(steps.statuses.value.d).toBe('pending')

    prefilled.value = true
    expect(steps.statuses.value).toEqual({ a: 'complete', b: 'complete', c: 'complete', d: 'complete' })
  })
})

describe('useBuilderSteps：步骤列表变化时的回退', () => {
  it('当前步骤被移除时回退到最近的一步，距离相同取前一步', async () => {
    const list = ref<BuilderStepDef<Id>[]>(STEPS)
    const steps = setup({ steps: list, initial: 'c' })
    expect(steps.active.value).toBe('c')

    list.value = STEPS.filter((step) => step.id !== 'c')
    await nextTick()
    expect(steps.active.value).toBe('b')
  })

  it('前一步也不在了时取后一步', async () => {
    const list = ref<BuilderStepDef<Id>[]>(STEPS)
    const steps = setup({ steps: list, initial: 'c' })

    list.value = STEPS.filter((step) => step.id !== 'b' && step.id !== 'c')
    await nextTick()
    expect(steps.active.value).toBe('d')
  })

  it('当前步骤仍在列表里时不动', async () => {
    const list = ref<BuilderStepDef<Id>[]>(STEPS)
    const steps = setup({ steps: list, initial: 'd' })

    list.value = STEPS.filter((step) => step.id !== 'b')
    await nextTick()
    expect(steps.active.value).toBe('d')
  })

  it('initial 不在列表里时取第一步', () => {
    const steps = setup({ steps: STEPS.slice(0, 2), initial: 'd' })
    expect(steps.active.value).toBe('a')
  })
})

describe('useBuilderSteps：goTo', () => {
  it('切到列表里的步骤，忽略不存在 / 已被移除的 id', async () => {
    const list = ref<BuilderStepDef<Id>[]>(STEPS.slice(0, 3))
    const steps = setup({ steps: list })

    steps.goTo('c')
    expect(steps.active.value).toBe('c')

    steps.goTo('d')
    expect(steps.active.value).toBe('c')

    steps.goTo('nope' as Id)
    expect(steps.active.value).toBe('c')
    await nextTick()
    expect(steps.visited.has('d')).toBe(false)
  })
})

describe('useBuilderSteps：focusFirstIssue', () => {
  it('按步骤顺序（而不是 issues 的键顺序）跳到第一个有问题的步骤', async () => {
    const issues = ref<BuilderStepIssues<Id>>({ d: ['超时过大'], b: ['成员不足'] })
    const steps = setup({ issues, attempted: true })
    expect(steps.firstIssueStep.value).toBe('b')

    expect(steps.focusFirstIssue(fakeRoot())).toBe(true)
    expect(steps.active.value).toBe('b')

    // b 修好后，下一个问题是 d。
    issues.value = { d: ['超时过大'] }
    expect(steps.focusFirstIssue()).toBe(true)
    expect(steps.active.value).toBe('d')
    await flush()
  })

  it('没有问题时返回 false 且不切换', () => {
    const steps = setup({ initial: 'c' })
    expect(steps.focusFirstIssue(fakeRoot())).toBe(false)
    expect(steps.active.value).toBe('c')
  })

  it('该步有 aria-invalid 字段时聚焦字段，不聚焦问题提示', async () => {
    const field = fakeFocusable()
    const summary = fakeFocusable()
    const root = fakeRoot({ fields: [field], summary })
    const steps = setup({ issues: { c: ['名称必填'] }, attempted: true })

    steps.focusFirstIssue(root)
    // 切步后、表单渲染前不聚焦。
    expect(field.focus).not.toHaveBeenCalled()
    await flush()
    expect(field.focus).toHaveBeenCalledTimes(1)
    expect(summary.focus).not.toHaveBeenCalled()
  })

  it('该步找不到 aria-invalid 字段时，焦点回退到该步顶部的问题提示', async () => {
    const summary = fakeFocusable()
    const root = fakeRoot({ summary })
    const steps = setup({ issues: { b: ['至少选择 2 个成员'] }, attempted: true })

    steps.focusFirstIssue(() => root)
    await flush()
    expect(steps.active.value).toBe('b')
    expect(root.querySelectorAll).toHaveBeenCalledWith('[aria-invalid="true"], [data-error]')
    expect(summary.focus).toHaveBeenCalledTimes(1)
  })

  it('root 为空时只切步，不抛错', async () => {
    const steps = setup({ issues: { d: ['x'] }, attempted: true })
    expect(steps.focusFirstIssue(ref(null))).toBe(true)
    await flush()
    expect(steps.active.value).toBe('d')
  })
})

describe('focusStepIssue', () => {
  it('优先错误字段；没有字段时聚焦问题提示；两者都没有返回 false', () => {
    const field = fakeFocusable()
    const summary = fakeFocusable()
    expect(focusStepIssue(fakeRoot({ fields: [field], summary }))).toBe(true)
    expect(field.focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(summary.focus).not.toHaveBeenCalled()

    expect(focusStepIssue(fakeRoot({ summary }))).toBe(true)
    expect(summary.focus).toHaveBeenCalledTimes(1)

    expect(focusStepIssue(fakeRoot())).toBe(false)
  })
})
