<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { DropdownMenuItem } from '@nuxt/ui'
import { MarketSubmitButton, RelativeTime } from '@/components'
import { useAgentActions } from '@/hooks/useAgentActions'
import type { AgentResponse } from '@/interfaces/agent/api'
import { useAgentsStore } from '@/stores/agents'
import { renderMarkdown } from '@/utils/markdown'

defineOptions({ name: 'AgentResourceDetail' })

const route = useRoute()
const router = useRouter()
const agentsStore = useAgentsStore()
const actions = useAgentActions()

const loading = ref(false)
const notFound = ref(false)
/** 网络错误、5xx 等加载失败的提示；与 404 的「不存在」分开显示，可重试。 */
const loadError = ref('')
const detail = ref<AgentResponse | null>(null)

const agentId = computed(() => {
  const value = route.params.id
  return Number(Array.isArray(value) ? value[0] : value)
})
/** 详情接口的结果会写回 store.items；优先读 store，启停开关的乐观更新才能反映到这里。 */
const agent = computed<AgentResponse | null>(
  () => agentsStore.state.items.find((item) => item.id === agentId.value) ?? detail.value,
)

const skillNames = computed(() => new Map(agentsStore.state.skills.map((skill) => [skill.id, skill.name])))
const toolNames = computed(() => new Map(agentsStore.state.tools.map((tool) => [tool.id, tool.name])))
/** 目录里找不到的 id（目录加载失败或已删除）退回显示 #id。 */
const skills = computed(() => (agent.value?.skill_ids ?? []).map((id) => ({ id, name: skillNames.value.get(id) ?? `#${id}` })))
const tools = computed(() => (agent.value?.tool_ids ?? []).map((id) => ({ id, name: toolNames.value.get(id) ?? `#${id}` })))
const promptHtml = computed(() => (agent.value?.system_prompt ? renderMarkdown(agent.value.system_prompt) : ''))

const menuItems = computed<DropdownMenuItem[][]>(() => {
  const current = agent.value
  if (!current) return []
  return [
    [{ label: '复制', icon: 'i-lucide-copy', onSelect: goToDuplicate }],
    [{ label: '删除', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => actions.requestDelete(current) }],
  ]
})

async function load() {
  notFound.value = false
  loadError.value = ''
  detail.value = null
  if (!Number.isInteger(agentId.value)) {
    notFound.value = true
    return
  }
  loading.value = true
  // 技能 / 工具名称来自能力目录，与详情并行加载。
  const [result] = await Promise.all([
    agentsStore.loadAgentDetail(agentId.value),
    agentsStore.loadCatalogs(),
  ])
  loading.value = false
  // undefined：请求期间切换了工作区，结果作废。
  if (result === undefined) return
  if (result.status === 'not-found') {
    notFound.value = true
    return
  }
  if (result.status === 'error') {
    loadError.value = result.message
    return
  }
  detail.value = result.item
}

watch(agentId, () => { void load() }, { immediate: true })

function goToList() {
  void router.push({ name: 'platform-resource', params: { module: 'build', resource: 'agents' } })
}

function goToEdit() {
  void router.push({ name: 'agent-edit', params: { id: String(agentId.value) } })
}

function goToDuplicate() {
  void router.push({ name: 'agent-create', params: { module: 'build', resource: 'agents' }, query: { duplicate: String(agentId.value) } })
}

function onToggle(value: boolean) {
  if (agent.value) void actions.toggleEnabled(agent.value, value)
}

async function onDeleteConfirm() {
  if (await actions.confirmDelete()) goToList()
}
</script>

