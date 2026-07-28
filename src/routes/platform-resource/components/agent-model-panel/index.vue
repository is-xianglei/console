<script setup lang="ts">
import { computed } from 'vue'
import { MODEL_OPTIONS } from '@/constants/agent'
import type { AgentConfig, ModelPreset } from '@/interfaces/agent/model'

defineOptions({ name: 'AgentModelPanel' })

const props = defineProps<{ agent: AgentConfig }>()
const primaryModel = computed(() => MODEL_OPTIONS.find((model) => model.id === props.agent.model.primaryModelId))
const modelItems = MODEL_OPTIONS.map((model) => ({ ...model, value: model.id, label: model.name, disabled: !model.healthy }))

const presets: Array<{ id: ModelPreset; label: string; hint: string; temperature: number }> = [
  { id: 'precise', label: '精确', hint: '稳定、低随机性', temperature: 0.2 },
  { id: 'balanced', label: '均衡', hint: '适合通用任务', temperature: 0.4 },
  { id: 'creative', label: '创意', hint: '更多样化表达', temperature: 0.75 },
]
const presetOptions = presets.map((preset) => ({ value: preset.id, label: preset.label, title: preset.hint }))
const fallbackOptions = computed(() => [
  { value: '', label: '不设置' },
  ...MODEL_OPTIONS
    .filter((model) => model.healthy && model.id !== props.agent.model.primaryModelId)
    .map((model) => ({ value: model.id, label: model.name })),
])

function handlePresetChoice(preset: typeof presets[number]) {
  props.agent.model.preset = preset.id
  props.agent.model.temperature = preset.temperature
}

function onPresetChange(value: string | number) {
  const preset = presets.find((item) => item.id === value)
  if (preset) handlePresetChoice(preset)
}
</script>

<template>
  <section :class="$style['ag-editor-section']" aria-labelledby="agent-model-title">
    <header :class="$style['ag-section-head']">
      <span :class="$style['ag-section-icon']"><i class="icon icon-cpu"></i></span>
      <div><span>03</span><h2 id="agent-model-title">模型</h2><p>从工作区已批准的模型目录中选择推理路由。</p></div>
    </header>
    <URadioGroup
      v-model="agent.model.primaryModelId"
      :class="[$style['ag-model-list'], $style['ag-model-radio-group']]"
      legend="主模型"
      name="primary-model"
      :items="modelItems"
      variant="card"
      required
      :ui="{ fieldset: $style['ag-model-list-grid'], item: $style['ag-model-option'], wrapper: $style['ag-model-content'] }"
    >
      <template #label="{ item: model }">
        <span :class="$style['ag-model-main']"><strong>{{ model.name }}</strong><small>{{ model.provider }} · {{ model.location }}</small></span>
        <span :class="$style['ag-model-meta']"><strong class="mono">{{ model.context }}</strong><small>{{ model.latency }} · {{ model.cost }}</small></span>
        <span :class="$style['ag-health']"><span class="dot" :class="model.healthy ? 'nominal' : 'warning'"></span>{{ model.healthy ? '健康' : '降级中' }}</span>
      </template>
    </URadioGroup>
    <UForm :class="[$style['ag-form-grid'], $style['ag-model-settings'], $style['ag-form']]" :state="agent.model">
      <UFormField :class="$style['ag-field']" label="回退模型" name="fallbackModelId"><USelect v-model="agent.model.fallbackModelId" :items="fallbackOptions" /></UFormField>
      <UFormField :class="$style['ag-field']" label="生成预设" name="preset"><UTabs :class="$style['ag-segmented']" :model-value="agent.model.preset" :items="presetOptions" :content="false" size="sm" @update:model-value="onPresetChange" /></UFormField>
      <UFormField :class="$style['ag-field']" name="temperature"><template #label><span>随机性 <em class="mono">{{ agent.model.temperature.toFixed(2) }}</em></span></template><USlider v-model="agent.model.temperature" :min="0" :max="1" :step="0.05" tooltip /></UFormField>
      <UFormField :class="$style['ag-field']" label="最大输出 Token" name="maxOutputTokens"><UInputNumber v-model="agent.model.maxOutputTokens" :min="512" :max="16384" :step="512" /></UFormField>
    </UForm>
    <div v-if="primaryModel" :class="$style['ag-effective-line']"><i class="icon icon-route"></i><span>有效路由</span><strong>{{ primaryModel.name }}</strong><i class="icon icon-arrow-right"></i><span>{{ agent.model.fallbackModelId ? MODEL_OPTIONS.find((item) => item.id === agent.model.fallbackModelId)?.name : '无回退' }}</span></div>
  </section>
</template>

<style module src="./index.module.css"></style>
