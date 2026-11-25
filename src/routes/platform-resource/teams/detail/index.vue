<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { DropdownMenuItem } from '@nuxt/ui'
import { RelativeTime } from '@/components'
import { useTeamWriteAccess } from '@/hooks/useTeamEditor'
import { hasDeletedTeamAgent, useTeamActions } from '@/hooks/useTeamManager'
import type { TeamDefinitionMemberResponse, TeamDefinitionResponse } from '@/interfaces/team-definition/api'
import { useAgentsStore } from '@/stores/agents'
import { useTeamsStore } from '@/stores/teams'

defineOptions({ name: 'TeamResourceDetail' })

const route = useRoute()
const router = useRouter()
const teamsStore = useTeamsStore()
const agentsStore = useAgentsStore()
const actions = useTeamActions()
const canManage = useTeamWriteAccess()

const loading = ref(false)
const notFound = ref(false)
const loadError = ref('')
const detail = ref<TeamDefinitionResponse | null>(null)

const teamId = computed(() => {
  const value = route.params.id
  return Number(Array.isArray(value) ? value[0] : value)
})
/** 优先读 store：启停后的新状态会写回 store。 */
const team = computed<TeamDefinitionResponse | null>(
  () => teamsStore.state.items.find((item) => item.id === teamId.value) ?? detail.value,
)
const deletedAgent = computed(() => Boolean(team.value && hasDeletedTeamAgent(team.value)))

const menuItems = computed<DropdownMenuItem[][]>(() => {
  const current = team.value
  if (!current) return []
  return [[
    { label: '复制', icon: 'i-lucide-copy', onSelect: goToDuplicate },
    { label: '删除', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => actions.requestDelete(current) },
  ]]
})

/** 成员 Agent 的状态：已删除看 agent_name，已停用用 Agent 列表反查。 */
function agentState(member: TeamDefinitionMemberResponse): 'deleted' | 'disabled' | 'ok' {
  if (member.agent_name == null) return 'deleted'
  const agent = agentsStore.state.items.find((item) => item.id === member.agent_id)
  return agent && !agent.is_enabled ? 'disabled' : 'ok'
}

