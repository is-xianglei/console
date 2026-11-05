<script setup lang="ts">
import { computed } from 'vue'
import type { MarketSkillFile, MarketSkillSnapshot, MarketSnapshot } from '@/interfaces/market/model'
import { formatByteSize, getSkillFileSize, getSnapshotSkills, isAgentSnapshot } from '@/utils/market'
import { renderMarkdown } from '@/utils/markdown'

/**
 * 版本快照全文：详情页和审核队列共用。
 * Agent 条目展示描述、系统提示词、工具和自带 Skill；Skill 条目展示 SKILL.md 全文和附带文件。
 * 文本类附带文件（脚本等）可展开看原文，安装或审核前能看清里面到底写了什么。
 */
defineOptions({ name: 'MarketSnapshotView' })

const props = defineProps<{ snapshot: MarketSnapshot }>()

interface SkillFileRow {
  path: string
  file: MarketSkillFile
  size: number
  isText: boolean
}

interface SkillBlock {
  skill: MarketSkillSnapshot
  files: SkillFileRow[]
}

const agent = computed(() => {
  if (isAgentSnapshot(props.snapshot)) return props.snapshot.agent
  return null
})

const promptHtml = computed(() => {
  if (!agent.value || !agent.value.system_prompt) return ''
  return renderMarkdown(agent.value.system_prompt)
})

/** 附带文件按路径排序；base64 是二进制文件，只列出不展示内容。 */
function listFiles(skill: MarketSkillSnapshot): SkillFileRow[] {
  const rows: SkillFileRow[] = []
  for (const [path, file] of Object.entries(skill.extra_files)) {
    rows.push({ path, file, size: getSkillFileSize(file), isText: file.encoding !== 'base64' })
  }
  rows.sort((a, b) => a.path.localeCompare(b.path))
  return rows
}

/** 每个 Skill 连同整理好的附带文件列表，模板里不用重复计算。 */
const skillBlocks = computed(() => {
  const blocks: SkillBlock[] = []
  for (const skill of getSnapshotSkills(props.snapshot)) {
    blocks.push({ skill, files: listFiles(skill) })
  }
  return blocks
})
</script>

<template>
  <div :class="$style.view">
    <template v-if="agent">
      <section :class="$style.group">
        <h3 :class="$style.groupTitle">描述</h3>
        <p v-if="agent.description" :class="$style.text">{{ agent.description }}</p>
        <p v-else :class="$style.none">无</p>
      </section>

      <section :class="$style.group">
        <h3 :class="$style.groupTitle">系统提示词</h3>
        <div v-if="promptHtml" :class="[$style.block, $style.prompt, 'md']" v-html="promptHtml"></div>
        <p v-else :class="$style.none">无</p>
      </section>

      <section :class="$style.group">
        <h3 :class="$style.groupTitle">工具 <span :class="[$style.count, 'mono']">{{ agent.tool_keys.length }}</span></h3>
        <div v-if="agent.tool_keys.length" :class="$style.chips">
          <UBadge v-for="toolKey in agent.tool_keys" :key="toolKey" :label="toolKey" color="neutral" variant="soft" size="xs" class="mono" />
        </div>
        <p v-else :class="$style.none">无</p>
      </section>
    </template>

    <section :class="$style.group">
      <h3 v-if="agent" :class="$style.groupTitle">自带 Skill <span :class="[$style.count, 'mono']">{{ skillBlocks.length }}</span></h3>
      <p v-if="agent && !skillBlocks.length" :class="$style.none">无</p>

      <!-- Agent 自带的 Skill 默认收起，Skill 条目只有一个，默认展开。 -->
      <UCollapsible v-for="block in skillBlocks" :key="block.skill.name" :default-open="!agent" :class="$style.skill">
        <UButton
          color="neutral"
          variant="ghost"
          block
          :class="$style.skillToggle"
          icon="i-lucide-wrench"
          trailing-icon="i-lucide-chevron-down"
          :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform' }"
        >
          <span :class="[$style.skillName, 'mono']">{{ block.skill.name }}</span>
          <span :class="$style.skillMeta">SKILL.md · {{ block.files.length }} 个附带文件</span>
        </UButton>
        <template #content>
          <div :class="$style.skillBody">
            <div :class="[$style.fileTitle, 'mono']">SKILL.md</div>
            <pre :class="[$style.block, $style.code]">{{ block.skill.content }}</pre>

            <div v-if="block.files.length" :class="$style.files">
              <div :class="$style.fileTitle">附带文件</div>
              <template v-for="row in block.files" :key="row.path">
                <UCollapsible v-if="row.isText" :class="$style.file">
                  <UButton color="neutral" variant="ghost" block :class="$style.fileRow" trailing-icon="i-lucide-chevron-down" :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform' }">
                    <span :class="[$style.filePath, 'mono']">{{ row.path }}</span>
                    <span :class="[$style.fileSize, 'mono']">{{ formatByteSize(row.size) }}</span>
                  </UButton>
                  <template #content>
                    <pre :class="[$style.block, $style.code]">{{ row.file.content }}</pre>
                  </template>
                </UCollapsible>
                <div v-else :class="[$style.fileRow, $style.binaryRow]">
                  <span :class="[$style.filePath, 'mono']">{{ row.path }}</span>
                  <span :class="[$style.fileSize, 'mono']">二进制 · {{ formatByteSize(row.size) }}</span>
                </div>
              </template>
            </div>
          </div>
        </template>
      </UCollapsible>
    </section>
  </div>
</template>

<style module src="./index.module.css"></style>
