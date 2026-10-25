<script setup lang="ts" generic="Id extends string">
import { computed, ref, useCssModule, useId, watch } from 'vue'
import { BUILDER_STEP_ISSUES_ATTR, type BuilderStepItem, type BuilderStepStatus } from '@/hooks/useBuilderSteps'

/**
 * 分步 Builder 的步骤区：UStepper 步骤条 → 当前步骤的表单滚动区（顶部是该步问题提示）→ 底部上一步 / 下一步。
 * 步骤状态由 useBuilderSteps 计算后经 items 传入；本组件只负责呈现与导航。
 */
defineOptions({ name: 'BuilderSteps' })

const props = withDefaults(defineProps<{
  /** useBuilderSteps 返回的 items。 */
  items: BuilderStepItem<Id>[]
  /** 步骤条与问题提示的最大宽度（px），与各步表单内容同宽。 */
  contentWidth?: number
}>(), { contentWidth: 980 })

/** 当前步骤 id（v-model，通常绑定 useBuilderSteps 的 active）。 */
const model = defineModel<Id>({ required: true })

defineSlots<{
  /** 当前步骤的表单；step 为当前步骤 id。 */
  default(props: { step: Id; item: BuilderStepItem<Id> | undefined }): unknown
}>()

const style = useCssModule()
const bodyRef = ref<HTMLElement | null>(null)
/** 问题列表 id，供问题提示的 aria-labelledby 引用。 */
const issueListId = useId()
/** UStepper 通过 ref 暴露的导航 API（ShallowUnwrapRef 后 hasNext / hasPrev 为 boolean）。 */
const stepper = ref<{ next(): void; prev(): void; hasNext: boolean; hasPrev: boolean } | null>(null)

/** UStepper v-model 的值类型是 string | number，经此收窄回 Id；不在 items 里的值忽略。 */
const stepValue = computed<string | number | undefined>({
  get: () => model.value,
  set: (value) => {
    const target = props.items.find((item) => item.id === value)
    if (target) model.value = target.id
  },
})

/** UStepper items：状态经 item.class 落到 StepperItem 上，供 CSS Module 着色。 */
const stepperItems = computed(() => props.items.map((item, index) => ({
  value: item.id,
  title: item.label,
  step: index + 1,
  status: item.status,
  issueCount: item.issues.length,
  class: style[`is-${item.status}`],
})))

const activeItem = computed(() => props.items.find((item) => item.id === model.value))

/** 供屏幕阅读器读出的步骤状态文字（经标题插槽进入 trigger 的 aria-labelledby）。 */
function statusText(status: BuilderStepStatus, issueCount: number) {
  if (status === 'issue') return `有问题，${issueCount} 项待处理`
  return status === 'complete' ? '已完成' : '未完成'
}

/** 步骤条点击 / 上一步 / 下一步 / 跳到首个问题：切换后把表单滚动区滚回顶部（post：面板已换完）。 */
watch(model, () => {
  if (bodyRef.value) bodyRef.value.scrollTop = 0
}, { flush: 'post' })

defineExpose({
  next: () => stepper.value?.next(),
  prev: () => stepper.value?.prev(),
  hasNext: computed(() => Boolean(stepper.value?.hasNext)),
  hasPrev: computed(() => Boolean(stepper.value?.hasPrev)),
})
</script>

<template>
  <div :class="$style['builder-steps']" :style="{ '--builder-steps-width': `${contentWidth}px` }">
    <UStepper ref="stepper" v-model="stepValue" :class="$style['bs-stepper']" :items="stepperItems" :linear="false" size="xs">
      <template #indicator="{ item }">
        <UIcon v-if="item.status === 'complete'" name="i-lucide-check" :class="$style['bs-step-icon']" />
        <span v-else-if="item.status === 'issue'" class="mono">!</span>
        <span v-else class="mono">{{ item.step }}</span>
      </template>
      <template #title="{ item }">{{ item.title }}<span class="sr-only">（第 {{ item.step }} 步，{{ statusText(item.status, item.issueCount) }}）</span></template>
    </UStepper>
    <div ref="bodyRef" :class="$style['bs-body']">
      <!-- 该步没有可聚焦的错误字段时，useBuilderSteps.focusFirstIssue 把焦点落到这里（tabindex=-1 只接受程序聚焦）；
           role=group + aria-labelledby 让读屏聚焦时读出问题列表。 -->
      <UAlert
        v-if="activeItem?.status === 'issue'"
        :class="$style['bs-issues']"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        role="group"
        tabindex="-1"
        :aria-labelledby="issueListId"
        v-bind="{ [BUILDER_STEP_ISSUES_ATTR]: '' }"
      >
        <template #description>
          <ul :id="issueListId" :class="$style['bs-issue-list']">
            <li v-for="(message, index) in activeItem.issues" :key="index">{{ message }}</li>
          </ul>
        </template>
      </UAlert>
      <!-- 普通块包一层：各步表单常见的 min-height: 100% 不再按滚动区高度解析，问题提示出现时不会多出空滚动。 -->
      <div><slot :step="model" :item="activeItem" /></div>
    </div>
    <footer :class="$style['bs-foot']">
      <UButton :class="$style['bs-nav-button']" icon="i-lucide-arrow-left" color="neutral" variant="outline" label="上一步" :disabled="!stepper?.hasPrev" @click="stepper?.prev()" />
      <UButton :class="$style['bs-nav-button']" trailing-icon="i-lucide-arrow-right" color="neutral" variant="outline" label="下一步" :disabled="!stepper?.hasNext" @click="stepper?.next()" />
    </footer>
  </div>
</template>

<style module src="./index.module.css"></style>
