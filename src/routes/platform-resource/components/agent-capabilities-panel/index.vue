<script setup lang="ts">
import { computed, ref } from 'vue'
import { BUILTIN_TOOLS, MCP_SERVER_OPTIONS, SKILL_OPTIONS } from '@/constants/agent'
import type { AgentConfig, AgentToolBinding, McpServerOption, ToolOption, ToolPermission } from '@/interfaces/agent/model'

defineOptions({ name: 'AgentCapabilitiesPanel' })

const props = defineProps<{ agent: AgentConfig }>()
const activeTab = ref<'skills' | 'mcp' | 'tools'>('skills')
const capabilityTabs = computed(() => [
  { value: 'skills', label: 'Skills', icon: 'i-lucide-wrench', badge: props.agent.skills.length },
  { value: 'mcp', label: 'MCP', icon: 'i-lucide-server-cog', badge: props.agent.mcpServers.length },
  { value: 'tools', label: '工具', icon: 'i-lucide-hammer', badge: props.agent.tools.length },
])
const permissionOptions = [
  { value: 'allow', label: '允许' },
  { value: 'ask', label: '需审批' },
  { value: 'deny', label: '禁止' },
]

const selectedMcpTools = computed(() => MCP_SERVER_OPTIONS.flatMap((server) =>
  server.tools.filter((tool) => props.agent.mcpServers.some((binding) => binding.serverId === server.id && binding.toolIds.includes(tool.id)))
))

function isChecked(value: boolean | 'indeterminate') {
  return value === true
}

function hasSkill(skillId: string) {
  return props.agent.skills.some((binding) => binding.skillId === skillId)
}

function onSkillToggle(skillId: string, version: string, checked: boolean | 'indeterminate') {
  if (isChecked(checked) && !hasSkill(skillId)) props.agent.skills.push({ skillId, version })
  if (!isChecked(checked)) props.agent.skills = props.agent.skills.filter((binding) => binding.skillId !== skillId)
}

function serverBinding(serverId: string) {
  return props.agent.mcpServers.find((binding) => binding.serverId === serverId)
}

function onServerToggle(server: McpServerOption, checked: boolean | 'indeterminate') {
  if (isChecked(checked) && !serverBinding(server.id)) props.agent.mcpServers.push({ serverId: server.id, toolIds: [] })
  if (!isChecked(checked)) {
    const serverToolIds = new Set(server.tools.map((tool) => tool.id))
    props.agent.mcpServers = props.agent.mcpServers.filter((binding) => binding.serverId !== server.id)
    props.agent.tools = props.agent.tools.filter((binding) => !serverToolIds.has(binding.toolId))
  }
}

function hasMcpTool(serverId: string, toolId: string) {
  return serverBinding(serverId)?.toolIds.includes(toolId) ?? false
}

function defaultPermission(tool: ToolOption): ToolPermission {
  return tool.risk === 'high' ? 'ask' : 'allow'
}

function ensureToolBinding(tool: ToolOption): AgentToolBinding {
  let binding = props.agent.tools.find((item) => item.toolId === tool.id)
  if (!binding) {
    binding = { toolId: tool.id, permission: defaultPermission(tool) }
    props.agent.tools.push(binding)
  }
  return binding
}

function onMcpToolToggle(server: McpServerOption, tool: ToolOption, checked: boolean | 'indeterminate') {
  let binding = serverBinding(server.id)
  if (!binding) {
    binding = { serverId: server.id, toolIds: [] }
    props.agent.mcpServers.push(binding)
  }
  if (isChecked(checked) && !binding.toolIds.includes(tool.id)) {
    binding.toolIds.push(tool.id)
    ensureToolBinding(tool)
  }
  if (!isChecked(checked)) {
    binding.toolIds = binding.toolIds.filter((id) => id !== tool.id)
    props.agent.tools = props.agent.tools.filter((item) => item.toolId !== tool.id)
  }
}

function hasBuiltinTool(toolId: string) {
  return props.agent.tools.some((binding) => binding.toolId === toolId)
}

function onBuiltinToolToggle(tool: ToolOption, checked: boolean | 'indeterminate') {
  if (isChecked(checked)) ensureToolBinding(tool)
  else props.agent.tools = props.agent.tools.filter((binding) => binding.toolId !== tool.id)
}

function permissionOf(toolId: string): ToolPermission {
  return props.agent.tools.find((binding) => binding.toolId === toolId)?.permission ?? 'deny'
}

function onPermissionChange(tool: ToolOption, permission: ToolPermission) {
  ensureToolBinding(tool).permission = permission
}
</script>