<template>
  <main :class="$style.page">
    <div :class="$style.inner">
      <header :class="$style.toolbar">
        <UButton icon="i-lucide-arrow-left" label="智能体" color="neutral" variant="ghost" @click="goToList" />
        <div v-if="agent && !notFound && !loadError" :class="$style.actions">
          <USwitch
            :model-value="agent.is_enabled"
            :disabled="actions.isToggling(agent.id)"
            :loading="actions.isToggling(agent.id)"
            :aria-label="`${agent.is_enabled ? '停用' : '启用'} ${agent.name}`"
            @update:model-value="onToggle"
          />
          <MarketSubmitButton kind="agent" :source-id="agent.id" />
          <UButton icon="i-lucide-pencil" label="编辑" color="primary" @click="goToEdit" />
          <UDropdownMenu :items="menuItems">
            <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" square aria-label="更多操作" />
          </UDropdownMenu>
        </div>
      </header>

      <div v-if="loading && !agent" :class="$style.skeletons" aria-busy="true">
        <USkeleton :class="$style.skeletonHero" />
        <USkeleton :class="$style.skeleton" />
        <USkeleton :class="$style.skeleton" />
      </div>

      <UEmpty v-else-if="notFound" :class="$style.empty" variant="naked" icon="i-lucide-bot-off" title="智能体不存在">
        <template #actions>
          <UButton icon="i-lucide-arrow-left" label="返回列表" color="neutral" variant="outline" @click="goToList" />
        </template>
      </UEmpty>

      <UEmpty v-else-if="loadError" :class="$style.empty" variant="naked" icon="i-lucide-cloud-off" title="智能体加载失败" :description="loadError">
        <template #actions>
          <UButton icon="i-lucide-refresh-cw" label="重试" color="neutral" variant="outline" @click="load" />
        </template>
      </UEmpty>

      <template v-else-if="agent">
        <section :class="$style.hero">
          <UAvatar :class="$style.avatar" icon="i-lucide-bot" size="xl" />
          <div :class="$style.heroText">
            <h1 :class="$style.name">{{ agent.name }}</h1>
            <p v-if="agent.description" :class="$style.description">{{ agent.description }}</p>
          </div>
        </section>

        <section v-if="promptHtml" :class="$style.group">
          <h2 :class="$style.groupTitle">系统提示词</h2>
          <div :class="$style.card">
            <div :class="[$style.cardBody, $style.prompt, 'md']" v-html="promptHtml"></div>
          </div>
        </section>

        <section :class="$style.group">
          <h2 :class="$style.groupTitle">能力</h2>
          <div :class="$style.card">
            <div :class="$style.rows">
              <div :class="$style.row">
                <span :class="$style.rowLabel">技能</span>
                <div :class="$style.chips">
                  <RouterLink v-for="skill in skills" :key="skill.id" :class="$style.chipLink" :to="{ name: 'skill-detail', params: { id: String(skill.id) } }">
                    <UBadge :label="skill.name" color="neutral" variant="soft" size="xs" />
                  </RouterLink>
                  <span v-if="!skills.length" :class="$style.none">无</span>
                </div>
              </div>
              <div :class="$style.row">
                <span :class="$style.rowLabel">工具</span>
                <div :class="$style.chips">
                  <UBadge v-for="tool in tools" :key="tool.id" :label="tool.name" color="neutral" variant="soft" size="xs" />
                  <span v-if="!tools.length" :class="$style.none">无</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section :class="$style.group">
          <h2 :class="$style.groupTitle">信息</h2>
          <div :class="$style.card">
            <dl :class="$style.rows">
              <div :class="$style.row">
                <dt :class="$style.rowLabel">模型</dt>
                <dd :class="$style.value">{{ agent.model_name || '默认模型' }}</dd>
              </div>
              <div :class="$style.row">
                <dt :class="$style.rowLabel">创建</dt>
                <dd :class="$style.value"><RelativeTime :value="agent.created_at" mode="absolute" /></dd>
              </div>
              <div :class="$style.row">
                <dt :class="$style.rowLabel">更新</dt>
                <dd :class="$style.value"><RelativeTime :value="agent.updated_at" /></dd>
              </div>
            </dl>
          </div>
        </section>
      </template>
    </div>

    <UModal
      :open="actions.pendingDelete.value !== null"
      :title="actions.pendingDelete.value ? `删除 ${actions.pendingDelete.value.name}？` : '删除智能体？'"
      description="删除后无法恢复。"
      @update:open="(open: boolean) => { if (!open) actions.cancelDelete() }"
    >
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" :disabled="actions.deleting.value" @click="actions.cancelDelete" />
        <UButton label="删除" color="error" :loading="actions.deleting.value" :disabled="actions.deleting.value" @click="onDeleteConfirm" />
      </template>
    </UModal>
  </main>
</template>

<style module src="./index.module.css"></style>
