<script setup lang="ts">
import { computed, watch } from 'vue'
import { EVOLUTION_KIND_META, EVOLUTION_STATUS_META } from '@/constants/settings/evolution'
import type { EvolutionCandidateStatus, EvolutionContributionItem } from '@/interfaces/settings/evolution/model'
import { useEvolutionContributions } from '@/hooks/useSettingsEvolution'

defineOptions({ name: 'EvolutionContributionModal' })

type StatusTone = 'success' | 'error' | 'muted'

/** 只给结果态上色：已上架为成功，已拒绝、已回滚为失败，其余过程态统一弱化。 */
const STATUS_TONE: Partial<Record<EvolutionCandidateStatus, StatusTone>> = {
  active: 'success',
  rejected: 'error',
  rolled_back: 'error',
}

const open = defineModel<boolean>('open', { required: true })

const { data, loading, error, load } = useEvolutionContributions()

watch(open, (value) => {
  if (value) void load()
}, { immediate: true })

const candidates = computed(() => data.value?.candidates ?? [])

const stats = computed(() => (data.value
  ? [
      { label: '已贡献证据', value: data.value.contributed_episodes },
      { label: '仅自己可见', value: data.value.private_episodes },
      { label: '记忆条目', value: data.value.memory_written },
      { label: '促成的能力', value: candidates.value.length },
    ]
  : []))

function kindOf(item: EvolutionContributionItem) {
  return EVOLUTION_KIND_META[item.target_kind] ?? { label: item.target_kind, icon: 'i-lucide-sparkles' }
}

function statusOf(item: EvolutionContributionItem) {
  return {
    label: EVOLUTION_STATUS_META[item.status]?.label ?? item.status,
    tone: STATUS_TONE[item.status] ?? 'muted',
  }
}
</script>

<template>
  <UModal v-model:open="open" title="本账号促成的能力进化" :ui="{ content: 'sm:max-w-[640px]' }">
    <template #body>
      <div v-if="loading && !data" :class="$style.state">
        <UIcon name="i-lucide-loader-circle" class="animate-spin" />
        <span>正在加载…</span>
      </div>

      <div v-else-if="error" :class="$style.state">
        <span :class="$style.error">{{ error }}</span>
        <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" label="重试" @click="load" />
      </div>

      <div v-else-if="data" :class="$style.body">
        <dl :class="$style.stats">
          <div v-for="stat in stats" :key="stat.label" :class="$style.stat">
            <dt>{{ stat.label }}</dt>
            <dd>{{ stat.value }}</dd>
          </div>
        </dl>

        <UEmpty v-if="!candidates.length" variant="naked" icon="i-lucide-clock" title="还没有由你的对话促成的能力" />

        <ul v-else :class="[$style.rows, $style.list]">
          <li v-for="item in candidates" :key="item.candidate_id" :class="$style.row">
            <UIcon :name="kindOf(item).icon" :class="$style.kindIcon" />
            <div :class="$style.rowMain">
              <span :class="$style.rowTitle">{{ item.summary || '（无说明）' }}</span>
              <span :class="$style.rowMeta">
                {{ kindOf(item).label }} · 你的 {{ item.your_episodes }} 次对话 · 共 {{ item.total_evidence }} 条证据
              </span>
            </div>
            <span :class="$style.statusText" :data-tone="statusOf(item).tone">{{ statusOf(item).label }}</span>
          </li>
        </ul>

        <p :class="$style.note">候选需经审核与验证才会正式生效；关闭进化后，此前已贡献的证据不会自动撤回。</p>
      </div>
    </template>
  </UModal>
</template>

<style module src="./index.module.css"></style>