async function load() {
  notFound.value = false
  loadError.value = ''
  detail.value = null
  if (!Number.isInteger(teamId.value) || teamId.value <= 0) {
    notFound.value = true
    return
  }
  loading.value = true
  if (!agentsStore.state.items.length && !agentsStore.state.loading) void agentsStore.loadAgents()
  const result = await teamsStore.loadTeamDetail(teamId.value)
  loading.value = false
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

watch(teamId, () => { void load() }, { immediate: true })

function goToList() {
  void router.push({ name: 'platform-resource', params: { module: 'build', resource: 'teams' } })
}

function goToEdit() {
  void router.push({ name: 'team-edit', params: { id: String(teamId.value) } })
}

function goToDuplicate() {
  void router.push({ name: 'team-create', query: { duplicate: String(teamId.value) } })
}

function onToggle(value: boolean) {
  if (team.value) void actions.toggleEnabled(team.value, value)
}

async function onDeleteConfirm() {
  if (await actions.confirmDelete()) goToList()
}
</script>

<template>
  <main :class="$style.page">
    <div :class="$style.inner">
      <header :class="$style.toolbar">
        <UButton icon="i-lucide-arrow-left" label="Teams" color="neutral" variant="ghost" @click="goToList" />
        <div v-if="team && canManage && !notFound && !loadError" :class="$style.actions">
          <USwitch
            :model-value="team.is_enabled"
            :disabled="actions.isToggling(team.id)"
            :loading="actions.isToggling(team.id)"
            :aria-label="`${team.is_enabled ? '停用' : '启用'} ${team.name}`"
            @update:model-value="onToggle"
          />
          <UButton icon="i-lucide-pencil" label="编辑" color="primary" @click="goToEdit" />
          <UDropdownMenu :items="menuItems">
            <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" square aria-label="更多操作" />
          </UDropdownMenu>
        </div>
      </header>

      <div v-if="loading && !team" :class="$style.skeletons" aria-busy="true">
        <USkeleton :class="$style.skeletonHero" />
        <USkeleton :class="$style.skeleton" />
        <USkeleton :class="$style.skeleton" />
      </div>

      <UEmpty v-else-if="notFound" :class="$style.empty" variant="naked" icon="i-lucide-users-round" title="Team 不存在">
        <template #actions>
          <UButton icon="i-lucide-arrow-left" label="返回列表" color="neutral" variant="outline" @click="goToList" />
        </template>
      </UEmpty>

      <UEmpty v-else-if="loadError" :class="$style.empty" variant="naked" icon="i-lucide-cloud-off" title="Team 加载失败" :description="loadError">
        <template #actions>
          <UButton icon="i-lucide-refresh-cw" label="重试" color="neutral" variant="outline" @click="load" />
        </template>
      </UEmpty>

      <template v-else-if="team">
        <section :class="$style.hero">
          <UAvatar :class="$style.avatar" icon="i-lucide-users-round" size="xl" />
          <div :class="$style.heroText">
            <h1 :class="$style.name">{{ team.name }}</h1>
            <p v-if="team.description" :class="$style.description">{{ team.description }}</p>
          </div>
        </section>

        <section :class="$style.group">
          <h2 :class="$style.groupTitle">成员<span :class="$style.count">{{ team.members.length }}</span></h2>
          <UAlert
            v-if="deletedAgent"
            color="error"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            title="有成员的 Agent 已删除，重新选择后才能用这个 Team 新建会话"
            :actions="canManage ? [{ label: '去编辑', color: 'neutral', variant: 'outline', onClick: goToEdit }] : undefined"
          />
          <UCard :ui="{ body: 'py-0 sm:py-0' }">
            <ul :class="$style.rows">
              <li v-for="member in team.members" :key="member.name" :class="$style.row">
                <div :class="$style.rowMain">
                  <span :class="[$style.memberName, 'mono']">{{ member.name }}</span>
                  <span :class="$style.rowMeta">{{ member.role }}</span>
                </div>
                <span v-if="agentState(member) === 'deleted'" :class="$style.agent" data-tone="error">
                  <UIcon name="i-lucide-triangle-alert" :class="$style.status" data-tone="error" />Agent 已删除
                </span>
                <span v-else :class="$style.agent">
                  <UIcon name="i-lucide-bot" :class="$style.status" />{{ member.agent_name }}
                  <UTooltip v-if="agentState(member) === 'disabled'" text="Agent 已停用">
                    <UIcon name="i-lucide-circle-pause" :class="$style.status" data-tone="warning" />
                    <span class="sr-only">Agent 已停用</span>
                  </UTooltip>
                </span>
              </li>
            </ul>
          </UCard>
        </section>

        <section :class="$style.group">
          <h2 :class="$style.groupTitle">设置</h2>
          <UCard :ui="{ body: 'py-0 sm:py-0' }">
            <dl :class="$style.rows">
              <div :class="$style.row">
                <dt :class="$style.rowLabel">状态</dt>
                <dd :class="$style.value">{{ team.is_enabled ? '已启用' : '已停用' }}</dd>
              </div>
              <div :class="$style.row">
                <dt :class="$style.rowLabel">创建</dt>
                <dd :class="$style.value"><RelativeTime :value="team.created_at" mode="absolute" /></dd>
              </div>
              <div :class="$style.row">
                <dt :class="$style.rowLabel">更新</dt>
                <dd :class="$style.value"><RelativeTime :value="team.updated_at" /></dd>
              </div>
            </dl>
          </UCard>
        </section>
      </template>
    </div>

    <UModal
      :open="actions.pendingDelete.value !== null"
      :title="actions.pendingDelete.value ? `删除 ${actions.pendingDelete.value.name}？` : '删除 Team？'"
      description="删除后无法恢复，已经用它建好的会话不受影响。"
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
