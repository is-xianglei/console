<script setup lang="ts">
import { APPROVAL_GROUPS } from '@/constants/agent'
import type { AgentConfig } from '@/interfaces/agent/model'

defineOptions({ name: 'AgentPolicyPanel' })

const props = defineProps<{ agent: AgentConfig }>()
const approvalOptions = APPROVAL_GROUPS.map((group) => ({ value: group, label: group }))

type NumericPolicyKey = 'timeoutSeconds' | 'maxSteps' | 'maxToolCalls' | 'dailyTokenBudget'

function onLimitUpdate(key: NumericPolicyKey, value: number | null) {
  if (value !== null) props.agent[key] = value
}
</script>

<template>
  <section :class="$style['ag-editor-section']" aria-labelledby="agent-policy-title">
    <header :class="$style['ag-section-head']">
      <span :class="$style['ag-section-icon']"><i class="icon icon-shield-check"></i></span>
      <div><span>05</span><h2 id="agent-policy-title">权限与运行</h2><p>配置人工审批、执行边界和软配额。</p></div>
    </header>
    <div :class="$style['ag-policy-banner']"><i class="icon icon-badge-check"></i><span><strong>有效权限遵循最小权限原则</strong><small>调用者权限 ∩ Agent 授权 ∩ 工作区策略；任何一层拒绝都会阻断调用。</small></span><span class="mono">DENY WINS</span></div>
    <div :class="$style['ag-switch-row']">
      <span><strong>启用人工审批</strong><small>执行“需审批”的工具前暂停运行并通知审批组。</small></span>
      <USwitch v-model="agent.highRiskApproval" aria-label="启用人工审批" />
    </div>
    <UForm :class="$style['ag-form']" :state="agent"><UFormField :class="$style['ag-field']" label="默认审批组" name="approvalGroup"><USelect v-model="agent.approvalGroup" :items="approvalOptions" :disabled="!agent.highRiskApproval" /></UFormField></UForm>
    <div :class="$style['ag-subsection-title']"><span>运行限制</span><small>只能在工作区硬上限以内调整</small></div>
    <UForm :class="[$style['ag-form-grid'], $style['ag-form']]" :state="agent">
      <UFormField :class="$style['ag-field']" label="单次超时" name="timeoutSeconds"><div :class="$style['ag-number-control']"><UInputNumber :model-value="agent.timeoutSeconds" :min="30" :max="600" :step="30" @update:model-value="onLimitUpdate('timeoutSeconds', $event)" /><span>秒</span></div></UFormField>
      <UFormField :class="$style['ag-field']" label="最大执行步骤" name="maxSteps"><div :class="$style['ag-number-control']"><UInputNumber :model-value="agent.maxSteps" :min="1" :max="50" @update:model-value="onLimitUpdate('maxSteps', $event)" /><span>步</span></div></UFormField>
      <UFormField :class="$style['ag-field']" label="最大工具调用" name="maxToolCalls"><div :class="$style['ag-number-control']"><UInputNumber :model-value="agent.maxToolCalls" :min="0" :max="100" @update:model-value="onLimitUpdate('maxToolCalls', $event)" /><span>次</span></div></UFormField>
      <UFormField :class="$style['ag-field']" label="每日 Token 预算" name="dailyTokenBudget"><div :class="$style['ag-number-control']"><UInputNumber :model-value="agent.dailyTokenBudget" :min="10000" :max="5000000" :step="10000" @update:model-value="onLimitUpdate('dailyTokenBudget', $event)" /><span>Token</span></div></UFormField>
    </UForm>
    <div :class="$style['ag-hard-limits']">
      <div><span>网络出口</span><strong><i class="icon icon-lock-keyhole"></i>受控域名</strong></div>
      <div><span>数据驻留</span><strong><i class="icon icon-lock-keyhole"></i>华东数据域</strong></div>
      <div><span>代码执行</span><strong><i class="icon icon-lock-keyhole"></i>隔离沙箱</strong></div>
    </div>
  </section>
</template>

<style module src="./index.module.css"></style>