<template>
  <section :class="$style['ag-editor-section']" aria-labelledby="agent-capabilities-title">
    <header :class="$style['ag-section-head']">
      <span :class="$style['ag-section-icon']"><i class="icon icon-blocks"></i></span>
      <div><span>04</span><h2 id="agent-capabilities-title">能力</h2><p>绑定工作方法、连接来源和具体可调用工具。</p></div>
    </header>
    <UTabs v-model="activeTab" :class="$style['ag-capability-tabs']" :items="capabilityTabs" :content="false" variant="link" aria-label="能力配置类型" />

    <div v-if="activeTab === 'skills'" :class="$style['ag-capability-pane']">
      <div :class="$style['ag-pane-intro']"><span><strong>选择已审核 Skill</strong><small>发布时固定版本，并检查所需工具是否已经授权。</small></span><UButton variant="link" icon="i-lucide-package-open" label="技能包管理" :class="$style['ag-link-button']" /></div>
      <label v-for="skill in SKILL_OPTIONS" :key="skill.id" :class="[$style['ag-select-row'], { [$style.selected]: hasSkill(skill.id) }]">
        <UCheckbox :model-value="hasSkill(skill.id)" @update:model-value="onSkillToggle(skill.id, skill.version, $event)" />
        <span :class="$style['ag-select-icon']"><i class="icon icon-wrench"></i></span>
        <span :class="$style['ag-select-main']"><strong class="mono">{{ skill.name }}</strong><small>{{ skill.description }}</small></span>
        <span :class="$style['ag-select-meta']"><strong class="mono">v{{ skill.version }}</strong><small>{{ skill.requiredToolIds.length }} 个工具依赖</small></span>
        <span :class="[$style['ag-verify'], { [$style.pending]: !skill.verified }]"><i :class="`icon icon-${skill.verified ? 'badge-check' : 'clock-3'}`"></i>{{ skill.verified ? '已校验' : '待校验' }}</span>
      </label>
    </div>

    <div v-else-if="activeTab === 'mcp'" :class="$style['ag-capability-pane']">
      <div :class="$style['ag-pane-intro']"><span><strong>选择连接和工具</strong><small>绑定 Server 不会自动开放工具，每个 Tool 必须单独选择。</small></span><span :class="[$style['ag-policy-note'], 'mono']"><i class="icon icon-key-round"></i> SECRET BY REFERENCE</span></div>
      <article v-for="server in MCP_SERVER_OPTIONS" :key="server.id" :class="[$style['ag-mcp-server'], { [$style.selected]: serverBinding(server.id), [$style.unavailable]: !server.healthy }]">
        <header>
          <UCheckbox :model-value="Boolean(serverBinding(server.id))" :disabled="!server.healthy" :aria-label="`绑定 ${server.name}`" @update:model-value="onServerToggle(server, $event)" />
          <span :class="$style['ag-select-icon']"><i class="icon icon-server-cog"></i></span>
          <span :class="$style['ag-select-main']"><strong class="mono">{{ server.name }}</strong><small>{{ server.description }}</small></span>
          <span :class="[$style['ag-server-meta'], 'mono']">{{ server.transport }} · {{ server.auth }}</span>
          <span :class="$style['ag-health']"><span class="dot" :class="server.healthy ? 'nominal' : 'warning'"></span>{{ server.healthy ? '已连接' : '连接异常' }}</span>
        </header>
        <div v-if="serverBinding(server.id)" :class="$style['ag-mcp-tools']">
          <label v-for="tool in server.tools" :key="tool.id">
            <UCheckbox :model-value="hasMcpTool(server.id, tool.id)" @update:model-value="onMcpToolToggle(server, tool, $event)" />
            <span><strong>{{ tool.name }}</strong><small>{{ tool.description }}</small></span>
            <em :class="tool.risk">{{ { low: '低风险', medium: '中风险', high: '高风险' }[tool.risk] }}</em>
          </label>
        </div>
      </article>
    </div>

    <div v-else :class="$style['ag-capability-pane']">
      <div :class="$style['ag-pane-intro']"><span><strong>有效工具权限</strong><small>允许直接调用；需审批会在执行前暂停；禁止会覆盖其他授权。</small></span></div>
      <div :class="$style['ag-tool-table']">
        <div :class="$style['ag-tool-head']"><span>工具</span><span>来源</span><span>风险</span><span>执行策略</span></div>
        <div v-for="tool in BUILTIN_TOOLS" :key="tool.id" :class="$style['ag-tool-row']">
          <label><UCheckbox :model-value="hasBuiltinTool(tool.id)" @update:model-value="onBuiltinToolToggle(tool, $event)" /><span><strong>{{ tool.name }}</strong><small>{{ tool.description }}</small></span></label>
          <span class="mono">BUILT-IN</span><em :class="tool.risk">{{ { low: '低', medium: '中', high: '高' }[tool.risk] }}</em>
          <USelect :model-value="permissionOf(tool.id)" :items="permissionOptions" :disabled="!hasBuiltinTool(tool.id)" :aria-label="`${tool.name} 执行策略`" @update:model-value="onPermissionChange(tool, $event as ToolPermission)" />
        </div>
        <div v-for="tool in selectedMcpTools" :key="tool.id" :class="$style['ag-tool-row']">
          <span :class="$style['ag-tool-name']"><span :class="[$style['ag-checkbox'], $style['selected']]"><i class="icon icon-check"></i></span><span><strong>{{ tool.name }}</strong><small>{{ tool.description }}</small></span></span>
          <span class="mono">MCP</span><em :class="tool.risk">{{ { low: '低', medium: '中', high: '高' }[tool.risk] }}</em>
          <USelect :model-value="permissionOf(tool.id)" :items="permissionOptions" :aria-label="`${tool.name} 执行策略`" @update:model-value="onPermissionChange(tool, $event as ToolPermission)" />
        </div>
      </div>
    </div>
  </section>
</template>

<style module src="./index.module.css"></style>
