<script setup lang="ts">
import { computed, ref } from 'vue'
import { EVOLUTION_KIND_LABEL, EVOLUTION_OPERATION_LABEL } from '@/constants/settings/evolution'
import type { MyEvolutionCandidate } from '@/interfaces/settings/evolution/model'
import { renderMarkdown } from '@/utils/markdown'

defineOptions({ name: 'EvolutionCandidateCard' })

const props = defineProps<{
  candidate: MyEvolutionCandidate
  approving: boolean
  disabled: boolean
}>()

const emit = defineEmits<{ approve: [] }>()

const detailOpen = ref(false)

const isSkill = computed(() => props.candidate.target_kind === 'skill')
const change = computed(() => props.candidate.change)

const kindLabel = computed(() => {
  const { target_kind: kind, operation } = props.candidate
  if (kind === 'skill' && (operation === 'new' || operation === 'create')) return '新技能'
  const op = EVOLUTION_OPERATION_LABEL[operation] ?? operation
  return `${EVOLUTION_KIND_LABEL[kind] ?? kind} · ${op}`
})

const title = computed(() => {
  const value = change.value
  if (value.type !== 'memory_ops' && value.display_name) return value.display_name
  if (isSkill.value && props.candidate.tool_sequence.length) return `固定流程：${props.candidate.tool_sequence.join(' → ')}`
  return props.candidate.summary || '能力候选'
})

/** 后端原始发现句式改写成可读说明；其余原样展示。 */
const finding = computed(() => {
  const summary = props.candidate.summary
  const match = summary.match(/^(\d+)\s*个\s*Episode\s*出现相同工具子序列且成功率\s*([^，,]+)[，,]每次仍在重新规划$/)
  if (!match) return summary
  return `系统在 ${match[1]} 次历史执行中发现了相同做法（成功率 ${match[2]}），建议保存下来，避免以后每次重新规划。`
})

/** 标题已经用了 summary 时不再重复显示理由。 */
const reason = computed(() => (finding.value && finding.value !== title.value ? finding.value : ''))

const skill = computed(() => {
  const value = change.value
  if (value.type === 'memory_ops') return null
  return {
    description: value.description || '遇到需要这些工具共同完成的任务时，智能体会直接复用这套已验证流程，减少重复规划。',
    contentHtml: value.type === 'skill_document' && value.content ? renderMarkdown(value.content) : '',
  }
})

/** 工具步骤链：优先用实际观察到的调用顺序，没有时退回变更里的步骤或工具。 */
const steps = computed(() => {
  if (props.candidate.tool_sequence.length) return props.candidate.tool_sequence
  const value = change.value
  if (value.type === 'memory_ops') return []
  return value.type === 'skill_sequence' && value.steps.length ? value.steps : value.allowed_tools
})

const memoryOps = computed(() => (change.value.type === 'memory_ops' ? change.value.operations : []))

const source = computed(() => {
  const { your_episodes: own, total_evidence: total } = props.candidate
  return total > own ? `来自你的 ${own} 次对话 · 共 ${total} 条证据` : `来自你的 ${own} 次对话`
})

const effect = computed(() => props.candidate.action_effect || (isSkill.value ? '作为你的私有技能安装，只对你生效' : ''))
</script>

<template>
  <li :class="[$style.row, $style.item]">
    <div :class="$style.rowMain">
      <span :class="$style.rowTitle">
        {{ title }}
        <UBadge size="xs" color="neutral" variant="soft" :label="kindLabel" :class="$style.kind" />
      </span>
      <span v-if="reason" :class="$style.rowMeta">{{ reason }}</span>

      <UCollapsible v-model:open="detailOpen">
        <UButton
          color="neutral"
          variant="link"
          :icon="detailOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          :label="detailOpen ? '收起详情' : '查看详情'"
          :class="$style.toggle"
        />
        <template #content>
          <div :class="$style.detail">
            <p v-if="skill">{{ skill.description }}</p>
            <ol v-if="steps.length" :class="$style.chain" aria-label="工具步骤">
              <li v-for="(tool, index) in steps" :key="`${tool}-${index}`">
                <span v-if="index > 0" :class="$style.arrow" aria-hidden="true">→</span>
                <code>{{ tool }}</code>
              </li>
            </ol>
            <div v-if="skill?.contentHtml" class="md" :class="$style.doc" v-html="skill.contentHtml"></div>
            <ul v-if="memoryOps.length" :class="$style.ops">
              <li v-for="(op, index) in memoryOps" :key="index">
                <span :class="$style.opName">{{ EVOLUTION_OPERATION_LABEL[op.operation] ?? op.operation }}</span>
                <span :class="$style.opText">{{ op.text }}</span>
                <span v-if="op.reason" :class="$style.opReason">{{ op.reason }}</span>
              </li>
            </ul>
            <p :class="$style.source">{{ source }}<template v-if="effect"> · {{ effect }}</template></p>
          </div>
        </template>
      </UCollapsible>
    </div>

    <div :class="$style.rowActions">
      <UButton
        variant="soft"
        :label="candidate.action_label || '为我启用'"
        :loading="approving"
        :disabled="disabled"
        @click="emit('approve')"
      />
    </div>
  </li>
</template>

<style module src="./index.module.css"></style>
