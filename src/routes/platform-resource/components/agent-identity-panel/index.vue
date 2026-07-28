<script setup lang="ts">
import { computed } from 'vue'
import { AGENT_OWNERS } from '@/constants/agent'
import type { AgentConfig } from '@/interfaces/agent/model'

defineOptions({ name: 'AgentIdentityPanel' })

const props = defineProps<{ agent: AgentConfig }>()
const ownerOptions = AGENT_OWNERS.map((owner) => ({ value: owner, label: owner }))
const visibilityOptions = [
  { value: 'workspace', label: '当前工作区' },
  { value: 'team', label: '指定团队' },
  { value: 'private', label: '仅创建者' },
]

const tagsText = computed({
  get: () => props.agent.tags.join(', '),
  set: (value: string) => { props.agent.tags = value.split(',').map((tag) => tag.trim()).filter(Boolean) },
})
</script>

<template>
  <section :class="$style['ag-editor-section']" aria-labelledby="agent-identity-title">
    <header :class="$style['ag-section-head']">
      <span :class="$style['ag-section-icon']"><i class="icon icon-id-card"></i></span>
      <div><span>01</span><h2 id="agent-identity-title">基本信息</h2><p>定义 Agent 的身份、归属和可见范围。</p></div>
    </header>
    <UForm :class="[$style['ag-form-grid'], $style['ag-form']]" :state="agent">
      <UFormField :class="$style['ag-field']" label="名称" name="name" required><UInput v-model="agent.name" autocomplete="off" placeholder="例如：设备诊断 Agent" /></UFormField>
      <UFormField :class="$style['ag-field']" label="唯一标识" name="slug" required help="仅支持小写字母、数字和连字符。"><UInput v-model="agent.slug" class="mono" autocomplete="off" placeholder="equipment-diagnosis" /></UFormField>
      <UFormField :class="$style['ag-field']" label="负责人" name="owner"><USelect v-model="agent.owner" :items="ownerOptions" /></UFormField>
      <UFormField :class="$style['ag-field']" label="可见范围" name="visibility"><USelect v-model="agent.visibility" :items="visibilityOptions" /></UFormField>
      <UFormField :class="[$style['ag-field'], $style['ag-span-2']]" label="用途描述" name="description"><UTextarea v-model="agent.description" :rows="3" autoresize :maxrows="6" placeholder="说明 Agent 解决什么问题，以及不应该处理什么任务。" /></UFormField>
      <UFormField :class="[$style['ag-field'], $style['ag-span-2']]" label="标签" help="标签用于搜索、目录分组和策略匹配。"><UInput v-model="tagsText" placeholder="设备可靠性, 生产" /></UFormField>
    </UForm>
  </section>
</template>

<style module src="./index.module.css"></style>
