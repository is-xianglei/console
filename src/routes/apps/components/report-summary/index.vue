<script setup lang="ts">
import { computed } from 'vue'
import { MARKET_SKILL_ACTION_META } from '@/constants/market'
import type { MarketInstallReport, MarketListingKind } from '@/interfaces/market/model'
import { getReportGroupVisibility, isChangedMarketSkill } from '@/utils/market'

/**
 * 安装 / 升级报告：工具绑定或丢弃（附原因）、每个 Skill 的处理方式。
 * 详情页的安装预览和安装完成后的报告结构相同，共用这个组件。
 */
defineOptions({ name: 'MarketReportSummary' })

const props = defineProps<{
  report: MarketInstallReport
  kind: MarketListingKind
}>()

const changedSkills = computed(() => props.report.skills.filter((skill) => isChangedMarketSkill(skill)))
const otherSkills = computed(() => props.report.skills.filter((skill) => !isChangedMarketSkill(skill)))
// 分组没有内容时连标题一起隐藏。
const visible = computed(() => getReportGroupVisibility(props.report, props.kind))
</script>

<template>
  <div :class="$style.summary">
    <section v-if="visible.tools" :class="$style.group">
      <h4 :class="$style.title">工具</h4>
      <div v-if="props.report.bound_tool_keys.length" :class="$style.chips">
        <UBadge
          v-for="toolKey in props.report.bound_tool_keys"
          :key="toolKey"
          :label="toolKey"
          color="success"
          variant="subtle"
          size="xs"
          icon="i-lucide-link"
          class="mono"
        />
      </div>
      <p v-else-if="!props.report.dropped_tools.length" :class="$style.none">无</p>
      <ul v-if="props.report.dropped_tools.length" :class="$style.list">
        <li v-for="tool in props.report.dropped_tools" :key="tool.tool_key" :class="$style.row">
          <UBadge :label="tool.tool_key" color="error" variant="subtle" size="xs" icon="i-lucide-unlink" class="mono" />
          <span :class="$style.reason">丢弃：{{ tool.message }}</span>
        </li>
      </ul>
    </section>

    <section v-if="visible.skills" :class="$style.group">
      <h4 :class="$style.title">Skill</h4>
      <ul v-if="otherSkills.length" :class="$style.list">
        <li v-for="skill in otherSkills" :key="skill.name" :class="$style.row">
          <span :class="[$style.skillName, 'mono']">{{ skill.name }}</span>
          <UBadge
            :label="MARKET_SKILL_ACTION_META[skill.action].label"
            :color="MARKET_SKILL_ACTION_META[skill.action].color"
            variant="subtle"
            size="xs"
          />
        </li>
      </ul>
      <!-- 分组显示而没有可列的 Skill，只可能是 Agent 一个 Skill 都没有。 -->
      <p v-else :class="$style.none">无</p>
    </section>

    <section v-if="visible.changedSkills" :class="$style.group">
      <h4 :class="$style.title">被覆盖或解绑的 Skill</h4>
      <ul :class="$style.list">
        <li v-for="skill in changedSkills" :key="skill.name" :class="$style.row">
          <span :class="[$style.skillName, 'mono']">{{ skill.name }}</span>
          <UBadge
            :label="MARKET_SKILL_ACTION_META[skill.action].label"
            :color="MARKET_SKILL_ACTION_META[skill.action].color"
            variant="subtle"
            size="xs"
          />
        </li>
      </ul>
      <p :class="$style.hint">覆盖会影响本工作区所有绑定该 Skill 的 Agent；解绑不会删除 Skill。</p>
    </section>
  </div>
</template>

<style module src="./index.module.css"></style>
