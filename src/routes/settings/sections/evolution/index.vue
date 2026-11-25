<script setup lang="ts">
import { ref } from 'vue'
import { EVOLUTION_MECHANISMS, MIN_SUPPORT_RANGE } from '@/constants/settings/evolution'
import { useSettingsEvolution } from '@/hooks/useSettingsEvolution'
import EvolutionCandidateCard from './components/candidate-card/index.vue'
import EvolutionContributionModal from './components/contribution-modal/index.vue'

defineOptions({ name: 'EvolutionSection' })

const ENABLED_HINT = '关闭后全部停止，已生成的内容保留'
const AUTO_APPROVE_HINT = '仅对完全来自你自己对话、且影响范围仅限你个人的候选生效'

const {
  memory,
  prefs,
  candidates,
  loadError,
  savingMemory,
  savingPrefs,
  prefsLocked,
  approvingId,
  load,
  loadMemory,
  loadPrefs,
  loadCandidates,
  setMemoryToggle,
  setEnabled,
  setMechanisms,
  setMinSupport,
  setAutoApprove,
  approve,
} = useSettingsEvolution()

const detailOpen = ref(false)

// 外壳用 Suspense 包裹模块，首屏数据到齐前显示外壳的加载态。
await load()
</script>

<template>
  <div :class="$style.stack">
    <section :class="$style.group" aria-labelledby="evolution-memory-title">
      <header :class="$style.groupHeader">
        <h3 id="evolution-memory-title" :class="$style.groupTitle">记忆</h3>
      </header>
      <UCard :ui="{ body: 'py-0 sm:py-0' }">
        <div v-if="loadError.memory" :class="[$style.cardBody, $style.loadError]">
          <span>{{ loadError.memory }}</span>
          <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" label="重试" @click="loadMemory" />
        </div>
        <ul v-else-if="memory" :class="$style.rows">
          <li :class="$style.row">
            <div :class="$style.rowMain"><span :class="$style.rowTitle">写入记忆</span></div>
            <div :class="$style.rowActions">
              <USwitch
                :model-value="memory.memory_write_enabled"
                :loading="savingMemory.memory_write_enabled"
                :disabled="savingMemory.memory_write_enabled"
                aria-label="写入记忆"
                @update:model-value="(value: boolean) => setMemoryToggle('memory_write_enabled', value)"
              />
            </div>
          </li>
          <li :class="$style.row">
            <div :class="$style.rowMain">
              <span :class="$style.rowTitle">永久记忆</span>
              <span v-if="memory.memory_enabled" :class="$style.rowMeta">
                当前 {{ memory.memory_count }} 条 ·
                <UButton
                  :to="{ name: 'memories' }"
                  variant="link"
                  trailing-icon="i-lucide-arrow-right"
                  label="查看记忆"
                  :class="$style.metaLink"
                />
              </span>
            </div>
            <div :class="$style.rowActions">
              <USwitch
                :model-value="memory.memory_enabled"
                :loading="savingMemory.memory_enabled"
                :disabled="savingMemory.memory_enabled"
                aria-label="永久记忆"
                @update:model-value="(value: boolean) => setMemoryToggle('memory_enabled', value)"
              />
            </div>
          </li>
        </ul>
      </UCard>
    </section>

    <section :class="$style.group" aria-labelledby="evolution-prefs-title">
      <header :class="$style.groupHeader">
        <h3 id="evolution-prefs-title" :class="$style.groupTitle">进化</h3>
      </header>
      <UCard :ui="{ body: 'py-0 sm:py-0' }">
        <div v-if="loadError.prefs" :class="[$style.cardBody, $style.loadError]">
          <span>{{ loadError.prefs }}</span>
          <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" label="重试" @click="loadPrefs" />
        </div>
        <ul v-else-if="prefs" :class="$style.rows">
          <li :class="$style.row">
            <div :class="$style.rowMain">
              <span :class="$style.rowTitle">
                启动进化
                <UTooltip :text="ENABLED_HINT">
                  <UIcon name="i-lucide-info" :class="$style.hint" tabindex="0" :aria-label="ENABLED_HINT" />
                </UTooltip>
              </span>
              <span v-if="prefs.enabled" :class="$style.rowMeta">
                你的对话正在参与能力沉淀 ·
                <UButton
                  variant="link"
                  trailing-icon="i-lucide-arrow-right"
                  label="查看进化详情"
                  :class="$style.metaLink"
                  @click="detailOpen = true"
                />
              </span>
            </div>
            <div :class="$style.rowActions">
              <USwitch
                :model-value="prefs.enabled"
                :loading="savingPrefs.enabled"
                :disabled="savingPrefs.enabled"
                aria-label="启动进化"
                @update:model-value="setEnabled"
              />
            </div>
          </li>
          <li :class="$style.row">
            <div :class="$style.rowMain"><span :class="$style.rowTitle">进化机制</span></div>
            <div :class="$style.rowActions">
              <UCheckboxGroup
                :model-value="prefs.mechanisms"
                :items="EVOLUTION_MECHANISMS"
                value-key="key"
                orientation="horizontal"
                :disabled="prefsLocked || savingPrefs.mechanisms"
                :ui="{ fieldset: 'flex-wrap gap-x-4 gap-y-2' }"
                aria-label="进化机制"
                @update:model-value="setMechanisms"
              />
            </div>
          </li>
          <li :class="$style.row">
            <div :class="$style.rowMain"><span :class="$style.rowTitle">沉淀门槛</span></div>
            <div :class="$style.rowActions">
              <UInputNumber
                :model-value="prefs.min_support"
                :min="MIN_SUPPORT_RANGE.min"
                :max="MIN_SUPPORT_RANGE.max"
                :disabled="prefsLocked || savingPrefs.min_support"
                :class="$style.control"
                aria-label="沉淀门槛"
                @update:model-value="setMinSupport"
              />
            </div>
          </li>
          <li :class="$style.row">
            <div :class="$style.rowMain">
              <span :class="$style.rowTitle">
                低风险候选自动启用
                <UTooltip :text="AUTO_APPROVE_HINT">
                  <UIcon name="i-lucide-info" :class="$style.hint" tabindex="0" :aria-label="AUTO_APPROVE_HINT" />
                </UTooltip>
              </span>
            </div>
            <div :class="$style.rowActions">
              <USwitch
                :model-value="prefs.auto_approve_low_risk"
                :loading="savingPrefs.auto_approve_low_risk"
                :disabled="prefsLocked || savingPrefs.auto_approve_low_risk"
                aria-label="低风险候选自动启用"
                @update:model-value="setAutoApprove"
              />
            </div>
          </li>
        </ul>
      </UCard>
    </section>

    <section :class="$style.group" aria-labelledby="evolution-approvals-title">
      <header :class="$style.groupHeader">
        <h3 id="evolution-approvals-title" :class="$style.groupTitle">
          待我批准
          <span v-if="candidates.length" :class="$style.count">{{ candidates.length }}</span>
        </h3>
      </header>
      <UCard :ui="{ body: 'py-0 sm:py-0' }">
        <div v-if="loadError.candidates" :class="[$style.cardBody, $style.loadError]">
          <span>{{ loadError.candidates }}</span>
          <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" label="重试" @click="loadCandidates" />
        </div>
        <UEmpty v-else-if="!candidates.length" variant="naked" icon="i-lucide-inbox" title="暂无待你决定的变更" />
        <ul v-else :class="$style.rows">
          <EvolutionCandidateCard
            v-for="candidate in candidates"
            :key="candidate.candidate_id"
            :candidate="candidate"
            :approving="approvingId === candidate.candidate_id"
            :disabled="Boolean(approvingId) && approvingId !== candidate.candidate_id"
            @approve="approve(candidate)"
          />
        </ul>
      </UCard>
    </section>

    <EvolutionContributionModal v-model:open="detailOpen" />
  </div>
</template>

<style module src="./index.module.css"></style>
